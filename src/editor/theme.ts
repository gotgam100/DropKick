import { EditorView } from "@codemirror/view";

// 시나리오 원고처럼 보이는 종이 테마. 색은 App.css의 CSS 변수를 따른다.
export const paperTheme = EditorView.theme({
  "&": {
    color: "var(--ink)",
    backgroundColor: "transparent",
    fontSize: "15px",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-script)",
    lineHeight: "1.75",
    overflow: "visible",
  },
  ".cm-content": {
    padding: "0",
    caretColor: "var(--caret)",
  },
  ".cm-line": { padding: "0" },
  ".cm-activeLine": { backgroundColor: "var(--active-line)" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--caret)",
    borderLeftWidth: "2px",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { backgroundColor: "var(--selection)" },
  ".cm-selectionMatch": { backgroundColor: "var(--match)" },
  ".cm-placeholder": { color: "var(--muted)" },
  ".cm-panels": {
    backgroundColor: "var(--chrome)",
    color: "var(--ink)",
    fontFamily: "var(--font-ui)",
  },
});
