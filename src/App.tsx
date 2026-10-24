import { useEffect, useRef, useState } from "react";
import { fromFountain } from "./fountain/fountain";
import { Editor, type EditorHandle, type EditorInfo } from "./editor/Editor";
import { LINE_STYLES, STYLE_LABELS, shortcutFor } from "./editor/styles";
import { SAMPLE_SCRIPT } from "./sample";
import { useScriptDocument } from "./document/useScriptDocument";
import "./App.css";

const numberFormat = new Intl.NumberFormat("ko-KR");

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
    style: "action",
  });
  const { title, filePath, dirty, setDirty } = useScriptDocument(editorRef);

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
        <span className="doc-name" title={filePath ?? undefined}>
          {title}
        </span>
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
        <span className="stylebar-hint">Tab: 빈 줄에서 스타일 바꾸기</span>
      </nav>

      <main className="desk">
        <article className="paper">
          <Editor
            ref={editorRef}
            initialLines={SAMPLE_SCRIPT}
            onInfo={setInfo}
            onDirtyChange={setDirty}
          />
        </article>
      </main>

      <footer className="statusbar">
        <span className="status-style">{STYLE_LABELS[info.style]}</span>
        <span className="status-spacer" />
        <span className="status-page">
          {numberFormat.format(info.page)} / {numberFormat.format(info.pages)}페이지
        </span>
        <span>씬 {numberFormat.format(info.scenes)}개</span>
        <span>인물 {numberFormat.format(info.characters)}명</span>
        <span>{numberFormat.format(info.lines)}줄</span>
        <span>글자 {numberFormat.format(info.chars)}</span>
        <span>공백 제외 {numberFormat.format(info.charsNoSpace)}</span>
      </footer>
    </div>
  );
}

export default App;
