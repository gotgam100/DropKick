/**
 * 지금 열려 있는 작업(프로젝트 또는 .fountain 파일 하나)을 관리한다.
 * 열기/새 프로젝트/저장/다른 이름으로 저장/프로젝트로 만들기/PDF, 메뉴, 닫기 전 확인,
 * 그리고 사이드바 트리(문서 추가/이름 바꾸기/삭제/옮기기)와 열려 있는 문서.
 *
 * - 프로젝트: 폴더(제목.dropkick) 안에 원고와 다른 문서들. 기본 방식
 * - 파일: 예전처럼 .fountain 파일 하나. "프로젝트로 만들기"로 바꿀 수 있다
 *
 * 트리 변경(이름, 위치, 삭제)은 저장(⌘S)할 때 실제 파일에 반영된다.
 * 브라우저 미리보기(개발용)에서는 파일 기능 없이 편집만 동작한다.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import type { EditorHandle } from "../editor/Editor";
import type { TextEditorHandle } from "../editor/TextEditor";
import type { ScriptLine } from "../editor/lineStyles";
import { isLineStyle } from "../editor/styles";
import { fromFountain, toFountain } from "../fountain/fountain";
import { FONT_PATHS, type FontFiles } from "../pdf/fonts";
import {
  MANIFEST_FILE,
  PROJECT_EXTENSION,
  SYNOPSIS_TEMPLATE,
  createProject,
  projectTitleFromPath,
  walkDocs,
  type DocNode,
  type DocType,
  type ProjectManifest,
  type ProjectNode,
} from "./model";
import { loadProject, saveProject } from "./projectIO";
import { tauriFs } from "./tauriFs";
import {
  CHARACTER_TEMPLATE,
  MEMO_TEMPLATE,
  defaultParentFor,
  findNode,
  insertNode,
  makeDoc,
  makeFolder,
  moveNode,
  removeNode,
  renameNode,
  type DropPosition,
} from "./tree";

const SCRIPT_FILTERS = [{ name: "Fountain 시나리오", extensions: ["fountain", "spmd", "txt"] }];
const OPEN_FILTERS = [{ name: "시나리오 또는 프로젝트", extensions: ["fountain", "spmd", "txt", "json"] }];
const LAST_KEY = "dropkick.last";
const OLD_LAST_FILE_KEY = "dropkick.lastFile";

type Session = {
  kind: "project" | "file";
  /** 아직 한 번도 저장하지 않았으면 null */
  path: string | null;
  /** 지금 트리 (파일 모드면 원고 하나뿐) */
  manifest: ProjectManifest;
  /** 디스크에 마지막으로 저장된 트리 (한 번도 저장 안 했으면 null) */
  savedManifest: ProjectManifest | null;
  /** 문서 id → 지금 내용 (원고는 저장할 때 에디터에서 가져온다) */
  texts: Map<string, string>;
  savedTexts: Map<string, string>;
  /** 저장할 때 휴지통으로 옮길 문서 */
  deleted: DocNode[];
  treeChanged: boolean;
  titlePage: string | null;
};

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

function fileManifest(path: string | null): ProjectManifest {
  return {
    format: "dropkick-project",
    version: 1,
    title: fileTitle(path),
    mainScript: "file-script",
    tree: [{ id: "file-script", type: "script", name: fileTitle(path), file: path?.split("/").pop() ?? "" }],
  };
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
  if (isTauri()) await message(`${text}\n\n${detail}`, { title: "DropKick", kind: "error" });
  else window.alert(`${text}\n\n${detail}`);
}

async function ask(text: string, okLabel: string): Promise<boolean> {
  if (!isTauri()) return window.confirm(text);
  const answer = await message(text, {
    title: "DropKick",
    kind: "warning",
    buttons: { ok: okLabel, cancel: "취소" },
  });
  return answer === okLabel || answer === "Ok";
}

async function notify(text: string, kind: "info" | "warning" = "info") {
  if (isTauri()) await message(text, { title: "DropKick", kind });
  else window.alert(text);
}

function scriptLinesOf(text: string) {
  const doc = fromFountain(text);
  return { titlePage: doc.titlePage, lines: doc.lines.filter((l) => isLineStyle(l.style)) };
}

/** 새 프로젝트 폴더 위치를 고른다. 이미 있는 폴더/파일은 덮어쓰지 않는다. */
async function chooseNewProjectPath(name: string): Promise<string | null> {
  const chosen = await save({ title: "프로젝트 저장", defaultPath: `${name}${PROJECT_EXTENSION}` });
  if (!chosen) return null;
  const path = chosen.endsWith(PROJECT_EXTENSION) ? chosen : `${chosen}${PROJECT_EXTENSION}`;
  if ((await tauriFs.kind(path)) !== "none") {
    await notify(`"${path.split("/").pop()}"이(가) 이미 있습니다.\n덮어쓰지 않도록 다른 이름을 골라 주세요.`, "warning");
    return null;
  }
  return path;
}

function newSession(kind: Session["kind"], path: string | null, manifest: ProjectManifest, texts: Map<string, string>, titlePage: string | null, saved: boolean): Session {
  return {
    kind,
    path,
    manifest,
    savedManifest: saved ? manifest : null,
    texts,
    // 비교 기준: 저장 안 한 새 프로젝트도 처음 내용을 기준으로 삼아, 실제로 고친 문서만 "수정됨"이 된다.
    savedTexts: new Map(texts),
    deleted: [],
    treeChanged: false,
    titlePage,
  };
}

const TEMPLATES: Record<Exclude<DocType, "script">, (name: string) => string> = {
  memo: MEMO_TEMPLATE,
  character: CHARACTER_TEMPLATE,
  synopsis: () => SYNOPSIS_TEMPLATE,
};

export type ProjectState = ReturnType<typeof useProject>;

export function useProject(
  editorRef: RefObject<EditorHandle | null>,
  textEditorRef: RefObject<TextEditorHandle | null>,
  initialLines: ScriptLine[],
) {
  const sessionRef = useRef<Session>(
    (() => {
      const { manifest, texts } = createProject("제목 없음", { titlePage: null, lines: initialLines });
      return newSession("project", null, manifest, texts, null, false);
    })(),
  );
  // sessionRef가 바뀌면 화면을 다시 그리도록 숫자를 올린다.
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const [activeDocId, setActiveDocId] = useState(sessionRef.current.manifest.mainScript);
  const activeRef = useRef(activeDocId);
  activeRef.current = activeDocId;
  const [scriptDirty, setScriptDirtyState] = useState(false);
  const scriptDirtyRef = useRef(false);
  const busyRef = useRef(false);

  const setScriptDirty = useCallback((value: boolean) => {
    scriptDirtyRef.current = value;
    setScriptDirtyState(value);
  }, []);

  const session = sessionRef.current;
  const dirtyDocIds = new Set<string>();
  for (const [id, text] of session.texts) {
    if (id === session.manifest.mainScript) continue;
    if (session.savedTexts.get(id) !== text) dirtyDocIds.add(id);
  }
  if (scriptDirty) dirtyDocIds.add(session.manifest.mainScript);
  const treeDirty = session.treeChanged || session.deleted.length > 0;
  const dirty = dirtyDocIds.size > 0 || treeDirty;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const setSession = useCallback(
    (next: Session, openDoc?: string) => {
      sessionRef.current = next;
      if (openDoc) setActiveDocId(openDoc);
      rememberLast(next.path ? { kind: next.kind, path: next.path } : null);
      refresh();
    },
    [refresh],
  );

  const currentScriptText = () =>
    toFountain({ titlePage: sessionRef.current.titlePage, lines: editorRef.current?.getLines() ?? [] });

  // ---------- 저장 ----------

  const writeProjectTo = useCallback(
    async (path: string, all: boolean): Promise<boolean> => {
      const current = sessionRef.current;
      const editor = editorRef.current;
      if (current.kind !== "project" || !editor) return false;
      try {
        const manifest = { ...current.manifest, title: projectTitleFromPath(path), lastOpened: activeRef.current };
        const texts = new Map(current.texts);
        texts.set(manifest.mainScript, currentScriptText());
        const changed = new Set<string>([manifest.mainScript]);
        for (const [id, text] of texts) if (current.savedTexts.get(id) !== text) changed.add(id);
        const saved = await saveProject(
          tauriFs,
          path,
          manifest,
          texts,
          all ? {} : { only: changed, previous: current.savedManifest ?? undefined, deleted: current.deleted },
        );
        editor.markSaved();
        setSession({ ...newSession("project", path, saved, texts, current.titlePage, true) });
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
        const manifest = fileManifest(path);
        setSession(newSession("file", path, manifest, new Map(), sessionRef.current.titlePage, true), manifest.mainScript);
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
    const current = sessionRef.current;
    if (current.kind === "project") {
      // 프로젝트를 다른 이름으로 저장 = 새 폴더에 모든 문서를 저장
      const path = await chooseNewProjectPath(current.path ? `${sessionTitle(current)} 사본` : sessionTitle(current));
      return path ? writeProjectTo(path, true) : false;
    }
    const chosen = await save({ defaultPath: `${fileTitle(current.path)}.fountain`, filters: SCRIPT_FILTERS });
    if (!chosen) return false;
    return writeFileTo(/\.(fountain|spmd|txt)$/i.test(chosen) ? chosen : `${chosen}.fountain`);
  }, [writeFileTo, writeProjectTo]);

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    const current = sessionRef.current;
    if (!current.path) return saveAs();
    return current.kind === "project" ? writeProjectTo(current.path, false) : writeFileTo(current.path);
  }, [saveAs, writeFileTo, writeProjectTo]);

  /** 저장하지 않은 내용이 있으면 물어본다. 계속 진행해도 되면 true. */
  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    if (!isTauri()) return window.confirm("저장하지 않은 변경 사항이 사라집니다. 계속할까요?");
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
      const { titlePage, lines } = scriptLinesOf(loaded.texts.get(loaded.manifest.mainScript) ?? "");
      editorRef.current?.load(lines);
      setScriptDirty(false);
      const reopen = loaded.manifest.lastOpened && findNode(loaded.manifest.tree, loaded.manifest.lastOpened);
      setSession(
        newSession("project", path, loaded.manifest, loaded.texts, titlePage, !loaded.recovered),
        reopen ? loaded.manifest.lastOpened : loaded.manifest.mainScript,
      );
      if (quiet) return;
      if (loaded.missing.length > 0) {
        await notify(`다음 파일을 찾을 수 없어 빈 문서로 열었습니다.\n\n${loaded.missing.join("\n")}`, "warning");
      } else if (loaded.recovered) {
        await notify(
          "프로젝트 정보(project.json)가 없거나 손상되어, 폴더 안 파일로 목록을 다시 만들었습니다.\n저장하면 새로 기록됩니다.",
        );
      }
    },
    [editorRef, setScriptDirty, setSession],
  );

  const openFileAt = useCallback(
    async (path: string) => {
      const text = await invoke<string>("read_script", { path });
      const { titlePage, lines } = scriptLinesOf(text);
      editorRef.current?.load(lines);
      const manifest = fileManifest(path);
      setSession(newSession("file", path, manifest, new Map(), titlePage, true), manifest.mainScript);
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
    setScriptDirty(false);
    setSession(newSession("project", null, manifest, texts, titlePage, false), manifest.mainScript);
  }, [confirmDiscard, editorRef, setScriptDirty, setSession]);

  /** 지금 원고(.fountain 파일)로 새 프로젝트 폴더를 만든다. */
  const makeProject = useCallback(async () => {
    const current = sessionRef.current;
    const editor = editorRef.current;
    if (!editor) return;
    if (current.kind === "project") {
      await notify(
        current.path ? "이미 프로젝트로 작업 중입니다." : "이미 프로젝트입니다. 저장(⌘S)하면 프로젝트 폴더가 만들어집니다.",
      );
      return;
    }
    const path = await chooseNewProjectPath(fileTitle(current.path));
    if (!path) return;
    const { manifest, texts } = createProject(projectTitleFromPath(path), {
      titlePage: current.titlePage,
      lines: editor.getLines(),
    });
    sessionRef.current = newSession("project", null, manifest, texts, current.titlePage, false);
    if (await writeProjectTo(path, true)) {
      setActiveDocId(sessionRef.current.manifest.mainScript);
      await notify(
        `"${path.split("/").pop()}" 프로젝트를 만들었습니다.\n원래 파일(${current.path ? current.path.split("/").pop() : "제목 없음"})은 그대로 남아 있습니다.`,
      );
    } else {
      sessionRef.current = current;
      refresh();
    }
  }, [editorRef, refresh, writeProjectTo]);

  // ---------- 트리 ----------

  const updateTree = useCallback(
    (tree: ProjectNode[], extra: Partial<Session> = {}) => {
      const current = sessionRef.current;
      sessionRef.current = { ...current, ...extra, manifest: { ...current.manifest, tree }, treeChanged: true };
      refresh();
    },
    [refresh],
  );

  const openDoc = useCallback((id: string) => {
    if (findNode(sessionRef.current.manifest.tree, id)?.type === "folder") return;
    setActiveDocId(id);
  }, []);

  /** 새 문서를 만들고 연다. 만든 문서의 id를 돌려준다. */
  const addDoc = useCallback(
    (type: Exclude<DocType, "script">, parentId?: string | null) => {
      const current = sessionRef.current;
      if (current.kind !== "project") return null;
      const tree = current.manifest.tree;
      const parent = parentId !== undefined ? parentId : defaultParentFor(tree, type);
      const doc = makeDoc(tree, type, parent);
      const texts = new Map(current.texts);
      texts.set(doc.id, TEMPLATES[type](doc.name));
      updateTree(insertNode(tree, doc, parent), { texts });
      setActiveDocId(doc.id);
      return doc.id;
    },
    [updateTree],
  );

  const addFolder = useCallback(
    (parentId: string | null = null) => {
      const current = sessionRef.current;
      if (current.kind !== "project") return null;
      const folder = makeFolder(current.manifest.tree, parentId);
      updateTree(insertNode(current.manifest.tree, folder, parentId));
      return folder.id;
    },
    [updateTree],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const current = sessionRef.current;
      if (current.kind !== "project") return;
      const node = findNode(current.manifest.tree, id);
      if (!node || node.name === name.trim()) return;
      const tree = renameNode(current.manifest.tree, id, name);
      // 본문 첫 제목이 옛 이름 그대로면 새 이름으로 함께 바꾼다. ("# 새 인물" → "# 민재")
      const renamed = findNode(tree, id);
      const text = current.texts.get(id);
      const heading = `# ${node.name}`;
      if (renamed && text !== undefined && (text === heading || text.startsWith(`${heading}\n`))) {
        const texts = new Map(current.texts);
        texts.set(id, `# ${renamed.name}${text.slice(heading.length)}`);
        updateTree(tree, { texts });
      } else {
        updateTree(tree);
      }
    },
    [updateTree],
  );

  const remove = useCallback(
    async (id: string) => {
      const current = sessionRef.current;
      if (current.kind !== "project") return;
      const node = findNode(current.manifest.tree, id);
      if (!node) return;
      const docs = node.type === "folder" ? walkDocs(node.children) : [node];
      if (docs.some((d) => d.id === current.manifest.mainScript)) {
        await notify("시나리오 문서는 지울 수 없습니다.", "warning");
        return;
      }
      const what = node.type === "folder" ? `"${node.name}" 폴더와 안의 문서 ${docs.length}개` : `"${node.name}"`;
      if (!(await ask(`${what}를 지울까요?\n저장하면 파일이 휴지통으로 옮겨집니다.`, "지우기"))) return;
      const result = removeNode(current.manifest.tree, id);
      const savedIds = new Set(current.savedManifest ? walkDocs(current.savedManifest.tree).map((d) => d.id) : []);
      const texts = new Map(current.texts);
      for (const doc of result.removed) texts.delete(doc.id);
      updateTree(result.tree, {
        texts,
        deleted: [...current.deleted, ...result.removed.filter((d) => savedIds.has(d.id))],
      });
      if (result.removed.some((d) => d.id === activeRef.current)) setActiveDocId(current.manifest.mainScript);
    },
    [updateTree],
  );

  const move = useCallback(
    (id: string, targetId: string, position: DropPosition) => {
      const current = sessionRef.current;
      if (current.kind !== "project") return;
      const next = moveNode(current.manifest.tree, id, targetId, position);
      if (next !== current.manifest.tree) updateTree(next);
    },
    [updateTree],
  );

  const setDocText = useCallback(
    (id: string, text: string) => {
      const current = sessionRef.current;
      if (current.texts.get(id) === text) return;
      const texts = new Map(current.texts);
      texts.set(id, text);
      sessionRef.current = { ...current, texts };
      refresh();
    },
    [refresh],
  );

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
      const bytes = await buildPdf({ titlePage: sessionRef.current.titlePage, lines: editor.getLines() }, await loadFonts());
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
        const isScript = activeRef.current === sessionRef.current.manifest.mainScript;
        (isScript ? editorRef.current : textEditorRef.current)?.focus();
      }
    },
    [editorRef, textEditorRef],
  );

  // 메뉴와 창 닫기
  useEffect(() => {
    if (!isTauri()) return;
    const win = getCurrentWindow();
    const cleanups: Array<() => void> = [];
    let disposed = false;

    const handleMenu = (id: string) => {
      const isScript = activeRef.current === sessionRef.current.manifest.mainScript;
      const active = isScript ? editorRef.current : textEditorRef.current;
      if (id.startsWith("style:")) {
        const style = id.slice("style:".length);
        if (isScript && isLineStyle(style)) editorRef.current?.setStyle(style);
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
          return active?.undo();
        case "redo":
          return active?.redo();
        case "find":
          return active?.find();
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
    textEditorRef,
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

  const title = sessionTitle(session);
  useEffect(() => {
    document.title = `${title}${dirty ? " — 수정됨" : ""} · DropKick`;
    if (isTauri()) getCurrentWindow().setTitle(document.title).catch(() => {});
  }, [title, dirty]);

  const activeNode = findNode(session.manifest.tree, activeDocId);
  const activeDoc: DocNode =
    activeNode && activeNode.type !== "folder"
      ? activeNode
      : (findNode(session.manifest.tree, session.manifest.mainScript) as DocNode);

  return {
    title,
    kind: session.kind,
    path: session.path,
    tree: session.manifest.tree,
    mainScriptId: session.manifest.mainScript,
    activeDoc,
    activeText: session.texts.get(activeDoc.id) ?? "",
    dirty,
    dirtyDocIds,
    treeDirty,
    setScriptDirty,
    setDocText,
    openDoc,
    addDoc,
    addFolder,
    rename,
    remove,
    move,
    makeProject: () => runExclusive(makeProject),
  };
}
