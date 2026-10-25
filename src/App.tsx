import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fromFountain } from "./fountain/fountain";
import { Editor, type EditorHandle, type EditorInfo } from "./editor/Editor";
import { TextEditor, type TextEditorHandle } from "./editor/TextEditor";
import { LINE_STYLES, STYLE_LABELS, shortcutFor } from "./editor/styles";
import { useProject } from "./project/useProject";
import { findNode } from "./project/tree";
import { BLANK_SCRIPT_LINES, DOC_TYPE_LABELS } from "./project/model";
import { sceneAtLine, type ScriptAnalysis } from "./analysis/analyze";
import { ProjectTree } from "./panels/ProjectTree";
import { TitlePageDialog } from "./titlepage/TitlePageDialog";
import { StatsPanel } from "./panels/StatsPanel";
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

function App() {
  const editorRef = useRef<EditorHandle>(null);
  const textEditorRef = useRef<TextEditorHandle>(null);
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
  const [showSidebar, toggleSidebar, setShowSidebar] = usePanelSetting("dropkick.panel.scenes", true);
  const [showStats, toggleStats] = usePanelSetting("dropkick.panel.stats", false);
  const project = useProject(editorRef, textEditorRef, BLANK_SCRIPT_LINES);
  const isScript = project.activeDoc.id === project.mainScriptId;
  const scriptName = findNode(project.tree, project.mainScriptId)?.name ?? "스크립트";

  const currentScene = useMemo(() => sceneAtLine(analysis.scenes, info.line), [analysis.scenes, info.line]);

  // 씬을 누르면: 원고를 열고 그 씬으로 이동
  const { openDoc, mainScriptId } = project;
  const pendingLineRef = useRef<number | null>(null);
  const goToLine = useCallback(
    (line: number) => {
      if (isScript) {
        editorRef.current?.goToLine(line);
        return;
      }
      // 원고 화면이 보인 다음 이동한다. (아래 useEffect)
      pendingLineRef.current = line;
      openDoc(mainScriptId);
    },
    [isScript, mainScriptId, openDoc],
  );

  const findCharacter = useCallback(
    (name: string) => {
      setTreeFilter(name);
      setShowSidebar(true);
    },
    [setShowSidebar],
  );

  // 보기 메뉴 (사이드바 ⌥⌘1, 통계 ⌥⌘2)
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<string>("menu", (event) => {
      if (event.payload === "toggle_scenes") toggleSidebar();
      if (event.payload === "toggle_stats") toggleStats();
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [toggleSidebar, toggleStats]);

  // 원고로 돌아오면 원고에 커서를 두고, 누른 씬이 있으면 그리로 이동한다.
  useEffect(() => {
    if (!isScript) return;
    const line = pendingLineRef.current;
    pendingLineRef.current = null;
    const go = () => (line !== null ? editorRef.current?.goToLine(line) : editorRef.current?.focus());
    // 숨겨져 있던 원고가 다시 보이면 높이 계산이 한 박자 늦으므로, 조금 뒤에 한 번 더 맞춘다.
    const timers = [setTimeout(go, 0), setTimeout(go, 120)];
    return () => timers.forEach(clearTimeout);
  }, [isScript]);

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

  // 트리 작업 알림은 8초 뒤 사라진다.
  const { treeUndo, dismissTreeUndo } = project;
  useEffect(() => {
    if (!treeUndo) return;
    const timer = setTimeout(dismissTreeUndo, 8000);
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

  const docChars = useMemo(() => project.activeText.replace(/\s/g, "").length, [project.activeText]);

  return (
    <div className="app">
      <header className="titlebar" data-tauri-drag-region>
        <span className="app-name">DropKick</span>
        <span className="doc-name" title={project.path ?? "아직 저장하지 않았습니다"}>
          {project.title}
        </span>
        <span className="doc-kind">프로젝트</span>
        {project.dirty && <span className="doc-dirty">수정됨</span>}
      </header>

      {/* 도구모음: 아래 사이드바 / 원고 / 통계와 같은 세 칸으로 나눈다. */}
      <nav
        className={`toolbar${showSidebar ? " with-sidebar" : ""}${showStats ? " with-stats" : ""}`}
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
        </div>

        <div className="toolbar-center" aria-label="문장 스타일">
          {isScript ? (
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
            )
          ) : (
            <span className="stylebar-doc">
              {DOC_TYPE_LABELS[project.activeDoc.type]} · {project.activeDoc.name}
              <button type="button" className="style-button" onClick={() => openDoc(mainScriptId)}>
                ← {scriptName}
              </button>
            </span>
          )}
        </div>

        <div className="toolbar-right">
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
            scenes={analysis.scenes}
            currentSceneLine={currentScene?.line ?? null}
            filter={treeFilter}
            onFilterChange={setTreeFilter}
            onOpenDoc={project.openDoc}
            onSelectScene={goToLine}
            onAdd={(kind, parentId) => (kind === "folder" ? project.addFolder(parentId) : project.addDoc(parentId))}
            onRename={project.rename}
            onRemove={project.remove}
            onMove={project.move}
          />
        )}

        {/* 원고 에디터는 항상 살려 두고(되돌리기 기록, 분석 유지) 다른 문서를 볼 때만 숨긴다. */}
        <main className="desk" hidden={!isScript}>
          <article className="paper">
            <span className="page-number" aria-hidden="true">
              1.
            </span>
            <Editor
              ref={editorRef}
              initialLines={BLANK_SCRIPT_LINES}
              onInfo={setInfo}
              onDirtyChange={project.setScriptDirty}
              onAnalysis={setAnalysis}
            />
          </article>
        </main>

        {!isScript && (
          <main className="text-desk">
            <article className="text-page">
              <TextEditor
                ref={textEditorRef}
                docId={project.activeDoc.id}
                text={project.activeText}
                onChange={project.setDocText}
              />
            </article>
          </main>
        )}

        {showStats && (
          <StatsPanel
            analysis={analysis}
            currentSceneLine={currentScene?.line ?? null}
            onSelectScene={goToLine}
            onSelectCharacter={findCharacter}
          />
        )}
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
        ) : (
          <>
            <span className="status-style">{DOC_TYPE_LABELS[project.activeDoc.type]}</span>
            <span className="status-scene">{project.activeDoc.name}</span>
            <span className="status-spacer" />
            <span>공백 제외 {numberFormat.format(docChars)}자</span>
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

      {treeUndo && (
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
