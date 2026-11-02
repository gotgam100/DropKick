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
import type { ScriptNote } from "../editor/notes";
import { isLineStyle } from "../editor/styles";
import { fromFountain, toFountain } from "../fountain/fountain";
import type { ImportResult } from "../importer/ImportResultDialog";
import type { Answers, Question } from "../importer/types";
import { FONT_PATHS, type FontFiles } from "../pdf/fonts";
import {
  BLANK_SCRIPT_LINES,
  PROJECT_EXTENSION,
  ProjectError,
  createProject,
  newId,
  projectTitleFromPath,
  walkDocs,
  type DocNode,
  type FolderNode,
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
import { buildExtraSection, type ExtraSection } from "../export/extras";
import { DEFAULT_CHARACTER_PRESET, formatPresetText, loadPresets, type DocPreset } from "./presets";
import { loadSettings } from "../settings/settings";
import { createDefaultStructureBoard, serializeStructureBoard } from "../structure/structureModel";
import { compactSettings, sceneStartOf, type ScriptSettings } from "./scriptSettings";
import { applyCoverToggles } from "../titlepage/titlePage";
import { clearScope, inheritedScope, mergeNotes, notesOfScript, revisionsOfScript, scriptDocs, setNodeScope, visibleTreeFor } from "./scripts";
import {
  findNameConflict,
  findNode,
  findParent,
  folderNamed,
  insertNode,
  makeDoc,
  makeDivider,
  makeFolder,
  moveNode,
  removeNode,
  renameNode,
  setNodeIcon,
  uniqueName,
  type DropPosition,
} from "./tree";

const DOCUMENT_FILTERS = [{ name: "PDF, Word, hwpx 파일만 분석이 가능합니다", extensions: ["pdf", "docx", "hwpx"] }];
const SCRIPT_FILTERS = [{ name: "Fountain 시나리오", extensions: ["fountain", "spmd", "txt"] }];
const LAST_KEY = "dropkick.last";

/** 내보내기 창에서 고른 내용: 원고를 담을지, 뒤에 붙일 다른 문서들 */
type ExportBundle = { script: boolean; extras: ExtraSection[]; /** 내보낸 뒤 Finder에서 그 파일을 보여 준다 */ reveal?: boolean };
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

const RECENTS_KEY = "dropkick.recents";
const RECENTS_MAX = 10;

function readRecents(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** 파일 메뉴의 "최근 프로젝트 열기"에 목록을 알린다. */
function syncRecentMenu(paths: string[]) {
  if (isTauri()) invoke("set_recent_projects", { paths }).catch(() => {});
}

function writeRecents(paths: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(paths));
  } catch {
    // 저장소를 못 써도 앱 동작에는 문제없다.
  }
  syncRecentMenu(paths);
}

function addRecent(path: string) {
  writeRecents([path, ...readRecents().filter((p) => p !== path)].slice(0, RECENTS_MAX));
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

/**
 * 같은 이름이 이미 있을 때 어떻게 할지 묻는다.
 * - replace(대치): 기존 문서를 지우고(휴지통) 그 이름을 쓴다. 문서끼리일 때만 고를 수 있다.
 * - keep(둘 다 보존): 나중 것의 이름 뒤에 2를 붙인다.
 */
async function askNameConflict(name: string, existing: ProjectNode, canReplace: boolean): Promise<"replace" | "keep" | "cancel"> {
  const kind = existing.type === "folder" ? "폴더" : existing.type === "script" ? "스크립트" : "문서";
  const text = `같은 이름의 ${kind}가 이미 있습니다.\n"${name}"`;
  if (!canReplace || !isTauri()) {
    return (await ask(`${text}\n\n둘 다 두고, 나중 것의 이름 뒤에 2를 붙일까요?`, "둘 다 보존")) ? "keep" : "cancel";
  }
  const answer = await message(
    `${text}\n\n· 대치: 기존 문서를 지우고(저장하면 휴지통으로) 이 이름을 씁니다.\n· 둘 다 보존: 나중 것의 이름 뒤에 2를 붙입니다.`,
    { title: "DropKick", kind: "warning", buttons: { yes: "대치", no: "둘 다 보존", cancel: "취소" } },
  );
  if (answer === "대치" || answer === "Yes") return "replace";
  if (answer === "둘 다 보존" || answer === "No") return "keep";
  return "cancel";
}

/** 대치로 지울 수 있는 것: 문서끼리일 때만 (폴더나 스크립트는 통째로 지워지므로 안 된다) */
function canReplaceNode(moving: ProjectNode, existing: ProjectNode): boolean {
  const plain = (n: ProjectNode) => n.type !== "folder" && n.type !== "script";
  return plain(moving) && plain(existing);
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
  // 활성 스크립트: 편집기에서 고쳤거나, 다른 스크립트로 갔다 오며 저장 안 한 글이 남아 있을 때
  if (
    scriptDirty ||
    session.titlePage !== session.savedTitlePage ||
    session.texts.get(session.manifest.mainScript) !== session.savedTexts.get(session.manifest.mainScript)
  ) {
    dirtyDocIds.add(session.manifest.mainScript);
  }
  const treeDirty = session.treeChanged || session.deleted.length > 0;
  const dirty = dirtyDocIds.size > 0 || treeDirty;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const setSession = useCallback(
    (next: Session, openDoc?: string) => {
      sessionRef.current = next;
      if (openDoc) setActiveDocId(openDoc);
      rememberLast(next.path ? { kind: "project", path: next.path } : null);
      if (next.path) addRecent(next.path);
      refresh();
    },
    [refresh],
  );

  /** 활성 스크립트의 설정 (표지 항목 켜고 끄기, 씬 번호 시작, 워터마크) */
  const settingsOf = (manifest: ProjectManifest): ScriptSettings | undefined => manifest.scriptSettings?.[manifest.mainScript];

  /** 편집기가 매길 첫 씬 번호를 이 프로젝트의 활성 스크립트 설정에 맞춘다. (원고를 불러오기 전에 부른다) */
  const applySceneStart = (manifest: ProjectManifest) =>
    editorRef.current?.setSceneStart(sceneStartOf(settingsOf(manifest)));

  const currentScriptText = () =>
    toFountain({
      titlePage: sessionRef.current.titlePage,
      lines: editorRef.current?.getLines() ?? [],
      sceneStart: sceneStartOf(settingsOf(sessionRef.current.manifest)),
    });

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
        const mainId = start.manifest.mainScript;
        const notes = mergeNotes(start.manifest.notes, mainId, editor.getNotes(), mainId);
        const manifest = {
          ...start.manifest,
          title: projectTitleFromPath(path),
          lastOpened: activeRef.current,
          ...(notes.length > 0 ? { notes } : { notes: undefined }),
        };
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
          nodes.map((n) =>
            n.type === "folder"
              ? { ...n, children: applyFiles(n.children) }
              : n.type === "divider"
                ? n
                : { ...n, file: files.get(n.id) ?? n.file },
          );
        const treeUnchanged = current.manifest.tree === start.manifest.tree;
        sessionRef.current = {
          ...current,
          path,
          manifest: treeUnchanged ? saved : { ...current.manifest, title: saved.title, tree: applyFiles(current.manifest.tree) },
          // 저장한 활성 스크립트의 글을 기준으로 삼는다. (다른 스크립트로 바꾸지 않았을 때)
          texts:
            current.manifest.mainScript === start.manifest.mainScript
              ? new Map(current.texts).set(start.manifest.mainScript, texts.get(start.manifest.mainScript) ?? "")
              : current.texts,
          savedManifest: saved,
          savedTexts: texts,
          savedTitlePage: start.titlePage,
          deleted: current.deleted.filter((d) => !start.deleted.includes(d)),
          treeChanged: !treeUnchanged,
        };
        rememberLast({ kind: "project", path });
        addRecent(path);
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

  const setNotes = useCallback(
    (notes: ScriptNote[]) => {
      const current = sessionRef.current;
      const mainId = current.manifest.mainScript;
      const merged = mergeNotes(current.manifest.notes, mainId, notes, mainId);
      sessionRef.current = {
        ...current,
        manifest: { ...current.manifest, notes: merged.length > 0 ? merged : undefined },
        treeChanged: true,
      };
      refresh();
    },
    [refresh],
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
      applySceneStart(loaded.manifest);
      editorRef.current?.load(lines);
      editorRef.current?.setNotes(notesOfScript(loaded.manifest.notes, loaded.manifest.mainScript, loaded.manifest.mainScript));
      setScriptDirty(false);
      // 마지막으로 연 문서를 다시 연다. (스크립트는 활성 스크립트 하나만 편집기에 열린다)
      const last = loaded.manifest.lastOpened ? findNode(loaded.manifest.tree, loaded.manifest.lastOpened) : null;
      const reopen = last && (last.type !== "script" || last.id === loaded.manifest.mainScript);
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
    applySceneStart(manifest);
    editorRef.current?.load(lines);
    setScriptDirty(false);
    setSession(newSession(null, manifest, texts, titlePage, false), manifest.mainScript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmDiscard, editorRef, setScriptDirty, setSession]);

  /** 특정 원고 내용(예: 예시 스크립트)으로 새 프로젝트를 시작한다 */
  const newProjectWithScript = useCallback(
    async (title: string, fountainText: string) => {
      if (!(await confirmDiscard())) return false;
      const { titlePage, lines } = scriptLinesOf(fountainText);
      const { manifest, texts } = createProject(title, { titlePage, lines });
      applySceneStart(manifest);
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
    writeRecents([]);
    const { manifest, texts } = createProject("제목 없음");
    const { titlePage, lines } = scriptLinesOf(texts.get(manifest.mainScript) ?? "");
    applySceneStart(manifest);
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
      applySceneStart(manifest);
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

  /**
   * PDF·Word 시나리오 가져오기: 글자 위치와 모양으로 줄 스타일을 알아내 새 프로젝트로 연다.
   * (원래 파일은 그대로. 어색한 곳은 끝나고 알려 준다)
   */
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importAsk, setImportAsk] = useState<{ questions: Question[]; resolve: (answers: Answers | null) => void } | null>(null);
  const importDocument = useCallback(async () => {
    if (!(await confirmDiscard())) return;
    const chosen = await open({ multiple: false, directory: false, filters: DOCUMENT_FILTERS, title: "PDF, Word, hwpx 파일만 분석이 가능합니다." });
    if (typeof chosen !== "string") return;
    try {
      const { documentKind, importDocumentBytes } = await import("../importer/importDocument");
      const kind = documentKind(chosen);
      if (!kind) throw new ProjectError("Word(.docx), 한글(.hwpx), PDF 파일만 가져올 수 있습니다. 한글(.hwp) 파일은 한글에서 hwpx나 PDF로 저장한 뒤 가져와 주세요.");
      const bytes = new Uint8Array(await invoke<ArrayBuffer>("read_binary", { path: chosen }));
      const imported = await importDocumentBytes(kind, bytes, (questions) => new Promise((resolve) => setImportAsk({ questions, resolve })));
      setImportAsk(null);
      if (!imported) return; // 질문에서 취소
      if (imported.lines.length === 0) throw new ProjectError("글을 찾지 못했습니다. 글자가 이미지로만 된 스캔 문서일 수 있습니다.");
      const name = fileTitle(chosen);
      const title = imported.title ?? name;
      const lines = imported.lines;
      const { manifest, texts } = createProject(name, { titlePage: `Title: ${title}`, lines });
      applySceneStart(manifest);
      editorRef.current?.load(lines);
      setScriptDirty(false);
      setSession(newSession(null, manifest, texts, `Title: ${title}`, false), manifest.mainScript);
      sessionRef.current = { ...sessionRef.current, treeChanged: true };
      refresh();
      setImportResult({ fileName: name, kind, report: imported.report });
    } catch (error) {
      setImportAsk(null);
      await showError("시나리오 문서를 가져오지 못했습니다.", error);
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
    // 그사이 스크립트를 바꾸거나 메모·수정고를 남겼다면 그것은 그대로 둔다.
    const restored = saved.session.manifest;
    const savedActive = findNode(restored.tree, saved.activeDocId);
    sessionRef.current = {
      ...current,
      manifest: {
        ...restored,
        mainScript: current.manifest.mainScript,
        lastOpened: current.manifest.lastOpened,
        notes: current.manifest.notes,
        revisions: current.manifest.revisions,
        scriptSettings: current.manifest.scriptSettings,
      },
      texts,
      deleted: saved.session.deleted,
      treeChanged: true,
    };
    if (savedActive && (savedActive.type !== "script" || savedActive.id === current.manifest.mainScript)) {
      setActiveDocId(saved.activeDocId);
    }
    refresh();
  }, [refresh]);

  const dismissTreeUndo = useCallback(() => setTreeUndo(null), []);

  /** 트리 작업 되돌리기 기록을 비운다. (스크립트를 만들거나 지운 뒤에는 되돌릴 수 없다) */
  const clearTreeUndo = useCallback(() => {
    undoRef.current = null;
    setTreeUndo(null);
  }, []);

  /**
   * 활성 스크립트를 바꾼다: 지금 스크립트의 글과 메모를 보관하고, 고른 스크립트를 편집기에 불러온다.
   * 통계, 씬 목록, 내보내기, 수정고, 메모는 새 스크립트를 따라간다. (실행 취소 기록은 스크립트마다 새로 시작한다)
   */
  const switchScript = useCallback(
    (id: string): boolean => {
      const current = sessionRef.current;
      const editor = editorRef.current;
      const main = current.manifest.mainScript;
      const target = findNode(current.manifest.tree, id);
      if (!editor || !target || target.type !== "script" || id === main) return false;

      const texts = new Map(current.texts);
      if (scriptDirtyRef.current || current.titlePage !== current.savedTitlePage) texts.set(main, currentScriptText());
      const notes = mergeNotes(current.manifest.notes, main, editor.getNotes(), main);
      const { titlePage, lines } = scriptLinesOf(texts.get(id) ?? "");
      editor.setSceneStart(sceneStartOf(current.manifest.scriptSettings?.[id]));
      editor.load(lines.length > 0 ? lines : BLANK_SCRIPT_LINES);
      editor.setNotes(notesOfScript(notes, id, id));
      setScriptDirty(false);
      sessionRef.current = {
        ...current,
        texts,
        titlePage,
        savedTitlePage: titlePage,
        manifest: { ...current.manifest, mainScript: id, lastOpened: id, notes: notes.length > 0 ? notes : undefined },
      };
      setActiveDocId(id);
      refresh();
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editorRef, refresh, setScriptDirty],
  );

  const openDoc = useCallback(
    (id: string) => {
      const node = findNode(sessionRef.current.manifest.tree, id);
      if (!node || node.type === "folder" || node.type === "divider") return;
      // 다른 스크립트는 편집기에 불러와서 연다.
      if (node.type === "script" && id !== sessionRef.current.manifest.mainScript) {
        switchScript(id);
        return;
      }
      setActiveDocId(id);
    },
    [switchScript],
  );

  /** 편집기에 열린(활성) 스크립트를 앞에 보여 준다. */
  const openMainScript = useCallback(() => setActiveDocId(sessionRef.current.manifest.mainScript), []);

  /** 새 스크립트: 폴더 안(없으면 다른 스크립트들 바로 뒤)에 빈 원고를 만들고 연다. */
  const addScript = useCallback(
    (parentId: string | null): string => {
      const current = sessionRef.current;
      const made = makeDoc(current.manifest.tree, "script", parentId);
      let tree = insertNode(current.manifest.tree, made, parentId);
      if (parentId === null) {
        const lastScript = [...tree].reverse().find((n) => n.type === "script" && n.id !== made.id);
        if (lastScript) tree = moveNode(tree, made.id, lastScript.id, "after");
      }
      const texts = new Map(current.texts);
      texts.set(made.id, toFountain({ titlePage: `Title: ${sessionTitle(current)}`, lines: BLANK_SCRIPT_LINES }));
      clearTreeUndo();
      updateTree(tree, { texts });
      switchScript(made.id);
      return made.id;
    },
    [clearTreeUndo, switchScript, updateTree],
  );

  /** 스크립트를 복제해서 새 버전으로 만들고 연다. (글과 메모만 복사한다. 수정고는 복사하지 않는다) */
  const duplicateScript = useCallback(
    (id: string): string | null => {
      const current = sessionRef.current;
      const editor = editorRef.current;
      const source = findNode(current.manifest.tree, id);
      if (!editor || !source || source.type !== "script") return null;
      const main = current.manifest.mainScript;
      const parent = findParent(current.manifest.tree, id);
      const siblings = parent ? parent.children : current.manifest.tree;
      const doc: DocNode = { id: newId("script"), type: "script", name: uniqueName(siblings, `${source.name} 복사본`), file: "" };

      const texts = new Map(current.texts);
      texts.set(doc.id, id === main ? currentScriptText() : (current.texts.get(id) ?? ""));
      const all = mergeNotes(current.manifest.notes, main, editor.getNotes(), main);
      const copied = notesOfScript(all, id, main).map((n) => ({ ...n, id: newId("note"), script: doc.id }));

      let tree = insertNode(current.manifest.tree, doc, parent?.id ?? null);
      tree = moveNode(tree, doc.id, id, "after");
      clearTreeUndo();
      updateTree(tree, { texts });
      const now = sessionRef.current;
      const notes = [...all, ...copied];
      const sourceSettings = now.manifest.scriptSettings?.[id];
      sessionRef.current = {
        ...now,
        manifest: {
          ...now.manifest,
          notes: notes.length > 0 ? notes : undefined,
          ...(sourceSettings ? { scriptSettings: { ...now.manifest.scriptSettings, [doc.id]: { ...sourceSettings } } } : {}),
        },
      };
      switchScript(doc.id);
      return doc.id;
    },
    [clearTreeUndo, editorRef, switchScript, updateTree],
  );

  /**
   * 새 문서를 폴더 안에 만들고 연다. 만든 문서의 id를 돌려준다.
   * - memo: 빈 일반 문서
   * - character: 인물 설정 양식 (name을 주면 그 이름으로)
   * - structure: 3막 구조 보드 (세이브 더 캣 15단계)
   */
  const addDoc = useCallback(
    (parentId: string | null, type: "memo" | "character" | "structure" = "memo", name?: string, scoped = false) => {
      const current = sessionRef.current;
      const tree = current.manifest.tree;
      const parent = parentId;
      const made = makeDoc(tree, type, parent);
      const siblings = parent ? ((findNode(tree, parent) as { children?: ProjectNode[] })?.children ?? []) : tree;
      // 스크립트 전용 폴더 안에 만들면 그 스크립트 전용이 된다. 3막 구조는 스크립트의 씬을 가리키므로,
      // 스크립트가 여럿이면 지금 스크립트 전용으로 만든다. (scoped: 호출한 쪽이 전용으로 만들겠다고 한 경우)
      const multi = scriptDocs(tree).length > 1;
      const scriptId =
        inheritedScope(tree, parent) ?? (multi && (type === "structure" || scoped) ? current.manifest.mainScript : undefined);
      // 다른 스크립트 전용 문서와는 같은 이름이어도 된다.
      const named = name ? { ...made, name: uniqueName(siblings, name.trim() || made.name, undefined, scriptId) } : made;
      const doc: DocNode = scriptId ? { ...named, scriptId } : named;
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

  /**
   * 통계에서 "인물 설정 만들기": 인물 설정 문서를 만든다.
   * 스크립트가 여럿이면 지금 스크립트 전용으로 만들고, 인물 설정 폴더가 다른 스크립트 전용이면
   * 지금 스크립트 전용 폴더를 새로 만들어 그 안에 둔다.
   */
  const addCharacterProfile = useCallback(
    (name: string): string => {
      const current = sessionRef.current;
      const tree = current.manifest.tree;
      const main = current.manifest.mainScript;
      if (scriptDocs(tree).length <= 1) return addDoc(folderNamed(tree, "인물 설정"), "character", name);
      const shown = visibleTreeFor(tree, main).tree;
      let folderId = folderNamed(shown, "인물 설정");
      if (!folderId && folderNamed(tree, "인물 설정")) {
        const scriptName = findNode(tree, main)?.name ?? "";
        const folder: FolderNode = {
          ...makeFolder(tree, null),
          name: uniqueName(tree, `인물 설정 (${scriptName})`, undefined, undefined, true),
          scriptId: main,
        };
        updateTree(insertNode(tree, folder, null), {});
        folderId = folder.id;
      }
      return addDoc(folderId, "character", name, true);
    },
    [addDoc, updateTree],
  );

  /** 양식으로 새 문서를 폴더 안에 만들고 연다. */
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
      const inherited = made.type === "script" ? undefined : inheritedScope(tree, parent);
      const doc: DocNode = {
        ...made,
        name: uniqueName(siblings, baseName, undefined, inherited),
        ...(customIcon ? { icon: customIcon } : {}),
        ...(inherited ? { scriptId: inherited } : {}),
      };
      const texts = new Map(current.texts);
      texts.set(doc.id, formatPresetText(preset, doc.name));
      if (doc.type === "script") {
        // 스크립트 양식은 새 스크립트로 만들어 연다.
        clearTreeUndo();
        updateTree(insertNode(tree, doc, parent), { texts });
        switchScript(doc.id);
        return doc.id;
      }
      updateTree(insertNode(tree, doc, parent), { texts }, `"${doc.name}"을(를) 만들었습니다`);
      setActiveDocId(doc.id);
      return doc.id;
    },
    [clearTreeUndo, switchScript, updateTree],
  );

  /** 이미 열려 있는 일반 문서에 양식을 적용한다. */
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
      updateTree(nextTree, { texts }, `"${node.name}"에 "${preset.name}" 양식을 적용했습니다`);
    },
    [updateTree],
  );

  const addFolder = useCallback(
    (parentId: string | null = null) => {
      const current = sessionRef.current;
      const made = makeFolder(current.manifest.tree, parentId);
      const inherited = inheritedScope(current.manifest.tree, parentId);
      const folder: FolderNode = inherited ? { ...made, scriptId: inherited } : made;
      updateTree(insertNode(current.manifest.tree, folder, parentId), {}, `"${folder.name}" 폴더를 만들었습니다`);
      return folder.id;
    },
    [updateTree],
  );

  /** 구분선을 만든다. afterId가 있으면 그 항목 바로 뒤에, 없으면 폴더(또는 맨 위)의 맨 끝에 둔다. */
  const addDivider = useCallback(
    (parentId: string | null = null, afterId?: string) => {
      const current = sessionRef.current;
      const divider = makeDivider();
      let tree = insertNode(current.manifest.tree, divider, parentId);
      if (afterId) tree = moveNode(tree, divider.id, afterId, "after");
      updateTree(tree, {}, "구분선을 추가했습니다");
      return divider.id;
    },
    [updateTree],
  );

  /** 문서 하나를 트리와 글에서 뺀다 (저장할 때 파일은 휴지통으로). 대치할 때 쓴다. */
  const dropDoc = (session: Session, docId: string) => {
    const result = removeNode(session.manifest.tree, docId);
    const savedIds = new Set(session.savedManifest ? walkDocs(session.savedManifest.tree).map((d) => d.id) : []);
    const texts = new Map(session.texts);
    for (const doc of result.removed) texts.delete(doc.id);
    return {
      tree: result.tree,
      extra: { texts, deleted: [...session.deleted, ...result.removed.filter((d) => savedIds.has(d.id))] } as Partial<Session>,
    };
  };

  // 이름 입력칸이 Enter와 포커스 이동으로 두 번 알려도 묻는 창은 한 번만 띄운다.
  const renamingRef = useRef(new Set<string>());

  const rename = useCallback(
    async (id: string, name: string) => {
      if (renamingRef.current.has(id)) return;
      renamingRef.current.add(id);
      try {
        await renameAsk(id, name);
      } finally {
        renamingRef.current.delete(id);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const renameAsk = async (id: string, name: string) => {
    const first = sessionRef.current;
    const node = findNode(first.manifest.tree, id);
    const trimmed = name.trim();
    if (!node || node.type === "divider" || !trimmed || node.name === trimmed) return;

    // 같은 폴더에 같은 이름이 있으면 어떻게 할지 묻는다.
    const parent = findParent(first.manifest.tree, id);
    const siblings = parent ? parent.children : first.manifest.tree;
    const scope = node.type === "folder" ? undefined : node.scriptId;
    const conflict = findNameConflict(siblings, trimmed, id, scope, node.type === "folder");
    let replaceId: string | null = null;
    if (conflict) {
      const choice = await askNameConflict(trimmed, conflict, canReplaceNode(node, conflict));
      if (choice === "cancel") return;
      if (choice === "replace") replaceId = conflict.id;
    }

    const current = sessionRef.current;
    let base = current;
    let extra: Partial<Session> = {};
    if (replaceId && findNode(current.manifest.tree, replaceId)) {
      const dropped = dropDoc(current, replaceId);
      base = { ...current, manifest: { ...current.manifest, tree: dropped.tree } };
      extra = dropped.extra;
      if (activeRef.current === replaceId) setActiveDocId(current.manifest.mainScript);
    }
    const tree = renameNode(base.manifest.tree, id, trimmed);
    // 본문 첫 제목이 옛 이름 그대로면 새 이름으로 함께 바꾼다. ("# 새 인물" → "# 민재")
    const renamed = findNode(tree, id);
    const texts = extra.texts ?? current.texts;
    const text = texts.get(id);
    const heading = `# ${node.name}`;
    const label = replaceId ? `"${renamed?.name ?? trimmed}"(으)로 바꾸고 같은 이름의 문서를 지웠습니다` : `이름을 "${renamed?.name ?? trimmed}"(으)로 바꿨습니다`;
    if (renamed && text !== undefined && (text === heading || text.startsWith(`${heading}\n`))) {
      const next = new Map(texts);
      next.set(id, `# ${renamed.name}${text.slice(heading.length)}`);
      updateTree(tree, { ...extra, texts: next }, label);
    } else {
      updateTree(tree, extra, label);
    }
  };

  const remove = useCallback(
    async (id: string) => {
      const first = sessionRef.current;
      const node = findNode(first.manifest.tree, id);
      if (!node) return;
      // 구분선은 묻지 않고 바로 지운다. (되돌리기 알림에서 되돌릴 수 있다)
      if (node.type === "divider") {
        updateTree(removeNode(first.manifest.tree, id).tree, {}, "구분선을 지웠습니다");
        return;
      }
      const docs = node.type === "folder" ? walkDocs(node.children) : [node];
      if (node.type === "folder" && docs.some((d) => d.type === "script")) {
        await notify("스크립트가 들어 있는 폴더는 지울 수 없습니다.\n스크립트를 먼저 지우거나 폴더 밖으로 옮겨 주세요.", "warning");
        return;
      }

      if (node.type === "script") {
        const all = scriptDocs(first.manifest.tree);
        if (all.length <= 1) {
          await notify("스크립트는 하나 이상 있어야 합니다.\n지우려면 먼저 다른 스크립트를 만들어 주세요.", "warning");
          return;
        }
        const main = first.manifest.mainScript;
        const revs = revisionsOfScript(first.manifest.revisions, id, main);
        const extra = revs.length > 0 ? `\n수정고 ${revs.length}개와 메모도 함께 지워집니다.` : "\n이 스크립트의 메모도 함께 지워집니다.";
        if (!(await ask(`"${node.name}" 스크립트를 지울까요?${extra}\n저장하면 파일이 휴지통으로 옮겨집니다.`, "지우기"))) return;
        // 수정고 폴더는 바로 휴지통으로 옮긴다.
        for (const rev of revs) memoryRevisions.current.delete(rev.id);
        if (isTauri() && first.path) {
          try {
            for (const rev of revs) await tauriFs.trash(joinPath(first.path, rev.dir));
          } catch (error) {
            await showError("수정고를 지우지 못했습니다.", error);
            return;
          }
        }
        // 지우는 스크립트가 열려 있으면 이웃 스크립트로 먼저 옮겨 간다.
        if (sessionRef.current.manifest.mainScript === id) {
          const index = all.findIndex((d) => d.id === id);
          switchScript((all[index + 1] ?? all[index - 1]).id);
        }
        const current = sessionRef.current;
        const result = removeNode(current.manifest.tree, id);
        const savedIds = new Set(current.savedManifest ? walkDocs(current.savedManifest.tree).map((d) => d.id) : []);
        const texts = new Map(current.texts);
        texts.delete(id);
        const notes = (current.manifest.notes ?? []).filter((n) => n.script !== id);
        const revisions = (current.manifest.revisions ?? []).filter((r) => r.script !== id);
        const scriptSettings = { ...current.manifest.scriptSettings };
        delete scriptSettings[id];
        clearTreeUndo();
        updateTree(clearScope(result.tree, id), {
          texts,
          deleted: [...current.deleted, ...result.removed.filter((d) => savedIds.has(d.id))],
        });
        const now = sessionRef.current;
        sessionRef.current = {
          ...now,
          manifest: {
            ...now.manifest,
            notes: notes.length > 0 ? notes : undefined,
            revisions: revisions.length > 0 ? revisions : undefined,
            scriptSettings: Object.keys(scriptSettings).length > 0 ? scriptSettings : undefined,
          },
        };
        refresh();
        return;
      }

      const current = first;
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
    [clearTreeUndo, refresh, switchScript, updateTree],
  );

  /** 문서나 폴더를 볼 스크립트를 정한다. scriptId가 없으면 모든 스크립트에서 보이는 공통 항목이 된다. */
  const setScope = useCallback(
    (id: string, scriptId?: string) => {
      const current = sessionRef.current;
      const node = findNode(current.manifest.tree, id);
      if (!node || node.type === "script" || (node.scriptId ?? undefined) === scriptId) return;
      const target = scriptId ? findNode(current.manifest.tree, scriptId) : null;
      const label = target ? `"${node.name}"을(를) "${target.name}" 전용으로 정했습니다` : `"${node.name}"을(를) 모든 스크립트에서 보이게 했습니다`;
      updateTree(setNodeScope(current.manifest.tree, id, scriptId), {}, label);
    },
    [updateTree],
  );

  const move = useCallback(
    async (id: string, targetId: string, position: DropPosition) => {
      const first = sessionRef.current;
      const tree = first.manifest.tree;
      const node = findNode(tree, id);
      const target = findNode(tree, targetId);
      if (!node || !target || id === targetId) return;

      // 다른 폴더로 옮겨 가는데 거기에 같은 이름이 있으면 어떻게 할지 묻는다.
      const destId = position === "inside" ? targetId : (findParent(tree, targetId)?.id ?? null);
      const sameFolder = (findParent(tree, id)?.id ?? null) === destId;
      const scope = node.type === "folder" ? undefined : (inheritedScope(tree, destId) ?? node.scriptId);
      let replaceId: string | null = null;
      if (!sameFolder && node.type !== "divider" && !(position === "inside" && target.type !== "folder")) {
        const destFolder = destId ? findNode(tree, destId) : null;
        const siblings = destFolder && destFolder.type === "folder" ? destFolder.children : tree;
        const conflict = findNameConflict(siblings, node.name, id, scope, node.type === "folder");
        if (conflict) {
          const choice = await askNameConflict(node.name, conflict, canReplaceNode(node, conflict));
          if (choice === "cancel") return;
          if (choice === "replace") replaceId = conflict.id;
        }
      }

      const current = sessionRef.current;
      let base = current;
      let extra: Partial<Session> = {};
      if (replaceId && findNode(current.manifest.tree, replaceId)) {
        const dropped = dropDoc(current, replaceId);
        base = { ...current, manifest: { ...current.manifest, tree: dropped.tree } };
        extra = dropped.extra;
        if (activeRef.current === replaceId) setActiveDocId(current.manifest.mainScript);
      }
      let next = moveNode(base.manifest.tree, id, targetId, position, scope);
      // 스크립트 전용 폴더로 옮기면 그 스크립트 전용이 된다.
      if (next !== base.manifest.tree) {
        const inherited = inheritedScope(next, findParent(next, id)?.id ?? null);
        if (inherited && node.type !== "script") next = setNodeScope(next, id, inherited);
        updateTree(next, extra, `"${node.name}"을(를) 옮겼습니다`);
      }
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

  /** 활성 스크립트의 설정을 바꾼다. (표지 항목 켜고 끄기, 첫 씬 번호, 워터마크) */
  const setScriptSettings = useCallback(
    (patch: ScriptSettings) => {
      const current = sessionRef.current;
      const main = current.manifest.mainScript;
      const next = compactSettings({ ...current.manifest.scriptSettings?.[main], ...patch });
      const all = { ...current.manifest.scriptSettings };
      if (next) all[main] = next;
      else delete all[main];
      sessionRef.current = {
        ...current,
        manifest: { ...current.manifest, scriptSettings: Object.keys(all).length > 0 ? all : undefined },
        treeChanged: true,
      };
      editorRef.current?.setSceneStart(sceneStartOf(next));
      refresh();
    },
    [editorRef, refresh],
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
        script: current.manifest.mainScript,
      };
      const content: RevisionContent = {
        meta,
        script: currentScriptText(),
        // 이 스크립트에서 보이는 설정 문서(공통 + 이 스크립트 전용)를 함께 보관한다.
        docs: settingsDocs(visibleTreeFor(current.manifest.tree, current.manifest.mainScript).tree).map(({ doc, folders }) => ({
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
      if ((meta.script ?? sessionRef.current.manifest.mainScript) !== sessionRef.current.manifest.mainScript) {
        await notify("다른 스크립트의 수정고입니다. 그 스크립트를 연 뒤에 되돌려 주세요.", "warning");
        return false;
      }
      const content = await loadRevision(meta);
      if (!content) return false;
      const stamp = new Date().toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      if (!(await createRevision(`되돌리기 전 (${stamp})`, `"${meta.name}"로 되돌리기 전 자동 보관`, stats))) return false;

      const { titlePage, lines } = scriptLinesOf(content.script);
      editorRef.current?.load(lines.length > 0 ? lines : [{ style: "action", text: "" }]);
      const restoredFrom = sessionRef.current.manifest;
      editorRef.current?.setNotes(notesOfScript(restoredFrom.notes, restoredFrom.mainScript, restoredFrom.mainScript));
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

  // ---------- PDF & Word ----------

  /** 내보낼 원고: 스크립트 설정을 반영한다. (표지에서 끈 항목은 빼고, 첫 씬 번호를 쓴다) */
  const exportDocument = (doc: { titlePage: string | null; lines: ScriptLine[] }) => {
    const settings = settingsOf(sessionRef.current.manifest);
    return {
      titlePage: applyCoverToggles(doc.titlePage, settings?.coverOff),
      lines: doc.lines,
      sceneStart: sceneStartOf(settings),
    };
  };

  /** 스크립트가 여럿이면 파일 이름에 지금 스크립트 이름을 붙인다. */
  const scriptLabel = () => {
    const { manifest } = sessionRef.current;
    if (scriptDocs(manifest.tree).length <= 1) return "";
    const name = findNode(manifest.tree, manifest.mainScript)?.name;
    return name ? ` ${name}` : "";
  };

  /** PDF로 내보내기. source를 주면(예: 수정고) 그 원고를, 없으면 지금 원고를 내보낸다. */
  const exportPdf = useCallback(async (source?: { name: string; script: string }, bundle?: ExportBundle) => {
    const editor = editorRef.current;
    if (!editor) return;
    const chosen = await save({
      defaultPath: `${sessionTitle(sessionRef.current)}${scriptLabel()}${source ? ` ${source.name}` : ""}${bundle?.script === false ? " 문서" : ""}.pdf`,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (!chosen) return;
    const path = /\.pdf$/i.test(chosen) ? chosen : `${chosen}.pdf`;
    try {
      // PDF 만드는 코드는 필요할 때만 불러온다. (앱 시작을 가볍게)
      const { buildPdf } = await import("../pdf/buildPdf");
      const settings = settingsOf(sessionRef.current.manifest);
      const doc = bundle?.script === false ? null : exportDocument(source ? scriptLinesOf(source.script) : { titlePage: sessionRef.current.titlePage, lines: editor.getLines() });
      const bytes = await buildPdf(doc, await loadFonts(), bundle?.extras, { watermark: settings?.watermark });
      await invoke("write_binary", bytes, { headers: { path: encodeURIComponent(path) } });
      if (bundle?.reveal) await invoke("reveal_in_finder", { path }).catch(() => {}); // 파일은 이미 저장했으니 Finder를 못 열어도 오류로 알리지 않는다
    } catch (error) {
      await showError("PDF를 만들지 못했습니다.", error);
    }
  }, [editorRef]);

  /** Word(.docx)로 내보내기 */
  const exportDocx = useCallback(async (source?: { name: string; script: string }, bundle?: ExportBundle) => {
    const editor = editorRef.current;
    if (!editor) return;
    const chosen = await save({
      defaultPath: `${sessionTitle(sessionRef.current)}${scriptLabel()}${source ? ` ${source.name}` : ""}${bundle?.script === false ? " 문서" : ""}.docx`,
      filters: [{ name: "Word 문서", extensions: ["docx"] }],
    });
    if (!chosen) return;
    const path = /\.docx$/i.test(chosen) ? chosen : `${chosen}.docx`;
    try {
      const { buildDocx } = await import("../docx/buildDocx");
      const doc = bundle?.script === false ? null : exportDocument(source ? scriptLinesOf(source.script) : { titlePage: sessionRef.current.titlePage, lines: editor.getLines() });
      const bytes = await buildDocx(doc, bundle?.extras);
      await invoke("write_binary", bytes, { headers: { path: encodeURIComponent(path) } });
      if (bundle?.reveal) await invoke("reveal_in_finder", { path }).catch(() => {}); // 파일은 이미 저장했으니 Finder를 못 열어도 오류로 알리지 않는다
    } catch (error) {
      await showError("Word 문서를 만들지 못했습니다.", error);
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
      if (id.startsWith("recent:")) {
        const path = id.slice("recent:".length);
        return runExclusive(async () => {
          if (!(await confirmDiscard())) return;
          try {
            await openProjectAt(path);
          } catch (error) {
            // 지워지거나 옮겨진 프로젝트는 목록에서 뺀다.
            writeRecents(readRecents().filter((p) => p !== path));
            await showError("프로젝트를 열지 못했습니다. 목록에서 뺐습니다.", error);
          }
        });
      }
      if (id === "recent_clear") return writeRecents([]);
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
        case "import_document":
          return runExclusive(importDocument);
        case "save":
          return runExclusive(saveCurrent);
        case "save_as":
          return runExclusive(saveAs);
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
    exportDocx,
    exportPdf,
    importFountain,
    importDocument,
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
      syncRecentMenu(readRecents());
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
          applySceneStart(recovery.manifest);
          editorRef.current?.load(lines.length > 0 ? lines : [{ style: "action", text: "" }]);
          editorRef.current?.setNotes(
            notesOfScript(recovery.manifest.notes, recovery.manifest.mainScript, recovery.manifest.mainScript),
          );
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
    activeNode && activeNode.type !== "folder" && activeNode.type !== "divider"
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
    /** 활성 스크립트의 설정 */
    scriptSettings: settingsOf(session.manifest),
    setScriptSettings,
    saveStatus,
    autosaving: Boolean(session.path),
    importAsk,
    answerImport: (answers: Answers | null) => {
      importAsk?.resolve(answers);
      setImportAsk(null);
    },
    importResult,
    dismissImportResult: () => setImportResult(null),
    treeUndo,
    undoTree,
    dismissTreeUndo,
    dirtyDocIds,
    /** 앱을 끝내거나 다시 시작하기 전: 저장 안 한 내용이 있으면 저장하거나 묻는다 */
    prepareToClose: confirmDiscard,
    /** 지금(활성) 스크립트의 수정고 */
    revisions: revisionsOfScript(session.manifest.revisions, session.manifest.mainScript, session.manifest.mainScript),
    exportRevisionPdf: (name: string, script: string) => runExclusive(() => exportPdf({ name, script })),
    exportRevisionDocx: (name: string, script: string) => runExclusive(() => exportDocx({ name, script })),
    /** 내보내기 창에서 고른 내용으로 PDF나 Word 파일을 만든다. */
    exportBundle: (format: "pdf" | "docx", selection: { script: boolean; docIds: string[]; reveal?: boolean }) =>
      runExclusive(() => {
        const session = sessionRef.current;
        const nodes = new Map(walkDocs(session.manifest.tree).map((n) => [n.id, n]));
        const extras = selection.docIds.flatMap((id) => {
          const node = nodes.get(id);
          if (!node || node.type === "script") return [];
          return [buildExtraSection(node.type, node.name, session.texts.get(id) ?? "")];
        });
        const bundle = { script: selection.script, extras, reveal: selection.reveal };
        return format === "pdf" ? exportPdf(undefined, bundle) : exportDocx(undefined, bundle);
      }),
    createRevision,
    loadRevision,
    restoreRevision,
    deleteRevision,
    treeDirty,
    /** 메모를 붙이거나 고치거나 지웠다: 프로젝트 파일에 저장해야 하는 변경으로 표시한다 */
    setNotes,
    setScriptDirty,
    setDocText,
    openDoc,
    openMainScript,
    addDivider,
    addCharacterProfile,
    addScript,
    duplicateScript,
    setScope,
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
