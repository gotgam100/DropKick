import { useRef, useState } from "react";
import { Editor, type EditorHandle, type EditorInfo } from "./editor/Editor";
import { LINE_STYLES, STYLE_LABELS, shortcutFor } from "./editor/styles";
import { SAMPLE_SCRIPT } from "./sample";
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
    style: "action",
  });

  return (
    <div className="app">
      <header className="titlebar" data-tauri-drag-region>
        <span className="app-name">DropKick</span>
        <span className="doc-name">제목 없음</span>
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
          <Editor ref={editorRef} initialLines={SAMPLE_SCRIPT} onInfo={setInfo} />
        </article>
      </main>

      <footer className="statusbar">
        <span className="status-style">{STYLE_LABELS[info.style]}</span>
        <span className="status-spacer" />
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
