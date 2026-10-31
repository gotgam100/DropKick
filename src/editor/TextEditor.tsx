/**
 * 메모, 인물 설정, 시놉시스를 쓰는 일반 글 편집기 (Markdown)
 * 문서마다 편집 상태(되돌리기 기록 포함)를 따로 기억해서, 문서를 오가도 그대로 남는다.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, drawSelection, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import { koreanSearchPhrases } from "./searchPhrases";
import { searchPanelDrag } from "./searchPanelDrag";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export type TextEditorHandle = {
  undo: () => void;
  redo: () => void;
  find: () => void;
  focus: () => void;
};

type Props = {
  docId: string;
  text: string;
  onChange: (docId: string, text: string) => void;
};

const textTheme = EditorView.theme({
  "&": { color: "var(--ink)", backgroundColor: "transparent", fontSize: "15px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-ui)", lineHeight: "1.75", overflow: "visible" },
  ".cm-content": { padding: "0", caretColor: "var(--caret)" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--caret)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
    { backgroundColor: "var(--selection)" },
  ".cm-placeholder": { color: "var(--muted)" },
  ".cm-panels": { backgroundColor: "var(--chrome)", color: "var(--ink)" },
});

// 제목(#), 목록, 굵게 등을 보기 좋게
const markdownStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.6em", fontWeight: "700" },
  { tag: tags.heading2, fontSize: "1.25em", fontWeight: "700" },
  { tag: tags.heading3, fontSize: "1.1em", fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.processingInstruction, color: "var(--muted)" },
  { tag: tags.list, color: "var(--caret)" },
  { tag: tags.quote, color: "var(--muted)" },
  { tag: tags.link, color: "var(--caret)", textDecoration: "underline" },
  { tag: tags.monospace, fontFamily: "var(--font-script)" },
]);

export const TextEditor = forwardRef<TextEditorHandle, Props>(function TextEditor(
  { docId, text, onChange },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef(new Map<string, EditorState>());
  const docIdRef = useRef(docId);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions: Extension = [
    history(),
    koreanSearchPhrases,
    searchPanelDrag(),
    drawSelection(),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: "false", lang: "ko" }),
    placeholder("여기에 쓰세요…"),
    markdown(),
    syntaxHighlighting(markdownStyle),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    textTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChangeRef.current(docIdRef.current, update.state.doc.toString());
    }),
  ];

  const stateFor = (id: string, value: string) => {
    const cached = statesRef.current.get(id);
    // 바깥에서 내용이 바뀌었으면(다시 열기 등) 새로 만든다.
    if (cached && cached.doc.toString() === value) return cached;
    return EditorState.create({ doc: value, extensions });
  };

  useImperativeHandle(ref, () => ({
    undo: () => viewRef.current && undo(viewRef.current),
    redo: () => viewRef.current && redo(viewRef.current),
    find: () => viewRef.current && openSearchPanel(viewRef.current),
    focus: () => viewRef.current?.focus(),
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({ state: stateFor(docId, text), parent: hostRef.current });
    viewRef.current = view;
    view.focus();
    return () => {
      statesRef.current.set(docIdRef.current, view.state);
      view.destroy();
      viewRef.current = null;
    };
    // 편집기는 한 번만 만들고, 문서는 아래에서 바꾼다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 다른 문서를 열면: 지금 상태를 기억해 두고, 그 문서의 상태로 바꾼다.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || docIdRef.current === docId) return;
    statesRef.current.set(docIdRef.current, view.state);
    docIdRef.current = docId;
    view.setState(stateFor(docId, text));
    view.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // 바깥에서 내용이 바뀌면 (예: 이름을 바꿔 첫 제목이 바뀜) 편집기에도 반영한다.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || docIdRef.current !== docId) return;
    const current = view.state.doc.toString();
    if (current !== text) view.dispatch({ changes: { from: 0, to: current.length, insert: text } });
  }, [docId, text]);

  return <div className="text-editor-host" ref={hostRef} />;
});
