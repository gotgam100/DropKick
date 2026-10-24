/**
 * 지금 열려 있는 작업(프로젝트 또는 .fountain 파일 하나)을 관리한다.
 * 열기/새 프로젝트/저장/다른 이름으로 저장/프로젝트로 만들기/PDF, 메뉴, 닫기 전 확인.
 *
 * - 프로젝트: 폴더(제목.dropkick) 안에 원고와 다른 문서들. 기본 방식
 * - 파일: 예전처럼 .fountain 파일 하나. "프로젝트로 만들기"로 바꿀 수 있다
 *
 * 브라우저 미리보기(개발용)에서는 파일 기능 없이 에디터만 동작한다.
 */
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
import {
  MANIFEST_FILE,
  PROJECT_EXTENSION,
  createProject,
  projectTitleFromPath,
  type ProjectManifest,
} from "./model";
import { loadProject, saveProject } from "./projectIO";
import { tauriFs } from "./tauriFs";

const SCRIPT_FILTERS = [{ name: "Fountain 시나리오", extensions: ["fountain", "spmd", "txt"] }];
const OPEN_FILTERS = [
  { name: "시나리오 또는 프로젝트", extensions: ["fountain", "spmd", "txt", "json"] },
];
const LAST_KEY = "dropkick.last";
const OLD_LAST_FILE_KEY = "dropkick.lastFile";

type Session =
  | {
      kind: "project";
      /** 아직 한 번도 저장하지 않은 새 프로젝트면 null */
      path: string | null;
      manifest: ProjectManifest;
      texts: Map<string, string>;
      titlePage: string | null;
    }
  | { kind: "file"; path: string | null; titlePage: string | null };

type Last = { kind: "project" | "file"; path: string };

function fileTitle(path: string | null): string {
  if (!path) return "제목 없음";
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.(fountain|spmd|txt)$/i, "");
}

function sessionTitle(session: Session): string {
  if (session.kind === "project") return session.manifest.title || "제목 없음";
  return fileTitle(session.path);
}

function rememberLast(last: Last | null) {
  try {
    if (last) localStorage.setItem(LAST_KEY, JSON.stringify(last));
    else localStorage.removeItem(LAST_KEY);
    localStorage.removeItem(OLD_LAST_FILE_KEY);
  } catch {
    // 저장소를 못 써도 앱 동작에는 문제없다.
  }
}

function readLast(): Last | null {
  try {
    const saved = localStorage.getItem(LAST_KEY);
    if (saved) {
      const value = JSON.parse(saved) as Last;
      if ((value.kind === "project" || value.kind === "file") && typeof value.path === "string") return value;
    }
    const old = localStorage.getItem(OLD_LAST_FILE_KEY);
    return old ? { kind: "file", path: old } : null;
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

function scriptLinesOf(text: string) {
  const doc = fromFountain(text);
  return { titlePage: doc.titlePage, lines: doc.lines.filter((l) => isLineStyle(l.style)) };
}

/** 새 프로젝트 폴더 위치를 고른다. 이미 있는 폴더/파일은 덮어쓰지 않는다. */
async function chooseNewProjectPath(name: string): Promise<string | null> {
  const chosen = await save({
    title: "새 프로젝트 저장",
    defaultPath: `${name}${PROJECT_EXTENSION}`,
  });
  if (!chosen) return null;
  const path = chosen.endsWith(PROJECT_EXTENSION) ? chosen : `${chosen}${PROJECT_EXTENSION}`;
  if ((await tauriFs.kind(path)) !== "none") {
    await message(
      `"${path.split("/").pop()}"이(가) 이미 있습니다.\n덮어쓰지 않도록 다른 이름을 골라 주세요.`,
      { title: "DropKick", kind: "warning" },
    );
    return null;
  }
  return path;
}

export function useProject(editorRef: RefObject<EditorHandle | null>, initialLines: ScriptLine[]) {
  const sessionRef = useRef<Session>(
    (() => {
      const { manifest, texts } = createProject("제목 없음", { titlePage: null, lines: initialLines });
      return { kind: "project", path: null, manifest, texts, titlePage: null } as Session;
    })(),
  );
  // 화면에 보여 줄 값 (sessionRef가 바뀔 때 함께 바꾼다)
  const [view, setView] = useState(() => ({
    title: sessionTitle(sessionRef.current),
    kind: sessionRef.current.kind,
    path: sessionRef.current.path,
  }));
  const [dirty, setDirtyState] = useState(false);
  const dirtyRef = useRef(false);
  const busyRef = useRef(false);

  const setDirty = useCallback((value: boolean) => {
    dirtyRef.current = value;
    setDirtyState(value);
  }, []);

  const setSession = useCallback((session: Session) => {
    sessionRef.current = session;
    setView({ title: sessionTitle(session), kind: session.kind, path: session.path });
    rememberLast(session.path ? { kind: session.kind, path: session.path } : null);
  }, []);

  const currentScriptText = () =>
    toFountain({ titlePage: sessionRef.current.titlePage, lines: editorRef.current?.getLines() ?? [] });

  // ---------- 저장 ----------

  const writeProjectTo = useCallback(
    async (path: string, all: boolean): Promise<boolean> => {
      const session = sessionRef.current;
      const editor = editorRef.current;
      if (session.kind !== "project" || !editor) return false;
      try {
        const manifest = { ...session.manifest, title: projectTitleFromPath(path) };
        const texts = new Map(session.texts);
        texts.set(manifest.mainScript, currentScriptText());
        await saveProject(tauriFs, path, manifest, texts, all ? undefined : new Set([manifest.mainScript]));
        editor.markSaved();
        setSession({ ...session, path, manifest, texts });
        return true;
      } catch (error) {
        await showError("프로젝트를 저장하지 못했습니다.", error);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorRef, setSession],
  );

  const writeFileTo = useCallback(
    async (path: string): Promise<boolean> => {
      const editor = editorRef.current;
      if (!editor) return false;
      try {
        await invoke("write_script", { path, contents: currentScriptText() });
        editor.markSaved();
        setSession({ kind: "file", path, titlePage: sessionRef.current.titlePage });
        return true;
      } catch (error) {
        await showError("저장하지 못했습니다.", error);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorRef, setSession],
  );

  const saveAs = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current;
    if (session.kind === "project") {
      // 프로젝트를 다른 이름으로 저장 = 새 폴더에 모든 문서를 복사해 저장
      const path = await chooseNewProjectPath(session.path ? `${sessionTitle(session)} 사본` : sessionTitle(session));
      return path ? writeProjectTo(path, true) : false;
    }
    const chosen = await save({ defaultPath: `${fileTitle(session.path)}.fountain`, filters: SCRIPT_FILTERS });
    if (!chosen) return false;
    return writeFileTo(/\.(fountain|spmd|txt)$/i.test(chosen) ? chosen : `${chosen}.fountain`);
  }, [writeFileTo, writeProjectTo]);

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    const session = sessionRef.current;
    if (!session.path) return saveAs();
    return session.kind === "project" ? writeProjectTo(session.path, false) : writeFileTo(session.path);
  }, [saveAs, writeFileTo, writeProjectTo]);

  /** 저장하지 않은 내용이 있으면 물어본다. 계속 진행해도 되면 true. */
  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    const answer = await message(
      `"${sessionTitle(sessionRef.current)}"의 변경 사항을 저장할까요?\n저장하지 않으면 변경 사항이 사라집니다.`,
      { title: "DropKick", kind: "warning", buttons: { yes: "저장", no: "저장 안 함", cancel: "취소" } },
    );
    if (answer === "저장" || answer === "Yes") return saveCurrent();
    return answer === "저장 안 함" || answer === "No";
  }, [saveCurrent]);

  // ---------- 열기 ----------

  const openProjectAt = useCallback(
    async (path: string, quiet = false) => {
      const loaded = await loadProject(tauriFs, path);
      const scriptText = loaded.texts.get(loaded.manifest.mainScript) ?? "";
      const { titlePage, lines } = scriptLinesOf(scriptText);
      editorRef.current?.load(lines);
      setSession({ kind: "project", path, manifest: loaded.manifest, texts: loaded.texts, titlePage });
      if (quiet) return;
      if (loaded.missing.length > 0) {
        await message(
          `다음 파일을 찾을 수 없어 빈 문서로 열었습니다.\n\n${loaded.missing.join("\n")}`,
          { title: "DropKick", kind: "warning" },
        );
      } else if (loaded.recovered) {
        await message(
          "프로젝트 정보(project.json)가 없거나 손상되어, 폴더 안 파일로 목록을 다시 만들었습니다.\n저장하면 새로 기록됩니다.",
          { title: "DropKick", kind: "info" },
        );
      }
    },
    [editorRef, setSession],
  );

  const openFileAt = useCallback(
    async (path: string) => {
      const text = await invoke<string>("read_script", { path });
      const { titlePage, lines } = scriptLinesOf(text);
      editorRef.current?.load(lines);
      setSession({ kind: "file", path, titlePage });
    },
    [editorRef, setSession],
  );

  /** ⌘O: .fountain 파일, 또는 프로젝트 안의 project.json을 고르면 그 프로젝트를 연다. */
  const openAny = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const chosen = await open({ multiple: false, directory: false, filters: OPEN_FILTERS });
    if (typeof chosen !== "string") return;
    try {
      if (chosen.endsWith(`/${MANIFEST_FILE}`)) await openProjectAt(chosen.slice(0, -MANIFEST_FILE.length - 1));
      else if (chosen.endsWith(".json")) throw new Error("DropKick 프로젝트의 project.json이 아닙니다.");
      else await openFileAt(chosen);
    } catch (error) {
      await showError("열지 못했습니다.", error);
    }
  }, [confirmDiscard, openFileAt, openProjectAt]);

  /** ⇧⌘O: 프로젝트 폴더를 고른다. */
  const openProjectFolder = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const chosen = await open({ multiple: false, directory: true, title: "프로젝트 폴더 열기" });
    if (typeof chosen !== "string") return;
    try {
      await openProjectAt(chosen);
    } catch (error) {
      await showError("프로젝트를 열지 못했습니다.", error);
    }
  }, [confirmDiscard, openProjectAt]);

  // ---------- 새로 만들기 ----------

  const newProject = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const { manifest, texts } = createProject("제목 없음");
    const { titlePage, lines } = scriptLinesOf(texts.get(manifest.mainScript) ?? "");
    editorRef.current?.load(lines);
    setSession({ kind: "project", path: null, manifest, texts, titlePage });
  }, [confirmDiscard, editorRef, setSession]);

  /** 지금 원고(.fountain 파일)로 새 프로젝트 폴더를 만든다. */
  const makeProject = useCallback(async () => {
    const session = sessionRef.current;
    const editor = editorRef.current;
    if (!editor) return;
    if (session.kind === "project") {
      await message(
        session.path
          ? "이미 프로젝트로 작업 중입니다."
          : "이미 프로젝트입니다. 저장(⌘S)하면 프로젝트 폴더가 만들어집니다.",
        { title: "DropKick", kind: "info" },
      );
      return;
    }
    const path = await chooseNewProjectPath(fileTitle(session.path));
    if (!path) return;
    const { manifest, texts } = createProject(projectTitleFromPath(path), {
      titlePage: session.titlePage,
      lines: editor.getLines(),
    });
    sessionRef.current = { kind: "project", path: null, manifest, texts, titlePage: session.titlePage };
    if (await writeProjectTo(path, true)) {
      await message(
        `"${path.split("/").pop()}" 프로젝트를 만들었습니다.\n원래 파일(${session.path ? session.path.split("/").pop() : "제목 없음"})은 그대로 남아 있습니다.`,
        { title: "DropKick", kind: "info" },
      );
    } else {
      sessionRef.current = session;
    }
  }, [editorRef, writeProjectTo]);

  // ---------- PDF ----------

  const exportPdf = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const chosen = await save({
      defaultPath: `${sessionTitle(sessionRef.current)}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!chosen) return;
    const path = /\.pdf$/i.test(chosen) ? chosen : `${chosen}.pdf`;
    try {
      // PDF 만드는 코드는 필요할 때만 불러온다. (앱 시작을 가볍게)
      const { buildPdf } = await import("../pdf/buildPdf");
      const bytes = await buildPdf(
        { titlePage: sessionRef.current.titlePage, lines: editor.getLines() },
        await loadFonts(),
      );
      await invoke("write_binary", bytes, { headers: { path: encodeURIComponent(path) } });
    } catch (error) {
      await showError("PDF를 만들지 못했습니다.", error);
    }
  }, [editorRef]);

  // 한 번에 하나의 파일 작업만 (대화상자가 겹치지 않게)
  const runExclusive = useCallback(
    async (task: () => Promise<unknown>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        await task();
      } finally {
        busyRef.current = false;
        editorRef.current?.focus();
      }
    },
    [editorRef],
  );

  // 메뉴와 창 닫기
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
        case "new_project":
          return runExclusive(newProject);
        case "open":
          return runExclusive(openAny);
        case "open_project":
          return runExclusive(openProjectFolder);
        case "save":
          return runExclusive(saveCurrent);
        case "save_as":
          return runExclusive(saveAs);
        case "make_project":
          return runExclusive(makeProject);
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
  }, [
    confirmDiscard,
    editorRef,
    exportPdf,
    makeProject,
    newProject,
    openAny,
    openProjectFolder,
    runExclusive,
    saveAs,
    saveCurrent,
  ]);

  // 시작할 때 마지막으로 작업한 프로젝트나 파일을 연다.
  useEffect(() => {
    if (!isTauri()) return;
    const last = readLast();
    if (!last) return;
    const reopen = last.kind === "project" ? openProjectAt(last.path, true) : openFileAt(last.path);
    reopen.catch(() => rememberLast(null));
    // 시작할 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = `${view.title}${dirty ? " — 수정됨" : ""} · DropKick`;
    if (isTauri()) getCurrentWindow().setTitle(document.title).catch(() => {});
  }, [view.title, dirty]);

  return {
    title: view.title,
    kind: view.kind,
    path: view.path,
    dirty,
    setDirty,
  };
}
