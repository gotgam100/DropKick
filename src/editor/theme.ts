import { EditorView } from "@codemirror/view";

// 시나리오 원고처럼 보이는 종이 테마. 색은 App.css의 CSS 변수를 따른다.
// 스타일별 배치(들여쓰기)는 App.css의 .sl-* 규칙에 있다.
export const paperTheme = EditorView.theme({
  "&": {
    color: "var(--ink)",
    backgroundColor: "transparent",
    fontSize: "var(--script-size)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-script)",
    lineHeight: "var(--line)",
    overflow: "visible",
  },
  ".cm-content": {
    padding: "0",
    caretColor: "var(--caret)",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--caret)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--selection)" },
  ".cm-selectionMatch": { backgroundColor: "var(--match)" },
  ".cm-placeholder": { color: "var(--muted)" },
  ".cm-panels": {
    backgroundColor: "var(--chrome)",
    color: "var(--ink)",
    fontFamily: "var(--font-ui)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--chrome)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    fontFamily: "var(--font-ui)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    padding: "4px 12px",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--caret)",
    color: "#fff",
  },
});
