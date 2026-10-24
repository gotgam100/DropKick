import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { fromFountain } from "./fountain/fountain";
import { Editor, type EditorHandle, type EditorInfo } from "./editor/Editor";
import { LINE_STYLES, STYLE_LABELS, shortcutFor } from "./editor/styles";
import { SAMPLE_SCRIPT } from "./sample";
import { useProject } from "./project/useProject";
import { sceneAtLine, type ScriptAnalysis } from "./analysis/analyze";
import { ScenePanel } from "./panels/ScenePanel";
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
  const [sceneFilter, setSceneFilter] = useState("");
  const [showScenes, toggleScenes, setShowScenes] = usePanelSetting("dropkick.panel.scenes", true);
  const [showStats, toggleStats] = usePanelSetting("dropkick.panel.stats", false);
  const { title, kind, path, dirty, setDirty } = useProject(editorRef, SAMPLE_SCRIPT);

  const currentScene = useMemo(() => sceneAtLine(analysis.scenes, info.line), [analysis.scenes, info.line]);

  const goToLine = useCallback((line: number) => editorRef.current?.goToLine(line), []);

  const findCharacter = useCallback(
    (name: string) => {
      setSceneFilter(name);
      setShowScenes(true);
    },
    [setShowScenes],
  );

  // 보기 메뉴 (씬 목록 ⌥⌘1, 통계 ⌥⌘2)
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<string>("menu", (event) => {
      if (event.payload === "toggle_scenes") toggleScenes();
      if (event.payload === "toggle_stats") toggleStats();
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [toggleScenes, toggleStats]);

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

  return (
    <div className="app">
      <header className="titlebar" data-tauri-drag-region>
        <span className="app-name">DropKick</span>
        <span className="doc-name" title={path ?? "아직 저장하지 않았습니다"}>
          {title}
        </span>
        <span className="doc-kind">{kind === "project" ? "프로젝트" : "Fountain 파일"}</span>
        {dirty && <span className="doc-dirty">수정됨</span>}
      </header>

      <nav className="stylebar" aria-label="문장 스타일">
        {LINE_STYLES.map((style) => (
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
        ))}
        <span className="stylebar-spacer" />
        <button
          type="button"
          className={showScenes ? "style-button active" : "style-button"}
          aria-pressed={showScenes}
          title="씬 목록 보기/숨기기 (⌥⌘1)"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleScenes}
        >
          <span className="style-name">씬 목록</span>
          <kbd>⌥⌘1</kbd>
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
      </nav>

      <div className="workspace">
        {showScenes && (
          <ScenePanel
            scenes={analysis.scenes}
            currentLine={info.line}
            filter={sceneFilter}
            onFilterChange={setSceneFilter}
            onSelect={goToLine}
          />
        )}

        <main className="desk">
          <article className="paper">
            <span className="page-number" aria-hidden="true">
              1.
            </span>
            <Editor
              ref={editorRef}
              initialLines={SAMPLE_SCRIPT}
              onInfo={setInfo}
              onDirtyChange={setDirty}
              onAnalysis={setAnalysis}
            />
          </article>
        </main>

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
      </footer>
    </div>
  );
}

export default App;
