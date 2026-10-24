import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import type { EditorHandle } from "../editor/Editor";
import type { ScriptLine } from "../editor/lineStyles";
import { isLineStyle } from "../editor/styles";
import { fromFountain, toFountain } from "../fountain/fountain";
import { FONT_PATHS, type FontFiles } from "../pdf/fonts";

const FILE_FILTERS = [{ name: "Fountain 시나리오", extensions: ["fountain", "spmd", "txt"] }];
const LAST_FILE_KEY = "dropkick.lastFile";
const BLANK_SCRIPT: ScriptLine[] = [{ style: "scene", text: "" }];

function fileTitle(path: string | null): string {
  if (!path) return "제목 없음";
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.(fountain|spmd|txt)$/i, "");
}

function rememberLastFile(path: string | null) {
  try {
    if (path) localStorage.setItem(LAST_FILE_KEY, path);
    else localStorage.removeItem(LAST_FILE_KEY);
  } catch {
    // 저장소를 못 써도 앱 동작에는 문제없다.
  }
}

function readLastFile(): string | null {
  try {
    return localStorage.getItem(LAST_FILE_KEY);
  } catch {
    return null;
  }
}

async function loadFonts(): Promise<FontFiles> {
  const entries = await Promise.all(
    Object.entries(FONT_PATHS).map(async ([key, path]) => {
      const response = await fetch(`/${path}`);
      if (!response.ok) throw new Error(`글꼴을 불러오지 못했습니다: ${path}`);
      return [key, new Uint8Array(await response.arrayBuffer())] as const;
    }),
  );
  return Object.fromEntries(entries) as FontFiles;
}

async function showError(text: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  await message(`${text}\n\n${detail}`, { title: "DropKick", kind: "error" });
}

/**
 * 원고 파일 열기/저장/새 문서, 메뉴 처리, 닫기 전 확인을 맡는다.
 * 브라우저 미리보기(개발용)에서는 파일 기능 없이 에디터만 동작한다.
 */
export function useScriptDocument(editorRef: RefObject<EditorHandle | null>) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [dirty, setDirtyState] = useState(false);
  const pathRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const titlePageRef = useRef<string | null>(null);
  const busyRef = useRef(false);

  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  }, []);

  const setPath = useCallback((path: string | null) => {
    pathRef.current = path;
    setFilePath(path);
    rememberLastFile(path);
  }, []);

  const writeTo = useCallback(
    async (path: string): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) return false;
      try {
        const contents = toFountain({ titlePage: titlePageRef.current, lines: editor.getLines() });
        await invoke("write_script", { path, contents });
        editor.markSaved();
        setPath(path);
        return true;
      } catch (error) {
        await showError("저장하지 못했습니다.", error);
        return false;
      }
    },
    [editorRef, setPath],
  );

  const saveAs = useCallback(async (): Promise<boolean> => {
    const chosen = await save({
      defaultPath: `${fileTitle(pathRef.current)}.fountain`,
      filters: FILE_FILTERS,
    });
    if (!chosen) return false;
    const path = /\.(fountain|spmd|txt)$/i.test(chosen) ? chosen : `${chosen}.fountain`;
    return writeTo(path);
  }, [writeTo]);

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    return pathRef.current ? writeTo(pathRef.current) : saveAs();
  }, [saveAs, writeTo]);

  /** 저장하지 않은 내용이 있으면 물어본다. 계속 진행해도 되면 true. */
  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    const answer = await message(
      `"${fileTitle(pathRef.current)}"의 변경 사항을 저장할까요?\n저장하지 않으면 변경 사항이 사라집니다.`,
      {
        title: "DropKick",
        kind: "warning",
        buttons: { yes: "저장", no: "저장 안 함", cancel: "취소" },
      },
    );
    if (answer === "저장" || answer === "Yes") return saveCurrent();
    return answer === "저장 안 함" || answer === "No";
  }, [saveCurrent]);

  const loadFile = useCallback(
    async (path: string): Promise<boolean> => {
      const text = await invoke<string>("read_script", { path });
      const doc = fromFountain(text);
      const lines = doc.lines.filter((l) => isLineStyle(l.style));
      editorRef.current?.load(lines);
      titlePageRef.current = doc.titlePage;
      setPath(path);
      return true;
    },
    [editorRef, setPath],
  );

  const openFile = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const chosen = await open({ multiple: false, directory: false, filters: FILE_FILTERS });
    if (typeof chosen !== "string") return;
    try {
      await loadFile(chosen);
    } catch (error) {
      await showError("파일을 열지 못했습니다.", error);
    }
  }, [confirmDiscard, loadFile]);

  const newFile = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    editorRef.current?.load(BLANK_SCRIPT);
    titlePageRef.current = null;
    setPath(null);
  }, [confirmDiscard, editorRef, setPath]);

  const exportPdf = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const chosen = await save({
      defaultPath: `${fileTitle(pathRef.current)}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!chosen) return;
    const path = /\.pdf$/i.test(chosen) ? chosen : `${chosen}.pdf`;
    try {
      // PDF 만드는 코드는 필요할 때만 불러온다. (앱 시작을 가볍게)
      const { buildPdf } = await import("../pdf/buildPdf");
      const bytes = await buildPdf(
        { titlePage: titlePageRef.current, lines: editor.getLines() },
        await loadFonts(),
      );
      await invoke("write_binary", bytes, { headers: { path: encodeURIComponent(path) } });
    } catch (error) {
      await showError("PDF를 만들지 못했습니다.", error);
    }
  }, [editorRef]);

  // 한 번에 하나의 파일 작업만 (대화상자가 겹치지 않게)
  const runExclusive = useCallback(async (task: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await task();
    } finally {
      busyRef.current = false;
      editorRef.current?.focus();
    }
  }, [editorRef]);

  // 메뉴, 창 닫기, 시작할 때 마지막 파일 열기
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const cleanups: Array<() => void> = [];
    let disposed = false;

    const handleMenu = (id: string) => {
      const editor = editorRef.current;
      if (id.startsWith("style:")) {
        const style = id.slice("style:".length);
        if (isLineStyle(style)) editor?.setStyle(style);
        return;
      }
      switch (id) {
        case "new":
          return runExclusive(newFile);
        case "open":
          return runExclusive(openFile);
        case "save":
          return runExclusive(saveCurrent);
        case "save_as":
          return runExclusive(saveAs);
        case "export_pdf":
          return runExclusive(exportPdf);
        case "close":
          return win.close();
        case "quit":
          return runExclusive(async () => {
            if (await confirmDiscard()) await invoke("quit_app");
          });
        case "undo":
          return editor?.undo();
        case "redo":
          return editor?.redo();
        case "find":
          return editor?.find();
      }
    };

    listen<string>("menu", (event) => handleMenu(event.payload)).then((unlisten) => {
      if (disposed) unlisten();
      else cleanups.push(unlisten);
    });

    win
      .onCloseRequested(async (event) => {
        if (!dirtyRef.current) return;
        if (busyRef.current) {
          event.preventDefault();
          return;
        }
        busyRef.current = true;
        try {
          if (!(await confirmDiscard())) event.preventDefault();
        } finally {
          busyRef.current = false;
        }
      })
      .then((unlisten) => {
        if (disposed) unlisten();
        else cleanups.push(unlisten);
      });

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, [confirmDiscard, editorRef, exportPdf, newFile, openFile, runExclusive, saveAs, saveCurrent]);

  useEffect(() => {
    if (!isTauri()) return;
    const last = readLastFile();
    if (!last) return;
    loadFile(last).catch(() => rememberLastFile(null));
    // 시작할 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = fileTitle(filePath);

  useEffect(() => {
    document.title = `${title}${dirty ? " — 수정됨" : ""} · DropKick`;
    if (isTauri()) getCurrentWindow().setTitle(document.title).catch(() => {});
  }, [title, dirty]);

  return { title, filePath, dirty, setDirty };
}
