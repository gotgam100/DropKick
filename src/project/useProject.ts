/**
 * 지금 열려 있는 작업(프로젝트 또는 .fountain 파일 하나)을 관리한다.
 * 열기/새 프로젝트/저장/다른 이름으로 저장/프로젝트로 만들기/PDF, 메뉴, 닫기 전 확인,
 * 그리고 사이드바 트리(문서 추가/이름 바꾸기/삭제/옮기기)와 열려 있는 문서.
 *
 * 항상 프로젝트(폴더 제목.dropkick) 단위로 연다. .fountain 원고는 "Fountain 가져오기"로
 * 새 프로젝트 안에 넣는다.
 *
 * 트리 변경(이름, 위치, 삭제)은 저장(⌘S)할 때 실제 파일에 반영된다.
 * 브라우저 미리보기(개발용)에서는 파일 기능 없이 편집만 동작한다.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm, message, open, save } from "@tauri-apps/plugin-dialog";
import type { EditorHandle } from "../editor/Editor";
import type { TextEditorHandle } from "../editor/TextEditor";
import type { ScriptLine } from "../editor/lineStyles";
import { isLineStyle } from "../editor/styles";
import { fromFountain, toFountain } from "../fountain/fountain";
import { FONT_PATHS, type FontFiles } from "../pdf/fonts";
import {
  PROJECT_EXTENSION,
  createProject,
  projectTitleFromPath,
  walkDocs,
  type DocNode,
  type ProjectManifest,
  type ProjectNode,
} from "./model";
import { BACKUP_ROOT, backupStamp, joinPath, loadProject, saveProject } from "./projectIO";
import { appDataDir } from "@tauri-apps/api/path";
import { tauriFs } from "./tauriFs";
import {
  readRevision,
  restoreSettings,
  revisionDir,
  settingsDocs,
  writeRevision,
  type RevisionContent,
  type RevisionStats,
} from "../revisions/revisions";
import type { RevisionMeta } from "./model";
import { DEFAULT_CHARACTER_PRESET, formatPresetText, loadPresets, type DocPreset } from "./presets";
import { loadSettings } from "../settings/settings";
import { createDefaultStructureBoard, serializeStructureBoard } from "../structure/structureModel";
import {
  findNode,
  insertNode,
  makeDoc,
  makeFolder,
  moveNode,
  removeNode,
  renameNode,
  setNodeIcon,
  uniqueName,
  type DropPosition,
} from "./tree";

const SCRIPT_FILTERS = [{ name: "Fountain 시나리오", extensions: ["fountain", "spmd", "txt"] }];
const LAST_KEY = "dropkick.last";
/** 입력을 멈추고 이만큼 지나면 자동 저장 */
const AUTOSAVE_DELAY = 3000;
/** 자동 저장 때는 이 간격마다 한 번만 백업을 남긴다 (직접 저장은 매번) */
const AUTO_BACKUP_INTERVAL = 10 * 60 * 1000;
/** 프로젝트마다 남겨 둘 백업 수 */
const BACKUPS_TO_KEEP = 30;
/** 저장 안 한 새 프로젝트를 복구용으로 기록하는 간격 */
const RECOVERY_INTERVAL = 10000;
const OLD_LAST_FILE_KEY = "dropkick.lastFile";

type Session = {
  /** 아직 한 번도 저장하지 않았으면 null */
  path: string | null;
  /** 지금 트리 */
  manifest: ProjectManifest;
  /** 디스크에 마지막으로 저장된 트리 (한 번도 저장 안 했으면 null) */
  savedManifest: ProjectManifest | null;
  /** 문서 id → 지금 내용 (원고는 저장할 때 에디터에서 가져온다) */
  texts: Map<string, string>;
  savedTexts: Map<string, string>;
  /** 저장할 때 휴지통으로 옮길 문서 */
  deleted: DocNode[];
  treeChanged: boolean;
  /** 원고 표지 (Fountain 표지 정보). 원고 파일 맨 앞에 저장된다. */
  titlePage: string | null;
  savedTitlePage: string | null;
};

type Last = { kind: "project"; path: string };

function fileTitle(path: string | null): string {
  if (!path) return "제목 없음";
  const name = path.split("/").pop() ?? path;
  return name.replace(/\.(fountain|spmd|txt)$/i, "");
}

function sessionTitle(session: Session): string {
  return session.manifest.title || "제목 없음";
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
      // 예전의 .fountain 파일 하나 열기 기록은 쓰지 않는다. (이제 프로젝트 단위로만 연다)
      if (value.kind === "project" && typeof value.path === "string") return value;
    }
    return null;
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
  return confirm(text, {
    title: "DropKick",
    kind: "warning",
    okLabel,
    cancelLabel: "취소",
  });
}

async function notify(text: string, kind: "info" | "warning" = "info") {
  if (isTauri()) await message(text, { title: "DropKick", kind });
  else window.alert(text);
}

// ---------- 저장 안 한 새 프로젝트 복구 ----------

type Recovery = {
  version: 1;
  savedAt: string;
  manifest: ProjectManifest;
  texts: [string, string][];
  titlePage: string | null;
};

async function recoveryPath(): Promise<string> {
  return joinPath(await appDataDir(), "recovery/unsaved-project.json");
}

async function writeRecovery(data: Recovery | null) {
  try {
    const path = await recoveryPath();
    await tauriFs.ensureDir(path.split("/").slice(0, -1).join("/"));
    await tauriFs.writeText(path, data ? JSON.stringify(data) : "");
  } catch {
    // 복구 기록은 보조 기능이라 실패해도 작업은 계속한다.
  }
}

async function readRecovery(): Promise<Recovery | null> {
  try {
    const path = await recoveryPath();
    if ((await tauriFs.kind(path)) !== "file") return null;
    const text = await tauriFs.readText(path);
    if (!text.trim()) return null;
    const data = JSON.parse(text) as Recovery;
    return data.version === 1 && data.manifest && Array.isArray(data.texts) ? data : null;
  } catch {
    return null;
  }
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

function newSession(path: string | null, manifest: ProjectManifest, texts: Map<string, string>, titlePage: string | null, saved: boolean): Session {
  return {
    path,
    manifest,
    savedManifest: saved ? manifest : null,
    texts,
    // 비교 기준: 저장 안 한 새 프로젝트도 처음 내용을 기준으로 삼아, 실제로 고친 문서만 "수정됨"이 된다.
    savedTexts: new Map(texts),
    deleted: [],
    treeChanged: false,
    titlePage,
    savedTitlePage: titlePage,
  };
}

export type ProjectState = ReturnType<typeof useProject>;

export function useProject(
  editorRef: RefObject<EditorHandle | null>,
  textEditorRef: RefObject<TextEditorHandle | null>,
  initialLines: ScriptLine[],
) {
  const sessionRef = useRef<Session>(
    (() => {
      const { manifest, texts } = createProject("제목 없음", { titlePage: null, lines: initialLines });
      return newSession(null, manifest, texts, null, false);
    })(),
  );
  // sessionRef가 바뀌면 화면을 다시 그리도록 숫자를 올린다.
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const [activeDocId, setActiveDocId] = useState(sessionRef.current.manifest.mainScript);
  const activeRef = useRef(activeDocId);
  activeRef.current = activeDocId;
  const [scriptDirty, setScriptDirtyState] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ state: "idle" | "saving" | "saved" | "error"; at: Date | null }>({
    state: "idle",
    at: null,
  });
  const lastBackupRef = useRef(0);
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
  if (scriptDirty || session.titlePage !== session.savedTitlePage) dirtyDocIds.add(session.manifest.mainScript);
  const treeDirty = session.treeChanged || session.deleted.length > 0;
  const dirty = dirtyDocIds.size > 0 || treeDirty;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const setSession = useCallback(
    (next: Session, openDoc?: string) => {
      sessionRef.current = next;
      if (openDoc) setActiveDocId(openDoc);
      rememberLast(next.path ? { kind: "project", path: next.path } : null);
      refresh();
    },
    [refresh],
  );

  const currentScriptText = () =>
    toFountain({ titlePage: sessionRef.current.titlePage, lines: editorRef.current?.getLines() ?? [] });

  // ---------- 저장 ----------

  /**
   * 프로젝트를 path에 저장한다.
   * - all: 모든 문서를 쓴다 (처음 저장, 다른 이름으로 저장)
   * - auto: 자동 저장 (오류 창을 띄우지 않고, 백업은 10분에 한 번)
   * 저장하는 동안 더 쓴 글은 "수정됨"으로 남는다.
   */
  const writeProjectTo = useCallback(
    async (path: string, all: boolean, auto = false): Promise<boolean> => {
      const start = sessionRef.current;
      const editor = editorRef.current;
      if (!editor) return false;
      setSaveStatus((s) => ({ ...s, state: "saving" }));
      try {
        const token = editor.captureSaveState();
        const manifest = { ...start.manifest, title: projectTitleFromPath(path), lastOpened: activeRef.current };
        const texts = new Map(start.texts);
        texts.set(manifest.mainScript, currentScriptText());
        const changed = new Set<string>([manifest.mainScript]);
        for (const [id, text] of texts) if (start.savedTexts.get(id) !== text) changed.add(id);

        const now = Date.now();
        const makeBackup = !all && start.savedManifest && (!auto || now - lastBackupRef.current > AUTO_BACKUP_INTERVAL);
        const backupDir = makeBackup ? `${BACKUP_ROOT}/${backupStamp(new Date(now))}` : undefined;

        const saved = await saveProject(
          tauriFs,
          path,
          manifest,
          texts,
          all ? {} : { only: changed, previous: start.savedManifest ?? undefined, deleted: start.deleted, backupDir },
        );
        if (backupDir) {
          lastBackupRef.current = now;
          const keep = Math.max(1, Math.min(100, loadSettings().backupKeepCount || BACKUPS_TO_KEEP));
          invoke("prune_backups", { project: path, keep }).catch(() => {});
        }
        if (token) editor.markSavedAt(token);

        // 저장하는 동안 바뀐 것(새로 쓴 글, 트리 변경)은 그대로 두고, 저장한 것만 "저장됨"으로 표시한다.
        const current = sessionRef.current;
        const files = new Map(walkDocs(saved.tree).map((d) => [d.id, d.file]));
        const applyFiles = (nodes: ProjectNode[]): ProjectNode[] =>
          nodes.map((n) => (n.type === "folder" ? { ...n, children: applyFiles(n.children) } : { ...n, file: files.get(n.id) ?? n.file }));
        const treeUnchanged = current.manifest.tree === start.manifest.tree;
        sessionRef.current = {
          ...current,
          path,
          manifest: treeUnchanged ? saved : { ...current.manifest, title: saved.title, tree: applyFiles(current.manifest.tree) },
          savedManifest: saved,
          savedTexts: texts,
          savedTitlePage: start.titlePage,
          deleted: current.deleted.filter((d) => !start.deleted.includes(d)),
          treeChanged: !treeUnchanged,
        };
        rememberLast({ kind: "project", path });
        refresh();
        setSaveStatus({ state: "saved", at: new Date() });
        if (!start.path) writeRecovery(null);
        return true;
      } catch (error) {
        setSaveStatus((s) => ({ ...s, state: "error" }));
        if (!auto) await showError("프로젝트를 저장하지 못했습니다.", error);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorRef, refresh],
  );

  /** 다른 이름으로 저장 = 새 폴더에 모든 문서를 저장 */
  const saveAs = useCallback(async (): Promise<boolean> => {
    const current = sessionRef.current;
    const path = await chooseNewProjectPath(current.path ? `${sessionTitle(current)} 사본` : sessionTitle(current));
    return path ? writeProjectTo(path, true) : false;
  }, [writeProjectTo]);

  const saveCurrent = useCallback(async (): Promise<boolean> => {
    const current = sessionRef.current;
    return current.path ? writeProjectTo(current.path, false) : saveAs();
  }, [saveAs, writeProjectTo]);

  /** 저장하지 않은 내용이 있으면 물어본다. 계속 진행해도 되면 true. */
  const confirmDiscard = useCallback(async (): Promise<boolean> => {
    if (!dirtyRef.current) return true;
    if (!isTauri()) return window.confirm("저장하지 않은 변경 사항이 사라집니다. 계속할까요?");
    const answer = await message(
      `"${sessionTitle(sessionRef.current)}"의 변경 사항을 저장할까요?\n저장하지 않으면 변경 사항이 사라집니다.`,
      { title: "DropKick", kind: "warning", buttons: { yes: "저장", no: "저장 안 함", cancel: "취소" } },
    );
    if (answer === "저장" || answer === "Yes") return saveCurrent();
    const discard = answer === "저장 안 함" || answer === "No";
    if (discard && !sessionRef.current.path) writeRecovery(null);
    return discard;
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
        newSession(path, loaded.manifest, loaded.texts, titlePage, !loaded.recovered),
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

  /**
   * ⌘O: 프로젝트(제목.dropkick)를 고른다.
   * 배포용 앱에서는 .dropkick이 파일 하나처럼 보여서 바로 고를 수 있고,
   * 폴더로 보이는 경우에도 그 안의 project.json을 고르면 열린다.
   */
  const openProjectFolder = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    let chosen = await open({
      multiple: false,
      directory: false,
      title: "프로젝트 열기",
      filters: [{ name: "DropKick 프로젝트", extensions: ["dropkick", "json"] }],
    });
    if (typeof chosen !== "string") return;
    if (chosen.endsWith("/project.json")) chosen = chosen.slice(0, -"/project.json".length);
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
    setSession(newSession(null, manifest, texts, titlePage, false), manifest.mainScript);
  }, [confirmDiscard, editorRef, setScriptDirty, setSession]);

  /** 특정 원고 내용(예: 예시 스크립트)으로 새 프로젝트를 시작한다 */
  const newProjectWithScript = useCallback(
    async (title: string, fountainText: string) => {
      if (!(await confirmDiscard())) return false;
      const { titlePage, lines } = scriptLinesOf(fountainText);
      const { manifest, texts } = createProject(title, { titlePage, lines });
      editorRef.current?.load(lines.length > 0 ? lines : [{ style: "action", text: "" }]);
      setScriptDirty(false);
      setSession(newSession(null, manifest, texts, titlePage, false), manifest.mainScript);
      return true;
    },
    [confirmDiscard, editorRef, setScriptDirty, setSession],
  );

  /** 프로그램 전체 초기화: 복구 기록·최근 프로젝트를 모두 비우고 새 빈 프로젝트로 되돌린다 */
  const resetToInitialState = useCallback(async (): Promise<boolean> => {
    if (!(await confirmDiscard())) return false;
    await writeRecovery(null);
    rememberLast(null);
    const { manifest, texts } = createProject("제목 없음");
    const { titlePage, lines } = scriptLinesOf(texts.get(manifest.mainScript) ?? "");
    editorRef.current?.load(lines);
    setScriptDirty(false);
    setSession(newSession(null, manifest, texts, titlePage, false), manifest.mainScript);
    setSaveStatus({ state: "saved", at: null });
    return true;
  }, [confirmDiscard, editorRef, setScriptDirty, setSession]);

  /** Fountain 가져오기: .fountain 원고로 새 프로젝트를 시작한다. (원래 파일은 그대로) */
  const importFountain = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const chosen = await open({ multiple: false, directory: false, filters: SCRIPT_FILTERS, title: "Fountain 가져오기" });
    if (typeof chosen !== "string") return;
    try {
      const { titlePage, lines } = scriptLinesOf(await invoke<string>("read_script", { path: chosen }));
      const { manifest, texts } = createProject(fileTitle(chosen), { titlePage, lines });
      editorRef.current?.load(lines.length > 0 ? lines : [{ style: "action", text: "" }]);
      setScriptDirty(false);
      setSession(newSession(null, manifest, texts, titlePage, false), manifest.mainScript);
      // 저장 위치를 정하기 전까지는 아직 저장되지 않은 새 프로젝트다.
      sessionRef.current = { ...sessionRef.current, treeChanged: true };
      refresh();
    } catch (error) {
      await showError("Fountain 파일을 가져오지 못했습니다.", error);
    }
  }, [confirmDiscard, editorRef, refresh, setScriptDirty, setSession]);

  // ---------- 트리 ----------

  // 트리 작업 되돌리기 (가장 최근 한 번)
  const undoRef = useRef<{ session: Session; activeDocId: string } | null>(null);
  const [treeUndo, setTreeUndo] = useState<{ label: string; key: number } | null>(null);

  const updateTree = useCallback(
    (tree: ProjectNode[], extra: Partial<Session> = {}, label?: string) => {
      const current = sessionRef.current;
      if (label) {
        undoRef.current = { session: current, activeDocId: activeRef.current };
        setTreeUndo({ label, key: Date.now() });
      }
      sessionRef.current = { ...current, ...extra, manifest: { ...current.manifest, tree }, treeChanged: true };
      refresh();
    },
    [refresh],
  );

  const undoTree = useCallback(() => {
    const saved = undoRef.current;
    if (!saved) return;
    undoRef.current = null;
    setTreeUndo(null);
    const current = sessionRef.current;
    // 되돌린 뒤에도 그사이 쓴 글은 남기고, 트리만 되돌린다.
    const texts = new Map(saved.session.texts);
    for (const [id, text] of current.texts) if (texts.has(id)) texts.set(id, text);
    sessionRef.current = {
      ...current,
      manifest: saved.session.manifest,
      texts,
      deleted: saved.session.deleted,
      treeChanged: true,
    };
    if (findNode(saved.session.manifest.tree, saved.activeDocId)) setActiveDocId(saved.activeDocId);
    refresh();
  }, [refresh]);

  const dismissTreeUndo = useCallback(() => setTreeUndo(null), []);

  const openDoc = useCallback((id: string) => {
    if (findNode(sessionRef.current.manifest.tree, id)?.type === "folder") return;
    setActiveDocId(id);
  }, []);

  /**
   * 새 문서를 폴더 안에 만들고 연다. 만든 문서의 id를 돌려준다.
   * - memo: 빈 일반 문서
   * - character: 인물 설정 프리셋 (name을 주면 그 이름으로)
   * - structure: 3막 구조 보드 (세이브 더 캣 15단계)
   */
  const addDoc = useCallback(
    (parentId: string | null, type: "memo" | "character" | "structure" = "memo", name?: string) => {
      const current = sessionRef.current;
      const tree = current.manifest.tree;
      const parent = parentId;
      const made = makeDoc(tree, type, parent);
      const siblings = parent ? ((findNode(tree, parent) as { children?: ProjectNode[] })?.children ?? []) : tree;
      const doc = name ? { ...made, name: uniqueName(siblings, name.trim() || made.name) } : made;
      const texts = new Map(current.texts);
      if (type === "character") {
        const charPreset = loadPresets().find((p) => p.docType === "character") ?? DEFAULT_CHARACTER_PRESET;
        texts.set(doc.id, formatPresetText(charPreset, doc.name));
      } else if (type === "structure") {
        texts.set(doc.id, serializeStructureBoard(createDefaultStructureBoard()));
      } else {
        texts.set(doc.id, "");
      }
      updateTree(insertNode(tree, doc, parent), { texts }, `"${doc.name}"을(를) 만들었습니다`);
      setActiveDocId(doc.id);
      return doc.id;
    },
    [updateTree],
  );

  /** 프리셋으로 새 문서를 폴더 안에 만들고 연다. */
  const addDocWithPreset = useCallback(
    (parentId: string | null, preset: DocPreset, name?: string) => {
      const current = sessionRef.current;
      const tree = current.manifest.tree;
      const parent = parentId;
      const made = makeDoc(tree, preset.docType, parent);
      const siblings = parent ? ((findNode(tree, parent) as { children?: ProjectNode[] })?.children ?? []) : tree;
      const baseName = name?.trim() || preset.defaultDocName.trim() || made.name;
      const defaultIcon = preset.docType === "character" ? "person" : preset.docType === "script" ? "film" : "doc.text";
      const customIcon = preset.icon && preset.icon !== defaultIcon ? preset.icon : undefined;
      const doc: DocNode = {
        ...made,
        name: uniqueName(siblings, baseName),
        ...(customIcon ? { icon: customIcon } : {}),
      };
      const texts = new Map(current.texts);
      texts.set(doc.id, formatPresetText(preset, doc.name));
      updateTree(insertNode(tree, doc, parent), { texts }, `"${doc.name}"을(를) 만들었습니다`);
      setActiveDocId(doc.id);
      return doc.id;
    },
    [updateTree],
  );

  /** 이미 열려 있는 일반 문서에 프리셋 양식을 적용한다. */
  const applyPresetToDoc = useCallback(
    (docId: string, preset: DocPreset) => {
      const current = sessionRef.current;
      const node = findNode(current.manifest.tree, docId);
      if (!node || node.type === "folder") return;
      if (node.type === "script" && preset.docType !== "script") return;
      if (node.type !== "script" && preset.docType === "script") return;
      const texts = new Map(current.texts);
      texts.set(docId, formatPresetText(preset, node.name));
      let nextTree = current.manifest.tree;
      if (preset.icon) {
        const defaultIcon = node.type === "character" ? "person" : "doc.text";
        nextTree = setNodeIcon(nextTree, docId, preset.icon === defaultIcon ? undefined : preset.icon);
      }
      updateTree(nextTree, { texts }, `"${node.name}"에 "${preset.name}" 프리셋을 적용했습니다`);
    },
    [updateTree],
  );

  const addFolder = useCallback(
    (parentId: string | null = null) => {
      const current = sessionRef.current;
      const folder = makeFolder(current.manifest.tree, parentId);
      updateTree(insertNode(current.manifest.tree, folder, parentId), {}, `"${folder.name}" 폴더를 만들었습니다`);
      return folder.id;
    },
    [updateTree],
  );

  const rename = useCallback(
    (id: string, name: string) => {
      const current = sessionRef.current;
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
        updateTree(tree, { texts }, `이름을 "${renamed.name}"(으)로 바꿨습니다`);
      } else {
        updateTree(tree, {}, `이름을 "${renamed?.name ?? name}"(으)로 바꿨습니다`);
      }
    },
    [updateTree],
  );

  const remove = useCallback(
    async (id: string) => {
      const current = sessionRef.current;
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
      updateTree(
        result.tree,
        { texts, deleted: [...current.deleted, ...result.removed.filter((d) => savedIds.has(d.id))] },
        `"${node.name}"을(를) 지웠습니다`,
      );
      if (result.removed.some((d) => d.id === activeRef.current)) setActiveDocId(current.manifest.mainScript);
    },
    [updateTree],
  );

  const move = useCallback(
    (id: string, targetId: string, position: DropPosition) => {
      const current = sessionRef.current;
      const next = moveNode(current.manifest.tree, id, targetId, position);
      const node = findNode(current.manifest.tree, id);
      if (next !== current.manifest.tree) updateTree(next, {}, `"${node?.name ?? ""}"을(를) 옮겼습니다`);
    },
    [updateTree],
  );

  const setIcon = useCallback(
    (id: string, icon?: string) => {
      const current = sessionRef.current;
      const node = findNode(current.manifest.tree, id);
      if (!node || (node.icon ?? undefined) === (icon || undefined)) return;
      const next = setNodeIcon(current.manifest.tree, id, icon);
      updateTree(next, {}, `"${node.name}" 아이콘을 바꿨습니다`);
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

  /** 표지를 바꾼다. (원고와 함께 저장된다) */
  const setTitlePage = useCallback(
    (titlePage: string | null) => {
      sessionRef.current = { ...sessionRef.current, titlePage };
      refresh();
    },
    [refresh],
  );

  // ---------- 수정고 ----------

  // 브라우저 미리보기(개발용)에서는 디스크 대신 메모리에 보관한다.
  const memoryRevisions = useRef(new Map<string, RevisionContent>());

  /**
   * 지금 원고와 설정 문서를 "고"로 보관한다. 저장한 적 없는 프로젝트면 먼저 저장 위치를 묻는다.
   * 보관한 고의 정보를 돌려준다.
   */
  const createRevision = useCallback(
    async (name: string, note: string, stats?: RevisionStats): Promise<RevisionMeta | null> => {
      if (isTauri() && !sessionRef.current.path) {
        await notify("고를 보관하려면 먼저 프로젝트를 저장해야 합니다. 저장 위치를 골라 주세요.");
        if (!(await saveCurrent())) return null;
      }
      const current = sessionRef.current;
      const now = new Date();
      const meta: RevisionMeta = {
        id: `rev-${now.getTime().toString(36)}`,
        name: name.trim() || "이름 없는 고",
        note: note.trim(),
        createdAt: now.toISOString(),
        dir: revisionDir(name.trim() || "고", now),
        ...(stats ? { stats } : {}),
      };
      const content: RevisionContent = {
        meta,
        script: currentScriptText(),
        docs: settingsDocs(current.manifest.tree).map(({ doc, folders }) => ({
          doc: { id: doc.id, type: doc.type, name: doc.name, folders },
          text: current.texts.get(doc.id) ?? "",
        })),
      };
      try {
        if (isTauri() && current.path) await writeRevision(tauriFs, current.path, content);
        else memoryRevisions.current.set(meta.id, content);
      } catch (error) {
        await showError("고를 보관하지 못했습니다.", error);
        return null;
      }
      const latest = sessionRef.current;
      sessionRef.current = {
        ...latest,
        manifest: { ...latest.manifest, revisions: [...(latest.manifest.revisions ?? []), meta] },
        treeChanged: true,
      };
      refresh();
      // 목록을 바로 project.json에 남긴다.
      if (isTauri() && sessionRef.current.path && !busyRef.current) {
        busyRef.current = true;
        try {
          await writeProjectTo(sessionRef.current.path, false, true);
        } finally {
          busyRef.current = false;
        }
      }
      return meta;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refresh, saveCurrent, writeProjectTo],
  );

  const loadRevision = useCallback(async (meta: RevisionMeta): Promise<RevisionContent | null> => {
    const memory = memoryRevisions.current.get(meta.id);
    if (memory) return memory;
    const path = sessionRef.current.path;
    if (!isTauri() || !path) return null;
    try {
      return await readRevision(tauriFs, path, meta);
    } catch (error) {
      await showError(`"${meta.name}"을(를) 읽지 못했습니다.`, error);
      return null;
    }
  }, []);

  /** 고로 되돌리기: 지금 상태를 먼저 "되돌리기 전" 고로 보관한 뒤, 원고와 설정 문서를 고 때로 바꾼다. */
  const restoreRevision = useCallback(
    async (meta: RevisionMeta, stats?: RevisionStats): Promise<boolean> => {
      const ok = await ask(
        `"${meta.name}"로 되돌릴까요?\n원고와 설정 문서(개요, 인물 설정)가 그때 내용으로 바뀝니다. 메모와 기타 문서는 그대로입니다.\n지금 상태는 먼저 "되돌리기 전" 고로 보관됩니다.`,
        "되돌리기",
      );
      if (!ok) return false;
      const content = await loadRevision(meta);
      if (!content) return false;
      const stamp = new Date().toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      if (!(await createRevision(`되돌리기 전 (${stamp})`, `"${meta.name}"로 되돌리기 전 자동 보관`, stats))) return false;

      const { titlePage, lines } = scriptLinesOf(content.script);
      editorRef.current?.load(lines.length > 0 ? lines : [{ style: "action", text: "" }]);
      setScriptDirty(true);
      const current = sessionRef.current;
      const restored = restoreSettings(current.manifest.tree, current.texts, content.docs);
      sessionRef.current = {
        ...current,
        manifest: { ...current.manifest, tree: restored.tree },
        texts: restored.texts,
        titlePage,
        treeChanged: true,
      };
      setActiveDocId(current.manifest.mainScript);
      refresh();
      return true;
    },
    [createRevision, editorRef, loadRevision, refresh, setScriptDirty],
  );

  /** 고 지우기: 목록에서 빼고 폴더는 휴지통으로 */
  const deleteRevision = useCallback(
    async (meta: RevisionMeta): Promise<boolean> => {
      if (!(await ask(`"${meta.name}"을(를) 지울까요?\n보관한 내용은 휴지통으로 옮겨집니다.`, "지우기"))) return false;
      memoryRevisions.current.delete(meta.id);
      const path = sessionRef.current.path;
      if (isTauri() && path) {
        try {
          await tauriFs.trash(joinPath(path, meta.dir));
        } catch (error) {
          await showError("고를 지우지 못했습니다.", error);
          return false;
        }
      }
      const current = sessionRef.current;
      sessionRef.current = {
        ...current,
        manifest: { ...current.manifest, revisions: (current.manifest.revisions ?? []).filter((r) => r.id !== meta.id) },
        treeChanged: true,
      };
      refresh();
      return true;
    },
    [refresh],
  );

  // ---------- PDF ----------

  /** PDF로 내보내기. source를 주면(예: 수정고) 그 원고를, 없으면 지금 원고를 내보낸다. */
  const exportPdf = useCallback(async (source?: { name: string; script: string }) => {
    const editor = editorRef.current;
    if (!editor) return;
    const chosen = await save({
      defaultPath: `${sessionTitle(sessionRef.current)}${source ? ` ${source.name}` : ""}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!chosen) return;
    const path = /\.pdf$/i.test(chosen) ? chosen : `${chosen}.pdf`;
    try {
      // PDF 만드는 코드는 필요할 때만 불러온다. (앱 시작을 가볍게)
      const { buildPdf } = await import("../pdf/buildPdf");
      const doc = source
        ? scriptLinesOf(source.script)
        : { titlePage: sessionRef.current.titlePage, lines: editor.getLines() };
      const bytes = await buildPdf(doc, await loadFonts());
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
          return runExclusive(openProjectFolder);
        case "import_fountain":
          return runExclusive(importFountain);
        case "save":
          return runExclusive(saveCurrent);
        case "save_as":
          return runExclusive(saveAs);
        case "export_pdf":
          return runExclusive(() => exportPdf());
        case "open_project_location":
          return runExclusive(async () => {
            const path = sessionRef.current.path;
            if (!path) {
              await notify("아직 저장하지 않은 프로젝트입니다. 먼저 저장(⌘S)해 주세요.");
              return;
            }
            try {
              await invoke("reveal_in_finder", { path });
            } catch (error) {
              await showError("프로젝트 위치를 열 수 없습니다.", error);
            }
          });
        case "open_backups":
          return runExclusive(async () => {
            const path = sessionRef.current.path;
            if (!path) {
              await notify("아직 저장하지 않은 프로젝트입니다. 저장하면 이후 백업이 프로젝트 폴더에 남습니다.");
              return;
            }
            try {
              await invoke("open_in_finder", { path: joinPath(path, BACKUP_ROOT) });
            } catch (error) {
              await showError("백업 폴더를 열 수 없습니다.", error);
            }
          });
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

    // 앱이 켜져 있을 때 Finder에서 다른 프로젝트를 더블클릭한 경우
    listen<string[]>("open-paths", async () => {
      const paths = await invoke<string[]>("take_pending_opens");
      const path = paths[paths.length - 1];
      if (!path || path === sessionRef.current.path) return;
      runExclusive(async () => {
        if (!(await confirmDiscard())) return;
        try {
          await openProjectAt(path);
        } catch (error) {
          await showError("프로젝트를 열지 못했습니다.", error);
        }
      });
    }).then((unlisten) => {
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
    importFountain,
    newProject,
    openProjectAt,
    openProjectFolder,
    runExclusive,
    saveAs,
    saveCurrent,
    textEditorRef,
  ]);

  const startupHandledRef = useRef(false);

  // 시작할 때: 저장하지 않은 새 프로젝트가 남아 있으면 복구를 묻고, 아니면 마지막 프로젝트를 연다.
  useEffect(() => {
    if (!isTauri()) return;
    if (startupHandledRef.current) return;
    startupHandledRef.current = true;

    (async () => {
      // Finder에서 프로젝트를 더블클릭해 앱이 켜진 경우: 그 프로젝트를 연다.
      const pending = await invoke<string[]>("take_pending_opens").catch(() => [] as string[]);
      if (pending.length > 0) {
        openProjectAt(pending[pending.length - 1]).catch((error) => showError("프로젝트를 열지 못했습니다.", error));
        return;
      }
      const recovery = await readRecovery();
      if (recovery) {
        // 복구 대화상자가 뜨면 복구/취소 여부와 상관없이 이전 recovery 파일은 즉시 비워 무한 반복되지 않게 한다.
        await writeRecovery(null);
        const when = new Date(recovery.savedAt).toLocaleString("ko-KR");
        const restore = await ask(
          `저장하지 않은 프로젝트 "${recovery.manifest.title || "제목 없음"}"이(가) 남아 있습니다. (${when})\n복구할까요?`,
          "복구",
        );
        if (restore) {
          const texts = new Map(recovery.texts);
          const { lines } = scriptLinesOf(texts.get(recovery.manifest.mainScript) ?? "");
          editorRef.current?.load(lines.length > 0 ? lines : [{ style: "action", text: "" }]);
          sessionRef.current = newSession(null, recovery.manifest, texts, recovery.titlePage, false);
          setActiveDocId(recovery.manifest.mainScript);
          refresh();
          return;
        }
      }
      if (!loadSettings().openLastProjectOnStart) return;
      const last = readLast();
      if (last) openProjectAt(last.path, true).catch(() => rememberLast(null));
    })();
    // 시작할 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 자동 저장: 저장된 적 있는 프로젝트를 고치면, 입력이 멈추고 잠시 뒤 저장한다.
  useEffect(() => {
    if (!isTauri() || !sessionRef.current.path || !dirty) return;
    const delay = loadSettings().autosaveDelayMs;
    if (delay <= 0) return;
    const timer = setTimeout(async () => {
      const path = sessionRef.current.path;
      if (!path || busyRef.current) return;
      busyRef.current = true;
      try {
        await writeProjectTo(path, false, true);
      } finally {
        busyRef.current = false;
      }
    }, delay || AUTOSAVE_DELAY);
    return () => clearTimeout(timer);
  }, [dirty, version, scriptDirty, writeProjectTo]);

  // 저장 위치를 아직 정하지 않은 새 프로젝트는, 앱이 갑자기 꺼져도 살릴 수 있게 따로 기록해 둔다.
  useEffect(() => {
    if (!isTauri() || sessionRef.current.path || !dirty) return;
    const record = () => {
      const current = sessionRef.current;
      if (current.path) return;
      const texts = new Map(current.texts);
      texts.set(current.manifest.mainScript, currentScriptText());
      writeRecovery({
        version: 1,
        savedAt: new Date().toISOString(),
        manifest: current.manifest,
        texts: [...texts],
        titlePage: current.titlePage,
      });
    };
    record();
    const timer = setInterval(record, RECOVERY_INTERVAL);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

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
    path: session.path,
    tree: session.manifest.tree,
    mainScriptId: session.manifest.mainScript,
    activeDoc,
    activeText: session.texts.get(activeDoc.id) ?? "",
    docTexts: session.texts,
    dirty,
    titlePage: session.titlePage,
    setTitlePage,
    saveStatus,
    autosaving: Boolean(session.path),
    treeUndo,
    undoTree,
    dismissTreeUndo,
    dirtyDocIds,
    /** 앱을 끝내거나 다시 시작하기 전: 저장 안 한 내용이 있으면 저장하거나 묻는다 */
    prepareToClose: confirmDiscard,
    revisions: session.manifest.revisions ?? [],
    exportRevisionPdf: (name: string, script: string) => runExclusive(() => exportPdf({ name, script })),
    createRevision,
    loadRevision,
    restoreRevision,
    deleteRevision,
    treeDirty,
    setScriptDirty,
    setDocText,
    openDoc,
    addDoc,
    addDocWithPreset,
    applyPresetToDoc,
    addFolder,
    rename,
    remove,
    move,
    setIcon,
    resetToInitialState,
    newProjectWithScript,
  };
}
