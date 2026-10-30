import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fromFountain } from "./fountain/fountain";
import { Editor, type EditorHandle, type EditorInfo } from "./editor/Editor";
import { TextEditor, type TextEditorHandle } from "./editor/TextEditor";
import { LINE_STYLES, STYLE_LABELS, shortcutFor } from "./editor/styles";
import { useProject } from "./project/useProject";
import { findNode, findParent, folderNamed } from "./project/tree";
import { BLANK_SCRIPT_LINES, DOC_TYPE_LABELS, walkDocs, type DocNode } from "./project/model";
import { DEFAULT_PRESETS, isDefaultPreset, loadPresets, savePresets, type DocPreset } from "./project/presets";
import {
  DEFAULT_SETTINGS,
  clearAllAppStorage,
  loadSettings,
  normalizeZoom,
  saveSettings,
  type AppSettings,
} from "./settings/settings";
import { SettingsDialog } from "./settings/SettingsDialog";
import { AboutDialog } from "./settings/AboutDialog";
import { ScreenplayGuideDialog, GUIDE_SEEN_KEY } from "./guide/ScreenplayGuideDialog";
import { characterKey, sceneAtLine, type ScriptAnalysis } from "./analysis/analyze";
import { ProjectTree } from "./panels/ProjectTree";
import { PresetEditorView } from "./panels/PresetEditorView";
import { SfSymbolIcon } from "./panels/sfSymbols";
import { StructureBoardView } from "./structure/StructureBoardView";
import { TitlePageDialog } from "./titlepage/TitlePageDialog";
import { RenameCharacterDialog } from "./panels/RenameCharacterDialog";
import { RevisionView, type Snapshot } from "./revisions/RevisionView";
import { NewRevisionDialog } from "./revisions/NewRevisionDialog";
import { nextRevisionName, settingsDocs } from "./revisions/revisions";
import { useUpdater } from "./update/useUpdater";
import { StatsPanel } from "./panels/StatsPanel";
import {
  INITIAL_PANES,
  closePane,
  normalizePanes,
  openBesideScript,
  paneShowing,
  parsePanes,
  revealScript,
  sameTarget,
  scriptPane,
  serializePanes,
  setSplit,
  showInPane,
  swapPanes,
  type PaneIndex,
  type PaneState,
  type PaneTarget,
} from "./split/paneTargets";
import { PaneHeader } from "./split/PaneHeader";
import { SplitDivider } from "./split/SplitDivider";
import { useElementWidth } from "./split/useElementWidth";
import "./App.css";
import "./panels/panels.css";

const numberFormat = new Intl.NumberFormat("ko-KR");

const EMPTY_ANALYSIS: ScriptAnalysis = {
  pages: 1,
  scenes: [],
  characters: [],
  runtimeMinutes: 0,
  dialogueChars: 0,
  actionChars: 0,
};

// 패널을 열어 둔 상태는 이 컴퓨터에 기억한다.
function usePanelSetting(key: string, initial: boolean) {
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? initial : saved === "1";
    } catch {
      return initial;
    }
  });
  const toggle = useCallback(() => {
    setOpen((value) => {
      try {
        localStorage.setItem(key, value ? "0" : "1");
      } catch {
        // 저장하지 못해도 동작에는 문제없다.
      }
      return !value;
    });
  }, [key]);
  return [open, toggle, setOpen] as const;
}

const PANES_KEY = "dropkick.panes";
/** 원고 용지 폭(8.5in)과 양옆 여백. 화면이 이보다 좁으면 용지를 줄여서 보여준다. */
const PAPER_FIT_WIDTH = 8.5 * 96 + 32;

function loadPaneState(): PaneState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PANES_KEY);
  } catch {
    // 읽지 못하면 처음 상태로 시작한다.
  }
  // 문서·수정고 id는 프로젝트마다 달라서 기억하지 않고, 원고·통계만 복원한다.
  return normalizePanes(parsePanes(raw), { docIds: new Set(), revisionIds: new Set(), mainScriptId: "" });
}

type PresetModalState = {
  initial: DocPreset | null;
  draft?: { name: string; body: string; icon?: string; docType?: "character" | "memo" };
};

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const textRefs = [useRef<TextEditorHandle>(null), useRef<TextEditorHandle>(null)];
  const [paneState, setPaneState] = useState<PaneState>(loadPaneState);
  // 이벤트 안에서 바로 이어 쓸 수 있도록 최신 값을 따로 들고 있는다.
  const paneRef = useRef(paneState);
  paneRef.current = paneState;
  // 프로젝트 쪽은 "글 편집기 하나"로 알고 있으므로, 지금 포커스가 있는 화면의 편집기로 연결해 준다.
  const textEditorRef = useRef<TextEditorHandle | null>(null);
  if (!textEditorRef.current) {
    const focused = () => textRefs[paneRef.current.focus].current;
    textEditorRef.current = {
      undo: () => focused()?.undo(),
      redo: () => focused()?.redo(),
      find: () => focused()?.find(),
      focus: () => focused()?.focus(),
    };
  }
  const panesAreaRef = useRef<HTMLDivElement>(null);
  const scriptPaneRef = useRef<HTMLDivElement>(null);
  const scriptPaneWidth = useElementWidth(scriptPaneRef);
  const [info, setInfo] = useState<EditorInfo>({
    lines: 0,
    chars: 0,
    charsNoSpace: 0,
    characters: 0,
    scenes: 0,
    page: 1,
    pages: 1,
    line: 1,
    style: "action",
  });
  const [analysis, setAnalysis] = useState<ScriptAnalysis>(EMPTY_ANALYSIS);
  const [treeFilter, setTreeFilter] = useState("");
  const [editingTitlePage, setEditingTitlePage] = useState(false);
  const [renamingCharacter, setRenamingCharacter] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null);
  const [newRevisionOpen, setNewRevisionOpen] = useState(false);
  const [presets, setPresets] = useState<DocPreset[]>(() => loadPresets());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(() => {
    return localStorage.getItem(GUIDE_SEEN_KEY) !== "true";
  });
  const [presetMenuPos, setPresetMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [presetModal, setPresetModalState] = useState<PresetModalState | null>(null);
  // 프리셋 편집 화면은 열 때 포커스가 있던 화면을 덮는다.
  const presetPaneRef = useRef<PaneIndex>(0);
  const setPresetModal = useCallback((value: PresetModalState | null) => {
    if (value) presetPaneRef.current = paneRef.current.split ? paneRef.current.focus : 0;
    setPresetModalState(value);
  }, []);
  const [showSidebar, toggleSidebar, setShowSidebar] = usePanelSetting("dropkick.panel.scenes", true);
  const project = useProject(editorRef, textEditorRef, BLANK_SCRIPT_LINES);
  const scriptName = findNode(project.tree, project.mainScriptId)?.name ?? "스크립트";

  // ---------- 화면 나누기 ----------
  const { openDoc, mainScriptId } = project;
  const split = paneState.split;
  const focusedIndex: PaneIndex = split ? paneState.focus : 0;
  const presetPane: PaneIndex | null = presetModal ? (split ? presetPaneRef.current : 0) : null;
  /** 한 화면에 실제로 보이는 것 (프리셋 편집 화면이 덮고 있으면 그것) */
  type Shown = PaneTarget | { kind: "preset" };
  const shownIn = (index: PaneIndex): Shown => (presetPane === index ? { kind: "preset" } : paneState.panes[index]);
  const focusedShown = shownIn(focusedIndex);
  const focusedRevision =
    focusedShown.kind === "revision" ? project.revisions.find((r) => r.id === focusedShown.id) ?? null : null;
  const focusedDocNode =
    focusedShown.kind === "doc" ? (findNode(project.tree, focusedShown.id) as DocNode | null) : null;
  const isScript = focusedShown.kind === "script";
  const isStructure = focusedDocNode?.type === "structure";
  const openRevision = focusedRevision;
  const scriptIndex = scriptPane(paneState);
  const scriptVisible = scriptIndex !== null;
  const showStats = paneShowing(paneState, { kind: "stats" }) !== null;
  const structureIndex = (() => {
    for (const i of split ? [0, 1] : [0]) {
      const t = paneState.panes[i];
      if (t.kind === "doc" && findNode(project.tree, t.id)?.type === "structure") return i as PaneIndex;
    }
    return null;
  })();

  const docTarget = useCallback(
    (id: string): PaneTarget => (id === mainScriptId ? { kind: "script" } : { kind: "doc", id }),
    [mainScriptId],
  );

  /** 화면 상태를 바꾸고, 포커스가 있는 화면이 문서면 프로젝트의 '열린 문서'도 맞춘다. */
  const applyPanes = useCallback(
    (next: PaneState) => {
      paneRef.current = next;
      setPaneState(next);
      const t = next.panes[next.split ? next.focus : 0];
      if (t.kind === "script") openDoc(mainScriptId);
      else if (t.kind === "doc") openDoc(t.id);
    },
    [mainScriptId, openDoc],
  );

  /** 포커스가 있는 화면에 연다. 다른 화면이 이미 열고 있으면 그 화면으로 포커스만 옮긴다. */
  const openTarget = useCallback(
    (target: PaneTarget) => {
      const s = paneRef.current;
      const at = paneShowing(s, target);
      applyPanes(at !== null ? { ...s, focus: at } : showInPane(s, s.split ? s.focus : 0, target));
    },
    [applyPanes],
  );

  const focusPane = useCallback(
    (index: PaneIndex) => {
      const s = paneRef.current;
      if (!s.split || s.focus === index) return;
      applyPanes({ ...s, focus: index });
    },
    [applyPanes],
  );

  /** 화면 하나를 치운다: 나눠 놓았으면 그 화면을 닫고, 아니면 원고로 돌아간다. */
  const dismissPane = useCallback(
    (index: PaneIndex) => {
      const s = paneRef.current;
      applyPanes(s.split ? closePane(s, index) : showInPane(s, 0, { kind: "script" }));
    },
    [applyPanes],
  );

  const toggleSplit = useCallback(() => {
    const s = paneRef.current;
    if (s.split) return applyPanes(setSplit(s, false));
    const board = walkDocs(project.tree).find((d) => d.type === "structure");
    const second: PaneTarget | undefined =
      s.panes[0].kind === "script" && board ? { kind: "doc", id: board.id } : undefined;
    applyPanes(setSplit(s, true, second));
  }, [applyPanes, project.tree]);

  const toggleStats = useCallback(() => {
    const s = paneRef.current;
    const at = paneShowing(s, { kind: "stats" });
    if (at !== null) dismissPane(at);
    else applyPanes(openBesideScript(s, { kind: "stats" }));
  }, [applyPanes, dismissPane]);

  const setRatio = useCallback((ratio: number) => setPaneState((s) => ({ ...s, ratio })), []);

  // 설정 기억
  useEffect(() => {
    try {
      localStorage.setItem(PANES_KEY, serializePanes(paneState));
    } catch {
      // 저장하지 못해도 동작에는 문제없다.
    }
  }, [paneState]);

  // 문서나 수정고가 사라지면 그 화면은 원고로 돌린다.
  useEffect(() => {
    const valid = {
      docIds: new Set(walkDocs(project.tree).map((d) => d.id)),
      revisionIds: new Set(project.revisions.map((r) => r.id)),
      mainScriptId,
    };
    setPaneState((s) => {
      const next = normalizePanes(s, valid);
      paneRef.current = next;
      return next;
    });
  }, [project.tree, project.revisions, mainScriptId]);

  // 프로젝트 쪽에서 열린 문서가 바뀌면(새 문서 만들기 등) 포커스가 있는 화면에 보여준다.
  const activeDocId = project.activeDoc.id;
  const lastActiveDocId = useRef(activeDocId);
  useEffect(() => {
    if (lastActiveDocId.current === activeDocId) return;
    lastActiveDocId.current = activeDocId;
    const s = paneRef.current;
    const target = docTarget(activeDocId);
    const index = s.split ? s.focus : 0;
    if (sameTarget(s.panes[index], target)) return;
    const at = paneShowing(s, target);
    const next = at !== null ? { ...s, focus: at } : showInPane(s, index, target);
    paneRef.current = next;
    setPaneState(next);
  }, [activeDocId, docTarget]);

  const updateSettings = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  // 테마(시스템 / 라이트 / 다크) 즉시 반영
  useEffect(() => {
    if (settings.theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = settings.theme;
    }
  }, [settings.theme]);

  const currentScene = useMemo(() => sceneAtLine(analysis.scenes, info.line), [analysis.scenes, info.line]);

  const treeRef = useRef(project.tree);
  treeRef.current = project.tree;

  // 씬을 누르면: 원고를 (가려져 있으면 띄워서) 그 씬으로 이동
  const pendingLineRef = useRef<number | null>(null);
  const goToLine = useCallback(
    (line: number) => {
      setPresetModal(null);
      const alreadyVisible = scriptPane(paneRef.current) !== null;
      // 원고 화면이 보인 다음 이동한다. (아래 useEffect)
      if (!alreadyVisible) pendingLineRef.current = line;
      applyPanes(
        revealScript(paneRef.current, (t) => t.kind === "doc" && findNode(treeRef.current, t.id)?.type === "structure"),
      );
      if (alreadyVisible) editorRef.current?.goToLine(line);
    },
    [applyPanes, setPresetModal],
  );

  const findCharacter = useCallback(
    (name: string) => {
      setTreeFilter(name);
      setShowSidebar(true);
    },
    [setShowSidebar],
  );

  const handleOpenSettings = useCallback(() => {
    if (isTauri()) {
      invoke("open_auxiliary_window", { windowType: "settings" }).catch(() => {
        setSettingsOpen(true);
      });
    } else {
      setSettingsOpen(true);
    }
  }, []);

  const handleOpenGuide = useCallback(() => {
    if (isTauri()) {
      invoke("open_auxiliary_window", { windowType: "guide" }).catch(() => {
        setGuideOpen(true);
      });
    } else {
      setGuideOpen(true);
    }
  }, []);

  // 메뉴 처리 (사이드바, 통계, 새 고, 설정, DropKick 정보, 화면 비율)
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<string>("menu", (event) => {
      const id = event.payload;
      if (id === "toggle_scenes") toggleSidebar();
      else if (id === "toggle_stats") toggleStats();
      else if (id === "new_revision") setNewRevisionOpen(true);
      else if (id === "open_settings") handleOpenSettings();
      else if (id === "about_dropkick") setAboutOpen(true);
      else if (id === "open_guide") handleOpenGuide();
      else if (id.startsWith("zoom:")) {
        const z = normalizeZoom(id.slice("zoom:".length));
        setSettings((prev) => {
          const next = { ...prev, zoom: z };
          saveSettings(next);
          return next;
        });
        setNotice({ text: `화면 비율: ${z}%`, key: Date.now() });
      }
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [toggleSidebar, toggleStats, handleOpenSettings, handleOpenGuide]);

  // 가이드 단축키 (⌘? 또는 ⌘/)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "/" || e.key === "?")) {
        e.preventDefault();
        handleOpenGuide();
      } else if (e.metaKey && e.altKey && e.code === "Digit3") {
        // 화면 나누기 (⌥⌘3). ⌥를 누르면 글자가 바뀌므로 key가 아니라 code로 본다.
        e.preventDefault();
        toggleSplit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleOpenGuide, toggleSplit]);

  // 원고로 돌아오면 원고에 커서를 두고, 누른 씬이 있으면 그리로 이동한다.
  useEffect(() => {
    if (!scriptVisible) return;
    const line = pendingLineRef.current;
    pendingLineRef.current = null;
    const go = () => (line !== null ? editorRef.current?.goToLine(line) : editorRef.current?.focus());
    // 숨겨져 있던 원고가 다시 보이면 높이 계산이 한 박자 늦으므로, 조금 뒤에 한 번 더 맞춘다.
    const timers = [setTimeout(go, 0), setTimeout(go, 120)];
    return () => timers.forEach(clearTimeout);
  }, [scriptVisible]);

  // 개발용: 주소에 ?sample=short 또는 ?sample=long 을 붙이면 테스트 원고를 연다.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const sample = new URLSearchParams(window.location.search).get("sample");
    const files: Record<string, () => Promise<{ default: string }>> = {
      short: () => import("../samples/short-5p.fountain?raw"),
      long: () => import("../samples/long-100p.fountain?raw"),
    };
    if (!sample || !files[sample]) return;
    files[sample]().then((m) => editorRef.current?.load(fromFountain(m.default).lines));
  }, []);

  // 자동 업데이트: 설치 전에 작업을 저장한다.
  useUpdater({
    prepare: project.prepareToClose,
    notify: (text) => setNotice(text ? { text, key: Date.now() } : null),
  });

  // 인물 설정 문서 ↔ 원고 속 인물 (문서 이름으로 연결)
  const characterDocs = useMemo(() => {
    const map = new Map<string, DocNode>();
    for (const doc of walkDocs(project.tree)) {
      if (doc.type === "character" && !map.has(characterKey(doc.name))) map.set(characterKey(doc.name), doc);
    }
    return map;
  }, [project.tree]);

  const { addDoc } = project;
  const openProfile = useCallback(
    (name: string) => {
      const doc = characterDocs.get(characterKey(name));
      if (doc) openDoc(doc.id);
      else addDoc(folderNamed(project.tree, "인물 설정"), "character", name);
    },
    [addDoc, characterDocs, openDoc, project.tree],
  );

  const applyCharacterRename = (oldName: string, newName: string, everywhere: boolean) => {
    const others = analysis.characters.map((c) => c.name);
    const result = editorRef.current?.renameCharacter(characterKey(oldName), newName, everywhere, others, true);
    const profile = characterDocs.get(characterKey(oldName));
    if (profile) project.rename(profile.id, newName);
    if (result) {
      setNotice({
        text: `"${oldName}" → "${newName}": 인물 줄 ${result.characterLines}곳${everywhere ? `, 지문·대사 ${result.textHits}곳` : ""} 바꿈 (⌘Z로 되돌리기)`,
        key: Date.now(),
      });
    }
  };

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  // 인물 설정 문서의 원고 속 정보 (인물 설정 문서가 아니면 undefined)
  const characterInfoOf = (doc: DocNode) =>
    doc.type === "character" ? analysis.characters.find((c) => c.name === characterKey(doc.name)) ?? null : undefined;

  // 트리 작업 알림은 2.5초 뒤 사라진다.
  const { treeUndo, dismissTreeUndo } = project;
  useEffect(() => {
    if (!treeUndo) return;
    const timer = setTimeout(dismissTreeUndo, 2500);
    return () => clearTimeout(timer);
  }, [treeUndo, dismissTreeUndo]);

  const saveLabel = (() => {
    const { state, at } = project.saveStatus;
    if (state === "saving") return "저장 중…";
    if (state === "error") return "저장하지 못함";
    if (!project.path) return "아직 저장 안 함 (⌘S)";
    if (project.dirty) return "자동 저장 대기";
    if (at) return `저장됨 ${at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
    return "저장됨";
  })();

  const revisionStats = () => ({ pages: analysis.pages, scenes: analysis.scenes.length, runtimeMinutes: analysis.runtimeMinutes });

  const currentSnapshot = useCallback(
    (): Snapshot => ({
      name: "지금 원고",
      lines: editorRef.current?.getLines() ?? [],
      docs: settingsDocs(project.tree).map(({ doc, folders }) => ({
        doc: { id: doc.id, type: doc.type, name: doc.name, folders },
        text: project.docTexts.get(doc.id) ?? "",
      })),
      pages: analysis.pages,
      runtime: analysis.runtimeMinutes,
    }),
    [analysis.pages, analysis.runtimeMinutes, project.docTexts, project.tree],
  );

  const docChars = useMemo(() => project.activeText.replace(/\s/g, "").length, [project.activeText]);

  const updatePresets = useCallback((next: DocPreset[]) => {
    setPresets(next);
    savePresets(next);
  }, []);

  /** 프리셋 메뉴에서 프리셋을 눌렀을 때: 빈 문서가 열려 있으면 거기에 적용하고, 아니면 새 문서를 만든다. */
  const handleSelectPreset = useCallback(
    (preset: DocPreset) => {
      const wasPresetOpen = Boolean(presetModal);
      setPresetMenuPos(null);
      setPresetModal(null);
      if (focusedShown.kind === "doc" && !wasPresetOpen && project.activeText.trim() === "") {
        project.applyPresetToDoc(project.activeDoc.id, preset);
        return;
      }
      const targetFolder =
        preset.docType === "character"
          ? folderNamed(project.tree, "인물 설정") ?? folderNamed(project.tree, "인물")
          : preset.docType === "script"
            ? folderNamed(project.tree, "스크립트") ?? null
            : findParent(project.tree, project.activeDoc.id)?.id ?? folderNamed(project.tree, "메모");
      project.addDocWithPreset(targetFolder ?? null, preset);
      setShowSidebar(true);
    },
    [focusedShown.kind, presetModal, project, setPresetModal, setShowSidebar],
  );

  /** 3막 구조 보드를 원고 곁에 열기(이미 있으면 열고, 없으면 '개요' 폴더 안에 새로 만든다) */
  const handleOpenOrCreateStructure = useCallback(
    (forceNew = false) => {
      setPresetMenuPos(null);
      setPresetModal(null);
      if (!forceNew) {
        const existing = walkDocs(project.tree).find((d) => d.type === "structure");
        if (existing) {
          if (existing.name === "3막 구조" || existing.name === "3막 구조(세이브 더 캣)") {
            project.rename(existing.id, "3막 구조 양식");
          }
          applyPanes(openBesideScript(paneRef.current, { kind: "doc", id: existing.id }));
          return;
        }
      }
      const targetFolder = folderNamed(project.tree, "개요");
      const id = project.addDoc(targetFolder ?? null, "structure", "3막 구조 양식");
      applyPanes(openBesideScript(paneRef.current, { kind: "doc", id }));
      setShowSidebar(true);
    },
    [applyPanes, project, setPresetModal, setShowSidebar],
  );

  // 상단 헤더 왼쪽 경로 표시: "프로젝트 이름 - 선택한 폴더 - 문서 이름"
  const headerPathLabel = useMemo(() => {
    if (presetModal && focusedShown.kind === "preset") {
      return `${project.title} - 프리셋 - ${presetModal.initial ? presetModal.initial.name : "새 프리셋 만들기"}`;
    }
    if (openRevision) {
      return `${project.title} - 수정고 - ${openRevision.name}`;
    }
    if (focusedShown.kind === "stats") return `${project.title} - 통계`;
    const folders: string[] = [];
    let curId: string | null = project.activeDoc.id;
    while (curId) {
      const parent = findParent(project.tree, curId);
      if (!parent) break;
      folders.unshift(parent.name);
      curId = parent.id;
    }
    return [project.title, ...folders, project.activeDoc.name].join(" - ");
  }, [focusedShown.kind, openRevision, presetModal, project.activeDoc.id, project.activeDoc.name, project.title, project.tree]);

  const handleFullResetApp = useCallback(async () => {
    const ok = await project.resetToInitialState();
    if (!ok) return;
    clearAllAppStorage();
    setSettings(DEFAULT_SETTINGS);
    setPresets(DEFAULT_PRESETS);
    setShowSidebar(true);
    applyPanes(INITIAL_PANES);
    setPresetModal(null);
    setSettingsOpen(false);
    setNotice({ text: "프로그램을 처음 상태로 초기화했습니다.", key: Date.now() });
  }, [applyPanes, project, setPresetModal, setShowSidebar]);

  // 보조 창(설정, 가이드 등)과의 이벤트 동기화
  useEffect(() => {
    if (!isTauri()) return;

    let unlistens: (() => void)[] = [];

    Promise.all([
      listen<AppSettings>("settings-changed", (event) => {
        setSettings(event.payload);
      }),
      listen<DocPreset[]>("presets-changed", (event) => {
        setPresets(event.payload);
      }),
      listen<{ title: string; fountainText: string }>("load-sample-project", async (event) => {
        const ok = await project.newProjectWithScript(event.payload.title, event.payload.fountainText);
        if (ok) {
          setNotice({
            text: `예시 스크립트 "${event.payload.title}"(으)로 새 프로젝트를 시작했습니다.`,
            key: Date.now(),
          });
        }
      }),
      listen<{ initial: DocPreset | null }>("open-preset-editor", (event) => {
        setPresetModal({ initial: event.payload.initial });
      }),
      listen("app-reset", () => {
        handleFullResetApp();
      }),
    ]).then((fns) => {
      unlistens = fns;
    });

    return () => {
      unlistens.forEach((fn) => fn());
    };
  }, [project, handleFullResetApp]);

  const zoomStyle = settings.zoom !== 100 ? { zoom: settings.zoom / 100 } : undefined;
  // 화면을 나누면 원고 화면이 좁아지므로, 용지가 잘리지 않게 그 폭에 맞춰 줄여서 보여준다.
  // (줄 바꿈은 용지 기준이라 화면 비율만 바뀌고 페이지 계산은 그대로다)
  const scriptZoom =
    split && scriptPaneWidth > 0
      ? Math.max(0.4, Math.min(settings.zoom / 100, (scriptPaneWidth - 32) / (PAPER_FIT_WIDTH - 32)))
      : settings.zoom / 100;
  const scriptZoomStyle = scriptZoom !== 1 ? { zoom: scriptZoom } : undefined;

  const paneStyle = (index: PaneIndex): CSSProperties =>
    split
      ? { order: index * 2, flex: `${index === 0 ? paneState.ratio : 1 - paneState.ratio} 1 0` }
      : { order: 0, flex: "1 1 0" };

  const renderHeader = (index: PaneIndex) => (
    <PaneHeader
      index={index}
      target={paneState.panes[index]}
      focused={focusedIndex === index}
      tree={project.tree}
      mainScriptId={mainScriptId}
      revisions={project.revisions}
      onChange={(target) => {
        if (presetPane === index) setPresetModal(null);
        applyPanes(showInPane(paneRef.current, index, target));
      }}
      onSwap={() => applyPanes(swapPanes(paneRef.current))}
      onClose={() => dismissPane(index)}
    />
  );

  /** 원고가 아닌 화면의 내용 (원고는 위에서 항상 살려 둔다) */
  const renderContent = (index: PaneIndex, shown: Exclude<typeof focusedShown, { kind: "script" }>) => {
    if (shown.kind === "preset" && presetModal) {
      return (
        <PresetEditorView
          key={presetModal.initial?.id ?? "new"}
          initial={presetModal.initial}
          draft={presetModal.draft}
          canDelete={presets.length > 2 || (presetModal.initial ? !isDefaultPreset(presetModal.initial.id) : true)}
          onSave={(savedPreset) => {
            const exists = presets.some((p) => p.id === savedPreset.id);
            const next = exists
              ? presets.map((p) => (p.id === savedPreset.id ? savedPreset : p))
              : [...presets, savedPreset];
            updatePresets(next);
            setNotice({
              text: exists
                ? `"${savedPreset.name}" 프리셋을 저장했습니다.`
                : `"${savedPreset.name}" 프리셋을 추가했습니다.`,
              key: Date.now(),
            });
          }}
          onDelete={(id) => {
            const target = presets.find((p) => p.id === id);
            const next = presets.filter((p) => p.id !== id);
            updatePresets(next.length > 0 ? next : loadPresets());
            if (target) {
              setNotice({ text: `"${target.name}" 프리셋을 지웠습니다.`, key: Date.now() });
            }
          }}
          onClose={() => setPresetModal(null)}
        />
      );
    }
    if (shown.kind === "revision") {
      const meta = project.revisions.find((r) => r.id === shown.id);
      if (!meta) return null;
      return (
        <RevisionView
          meta={meta}
          revisions={project.revisions}
          load={project.loadRevision}
          current={currentSnapshot}
          onRestore={async () => {
            if (await project.restoreRevision(meta, revisionStats())) {
              dismissPane(index);
              setNotice({ text: `"${meta.name}"로 되돌렸습니다. 되돌리기 전 상태는 수정고에 보관했습니다.`, key: Date.now() });
            }
          }}
          onExportPdf={(script) => project.exportRevisionPdf(meta.name, script)}
          onDelete={async () => {
            if (await project.deleteRevision(meta)) dismissPane(index);
          }}
        />
      );
    }
    if (shown.kind === "stats") {
      return (
        <StatsPanel
          analysis={analysis}
          currentSceneLine={currentScene?.line ?? null}
          onSelectScene={goToLine}
          onSelectCharacter={findCharacter}
          hasProfile={(name) => characterDocs.has(characterKey(name))}
          onOpenProfile={openProfile}
          onRenameCharacter={setRenamingCharacter}
        />
      );
    }
    if (shown.kind !== "doc") return null;
    const doc = findNode(project.tree, shown.id) as DocNode | null;
    if (!doc) return null;
    const text = project.docTexts.get(doc.id) ?? "";
    if (doc.type === "structure") {
      return (
        <StructureBoardView
          text={text}
          scenes={analysis.scenes}
          totalPages={analysis.pages}
          runtimeMinutes={analysis.runtimeMinutes}
          onChange={(nextText) => project.setDocText(doc.id, nextText)}
          onSelectScene={goToLine}
        />
      );
    }
    const character = characterInfoOf(doc);
    return (
      <main className="text-desk">
        {character !== undefined && (
          <div className="character-info">
            {character ? (
              <>
                <span className="muted">원고에서</span>
                <span>
                  대사 <strong>{numberFormat.format(character.speeches)}</strong>회
                </span>
                <span>
                  <strong>{numberFormat.format(character.dialogueChars)}</strong>자
                </span>
                <span>
                  씬 <strong>{character.scenes}</strong>개
                </span>
                <span>
                  첫 등장 <strong>#{character.firstScene}</strong>
                </span>
                <button type="button" onClick={() => findCharacter(character.name)}>
                  등장 씬 찾기
                </button>
              </>
            ) : (
              <span className="muted">
                원고에 "{doc.name}"(이)라는 인물 이름이 아직 없습니다. 문서 이름을 원고의 인물 이름과 같게 하면 연결됩니다.
              </span>
            )}
          </div>
        )}
        <article className="text-page" style={zoomStyle}>
          <TextEditor ref={textRefs[index]} docId={doc.id} text={text} onChange={project.setDocText} />
        </article>
      </main>
    );
  };

  return (
    <div
      className={`app${!settings.showSceneNumbers ? " hide-scene-numbers" : ""}${!settings.highlightCurrentLine ? " hide-current-line" : ""}`}
    >
      <header className="titlebar" data-tauri-drag-region>
        <span className="titlebar-path" title={project.path ?? "아직 저장하지 않았습니다"}>
          {headerPathLabel}
        </span>
        {project.dirty && <span className="doc-dirty">수정됨</span>}
        <span className="app-name">DropKick!</span>
      </header>

      {/* 도구모음: 아래 사이드바 / 원고 / 통계와 같은 세 칸으로 나눈다. */}
      <nav
        className={`toolbar${showSidebar ? " with-sidebar" : ""}`}
        aria-label="도구모음"
      >
        <div className="toolbar-left">
          <button
            type="button"
            className={showSidebar ? "style-button active" : "style-button"}
            aria-pressed={showSidebar}
            title="사이드바 보기/숨기기 (⌥⌘1)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleSidebar}
          >
            <span className="style-name">사이드바</span>
            <kbd>⌥⌘1</kbd>
          </button>
          <button
            type="button"
            className={presetMenuPos ? "style-button active" : "style-button"}
            aria-expanded={Boolean(presetMenuPos)}
            title="문서 프리셋 (기본 프리셋 및 추가한 프리셋 선택)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              if (presetMenuPos) {
                setPresetMenuPos(null);
              } else {
                const rect = e.currentTarget.getBoundingClientRect();
                setPresetMenuPos({ x: rect.left, y: rect.bottom + 4 });
              }
            }}
          >
            <span className="style-name">프리셋 ▾</span>
          </button>
        </div>

        <div className="toolbar-center" aria-label="문장 스타일">
          {focusedShown.kind === "preset" && presetModal ? (
            <span className="stylebar-doc">
              프리셋 · {presetModal.initial ? `${presetModal.initial.name} 편집` : "새 프리셋 만들기"}
              <button type="button" className="style-button" onClick={() => setPresetModal(null)}>
                ← 돌아가기
              </button>
            </span>
          ) : openRevision ? (
            <span className="stylebar-doc">
              수정고 · {openRevision.name}
              <button type="button" className="style-button" onClick={() => openTarget({ kind: "script" })}>
                ← {scriptName}
              </button>
            </span>
          ) : focusedShown.kind === "stats" ? (
            <span className="stylebar-doc">
              통계
              <button type="button" className="style-button" onClick={() => openTarget({ kind: "script" })}>
                ← {scriptName}
              </button>
            </span>
          ) : isScript ? (
            LINE_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                className={style === info.style ? "style-button active" : "style-button"}
                aria-pressed={style === info.style}
                title={`${STYLE_LABELS[style]} (${shortcutFor(style)})`}
                // 버튼을 눌러도 에디터 커서가 그대로 있도록 포커스를 뺏지 않는다.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editorRef.current?.setStyle(style)}
              >
                <span className="style-name">{STYLE_LABELS[style]}</span>
                <kbd>{shortcutFor(style)}</kbd>
              </button>
            )).concat(
              <span key="divider" className="toolbar-divider" />,
              <button
                key="title-page"
                type="button"
                className={project.titlePage ? "style-button" : "style-button muted"}
                title="표지 편집 (PDF 첫 장)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setEditingTitlePage(true)}
              >
                <span className="style-name">표지</span>
              </button>,
              <button
                key="guide-btn"
                type="button"
                className={guideOpen ? "style-button active" : "style-button"}
                title="시나리오 작성 가이드 (⌘?)"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleOpenGuide}
              >
                <span className="style-name">📖 가이드</span>
              </button>,
            )
          ) : (
            <span className="stylebar-doc">
              {focusedDocNode ? `${DOC_TYPE_LABELS[focusedDocNode.type]} · ${focusedDocNode.name}` : ""}
              {!isStructure && !split && (
                <button type="button" className="style-button" onClick={() => openTarget({ kind: "script" })}>
                  ← {scriptName}
                </button>
              )}
            </span>
          )}
        </div>

        <div className="toolbar-right">
          <button
            type="button"
            className={structureIndex !== null ? "style-button active" : "style-button"}
            aria-pressed={structureIndex !== null}
            title={
              structureIndex !== null
                ? "3막 구조 화면 닫기"
                : "원고 옆에 3막 구조 보드 열기 (세이브 더 캣 15단계)"
            }
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (structureIndex !== null ? dismissPane(structureIndex) : handleOpenOrCreateStructure(false))}
          >
            <span className="style-name">3막 구조</span>
          </button>
          <button
            type="button"
            className={split ? "style-button active" : "style-button"}
            aria-pressed={split}
            title="화면 나누기 켜기/끄기 (⌥⌘3)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleSplit}
          >
            <span className="style-name">화면 나누기</span>
            <kbd>⌥⌘3</kbd>
          </button>
          <button
            type="button"
            className={showStats ? "style-button active" : "style-button"}
            aria-pressed={showStats}
            title="통계 보기/숨기기 (⌥⌘2)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={toggleStats}
          >
            <span className="style-name">통계</span>
            <kbd>⌥⌘2</kbd>
          </button>
        </div>
      </nav>

      <div className="workspace">
        {showSidebar && (
          <ProjectTree
            title={project.title}
            tree={project.tree}
            mainScriptId={project.mainScriptId}
            activeDocId={project.activeDoc.id}
            dirtyDocIds={project.dirtyDocIds}
            docTexts={project.docTexts}
            scenes={analysis.scenes}
            currentSceneLine={currentScene?.line ?? null}
            filter={treeFilter}
            onFilterChange={setTreeFilter}
            onOpenDoc={(id) => {
              setPresetModal(null);
              openTarget(docTarget(id));
            }}
            onSelectScene={goToLine}
            onAdd={(kind, parentId) => {
              setPresetModal(null);
              if (kind === "folder") return project.addFolder(parentId);
              if (kind === "structure") return project.addDoc(parentId, "structure");
              return project.addDoc(parentId, kind === "character" ? "character" : "memo");
            }}
            presets={presets}
            onAddPreset={(preset, parentId) => {
              setPresetModal(null);
              return project.addDocWithPreset(parentId, preset);
            }}
            onCreatePreset={() => {
              setPresetModal({ initial: null });
            }}
            onRename={project.rename}
            onRemove={project.remove}
            onMove={project.move}
            onSetIcon={project.setIcon}
            revisions={project.revisions}
            openRevisionId={focusedRevision?.id ?? null}
            onOpenRevision={(id) => {
              setPresetModal(null);
              openTarget({ kind: "revision", id });
            }}
            onNewRevision={() => setNewRevisionOpen(true)}
          />
        )}

        <div className="panes" ref={panesAreaRef}>
          {/* 원고 에디터는 항상 살려 두고(되돌리기 기록, 분석 유지) 화면에 없을 때만 숨긴다. */}
          <div
            className={`pane${split && focusedIndex === scriptIndex ? " pane-focused" : ""}`}
            ref={scriptPaneRef}
            hidden={!scriptVisible || presetPane === scriptIndex}
            style={paneStyle(scriptIndex ?? 0)}
            onPointerDownCapture={() => scriptIndex !== null && focusPane(scriptIndex)}
          >
            {split && scriptIndex !== null && renderHeader(scriptIndex)}
            <div className="pane-body">
              <main className="desk">
                <article className="paper" style={scriptZoomStyle}>
                  <Editor
                    ref={editorRef}
                    initialLines={BLANK_SCRIPT_LINES}
                    onInfo={setInfo}
                    onDirtyChange={project.setScriptDirty}
                    onAnalysis={setAnalysis}
                  />
                </article>
              </main>
            </div>
          </div>

          {([0, 1] as const).map((index) => {
            if (index === 1 && !split) return null;
            const shown = shownIn(index);
            if (shown.kind === "script") return null;
            return (
              <div
                key={`pane-${index}`}
                className={`pane${split && focusedIndex === index ? " pane-focused" : ""}`}
                style={paneStyle(index)}
                onPointerDownCapture={() => focusPane(index)}
              >
                {split && renderHeader(index)}
                <div className="pane-body">{renderContent(index, shown)}</div>
              </div>
            );
          })}

          {split && <SplitDivider ratio={paneState.ratio} containerRef={panesAreaRef} onChange={setRatio} style={{ order: 1 }} />}
        </div>
      </div>

      <footer className="statusbar">
        {isScript ? (
          <>
            <span className="status-style">{STYLE_LABELS[info.style]}</span>
            {currentScene && (
              <span className="status-scene" title={currentScene.heading}>
                {currentScene.heading}
              </span>
            )}
            <span className="status-spacer" />
            <span className="status-page">
              {numberFormat.format(info.page)} / {numberFormat.format(info.pages)}페이지
            </span>
            <span>씬 {numberFormat.format(info.scenes)}개</span>
            <span>인물 {numberFormat.format(info.characters)}명</span>
            <span>글자 {numberFormat.format(info.chars)}</span>
            <span>공백 제외 {numberFormat.format(info.charsNoSpace)}</span>
          </>
        ) : focusedDocNode ? (
          <>
            <span className="status-style">{DOC_TYPE_LABELS[focusedDocNode.type]}</span>
            <span className="status-scene">{focusedDocNode.name}</span>
            <span className="status-spacer" />
            <span>공백 제외 {numberFormat.format(docChars)}자</span>
          </>
        ) : (
          <>
            <span className="status-style">
              {focusedShown.kind === "stats" ? "통계" : focusedShown.kind === "revision" ? "수정고" : "프리셋"}
            </span>
            <span className="status-spacer" />
          </>
        )}
        <span className={`status-save status-save-${project.saveStatus.state}`} title="저장된 프로젝트는 입력을 멈추면 자동으로 저장됩니다.">
          {saveLabel}
        </span>
      </footer>

      {editingTitlePage && (
        <TitlePageDialog
          titlePage={project.titlePage}
          onSave={project.setTitlePage}
          onClose={() => {
            setEditingTitlePage(false);
            editorRef.current?.focus();
          }}
        />
      )}

      {renamingCharacter && (
        <RenameCharacterDialog
          name={renamingCharacter}
          hasProfile={characterDocs.has(characterKey(renamingCharacter))}
          preview={(newName, everywhere) =>
            editorRef.current?.renameCharacter(
              characterKey(renamingCharacter),
              newName,
              everywhere,
              analysis.characters.map((c) => c.name),
              false,
            ) ?? { characterLines: 0, textHits: 0 }
          }
          onApply={(newName, everywhere) => applyCharacterRename(renamingCharacter, newName, everywhere)}
          onClose={() => setRenamingCharacter(null)}
        />
      )}

      {presetMenuPos &&
        createPortal(
          <div className="icon-popover-backdrop" onMouseDown={() => setPresetMenuPos(null)}>
            <div
              className="tree-menu preset-menu"
              role="menu"
              aria-label="프리셋 메뉴"
              style={{ left: presetMenuPos.x, top: presetMenuPos.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="preset-menu-section-label">기본 프리셋</div>
              <div className="preset-menu-row">
                <button
                  type="button"
                  role="menuitem"
                  className="preset-menu-main"
                  onClick={() => handleOpenOrCreateStructure(true)}
                >
                  <span className="tree-icon">
                    <SfSymbolIcon type="structure" />
                  </span>
                  <span>3막 구조 양식</span>
                </button>
              </div>
              {presets
                .filter((p) => isDefaultPreset(p.id))
                .map((preset) => (
                  <div key={preset.id} className="preset-menu-row">
                    <button
                      type="button"
                      role="menuitem"
                      className="preset-menu-main"
                      onClick={() => handleSelectPreset(preset)}
                    >
                      <span className="tree-icon">
                        <SfSymbolIcon type={preset.docType} icon={preset.icon} />
                      </span>
                      <span>{preset.name}</span>
                    </button>
                  </div>
                ))}

              {presets.some((p) => !isDefaultPreset(p.id)) && (
                <>
                  <hr />
                  <div className="preset-menu-section-label">추가한 프리셋</div>
                  <div className="preset-custom-scroll">
                    {presets
                      .filter((p) => !isDefaultPreset(p.id))
                      .map((preset) => (
                        <div key={preset.id} className="preset-menu-row">
                          <button
                            type="button"
                            role="menuitem"
                            className="preset-menu-main"
                            onClick={() => handleSelectPreset(preset)}
                          >
                            <span className="tree-icon">
                              <SfSymbolIcon type={preset.docType} icon={preset.icon} />
                            </span>
                            <span>{preset.name}</span>
                          </button>
                          <button
                            type="button"
                            className="preset-menu-edit"
                            title={`"${preset.name}" 프리셋 편집`}
                            onClick={() => {
                              setPresetMenuPos(null);
                              setPresetModal({ initial: preset });
                            }}
                          >
                            편집
                          </button>
                        </div>
                      ))}
                  </div>
                </>
              )}
              <hr />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setPresetMenuPos(null);
                  setPresetModal({ initial: null });
                }}
              >
                + 새 프리셋 만들기…
              </button>
              {focusedDocNode && !isStructure && project.activeText.trim() !== "" && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setPresetMenuPos(null);
                    setPresetModal({
                      initial: null,
                      draft: {
                        name: project.activeDoc.name,
                        body: project.activeText,
                        icon: project.activeDoc.icon,
                        docType: project.activeDoc.type === "character" ? "character" : "memo",
                      },
                    });
                  }}
                >
                  지금 문서를 프리셋으로 저장…
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}

      {newRevisionOpen && (
        <NewRevisionDialog
          defaultName={nextRevisionName(project.revisions)}
          onClose={() => setNewRevisionOpen(false)}
          onCreate={async (name, note) => {
            const meta = await project.createRevision(name, note, revisionStats());
            if (meta) setNotice({ text: `"${meta.name}"(으)로 보관했습니다. 사이드바 아래 수정고에서 볼 수 있습니다.`, key: Date.now() });
          }}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          settings={settings}
          presets={presets}
          onChangeSettings={updateSettings}
          onUpdatePresets={updatePresets}
          onOpenNewPreset={() => setPresetModal({ initial: null })}
          onEditPreset={(preset) => setPresetModal({ initial: preset })}
          onFullResetApp={handleFullResetApp}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {aboutOpen && <AboutDialog onClose={() => setAboutOpen(false)} />}

      {guideOpen && (
        <ScreenplayGuideDialog
          onClose={() => setGuideOpen(false)}
          onLoadSampleProject={async (title, fountainText) => {
            const ok = await project.newProjectWithScript(title, fountainText);
            if (ok) {
              setNotice({ text: `예시 스크립트 "${title}"(으)로 새 프로젝트를 시작했습니다.`, key: Date.now() });
            }
          }}
        />
      )}

      {notice && (
        <div className="toast" role="status" key={notice.key}>
          <span>{notice.text}</span>
          <button type="button" className="toast-close" aria-label="닫기" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {treeUndo && !notice && (
        <div className="toast" role="status" key={treeUndo.key}>
          <span>{treeUndo.label}</span>
          <button type="button" onClick={project.undoTree}>
            되돌리기
          </button>
          <button type="button" className="toast-close" aria-label="닫기" onClick={dismissTreeUndo}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
