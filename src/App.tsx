import { useState } from "react";
import { Editor, type EditorStats } from "./editor/Editor";
import { SAMPLE_SCRIPT } from "./sample";
import "./App.css";

const numberFormat = new Intl.NumberFormat("ko-KR");

function App() {
  const [stats, setStats] = useState<EditorStats>({
    lines: 0,
    chars: 0,
    charsNoSpace: 0,
  });

  return (
    <div className="app">
      <header className="titlebar" data-tauri-drag-region>
        <span className="app-name">DropKick</span>
        <span className="doc-name">제목 없음</span>
      </header>

      <main className="desk">
        <article className="paper">
          <Editor initialText={SAMPLE_SCRIPT} onStats={setStats} />
        </article>
      </main>

      <footer className="statusbar">
        <span>{numberFormat.format(stats.lines)}줄</span>
        <span>글자 {numberFormat.format(stats.chars)}</span>
        <span>공백 제외 {numberFormat.format(stats.charsNoSpace)}</span>
      </footer>
    </div>
  );
}

export default App;
