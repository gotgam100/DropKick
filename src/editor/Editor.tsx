import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { EditorState, Extension, Text } from "@codemirror/state";
import { EditorView, keymap, drawSelection, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from "@codemirror/search";
import { paperTheme } from "./theme";
import {
  characterNames,
  createScriptState,
  currentStyle,
  lineStylesField,
  sceneNumbersField,
  scriptLines,
  setStyle,
  type ScriptLine,
} from "./lineStyles";
import { scriptEditing } from "./scriptView";
import type { LineStyle } from "./styles";

export type EditorInfo = {
  lines: number;
  chars: number;
  charsNoSpace: number;
  characters: number;
  scenes: number;
  style: LineStyle;
};

export type EditorHandle = {
  setStyle: (style: LineStyle) => void;
  /** 새 원고로 바꾼다. 되돌리기 기록도 새로 시작한다. */
  load: (lines: ScriptLine[]) => void;
  getLines: () => ScriptLine[];
  /** 지금 내용을 "저장된 상태"로 표시한다. */
  markSaved: () => void;
  undo: () => void;
  redo: () => void;
  find: () => void;
  focus: () => void;
};

type Props = {
  initialLines: ScriptLine[];
  onInfo: (info: EditorInfo) => void;
  onDirtyChange: (dirty: boolean) => void;
};

type Snapshot = { doc: Text; styles: readonly LineStyle[] };

function readInfo(state: EditorState, withCounts: EditorInfo | null): EditorInfo {
  const style = currentStyle(state);
  if (withCounts) return { ...withCounts, style };
  const text = state.doc.toString();
  return {
    lines: state.doc.lines,
    chars: text.replace(/\n/g, "").length,
    charsNoSpace: text.replace(/\s/g, "").length,
    characters: characterNames(state).length,
    scenes: state.field(sceneNumbersField).size,
    style,
  };
}

function snapshot(state: EditorState): Snapshot {
  return { doc: state.doc, styles: state.field(lineStylesField) };
}

function sameAs(state: EditorState, saved: Snapshot): boolean {
  const styles = state.field(lineStylesField);
  if (styles !== saved.styles) {
    if (styles.length !== saved.styles.length) return false;
    for (let i = 0; i < styles.length; i++) if (styles[i] !== saved.styles[i]) return false;
  }
  return state.doc === saved.doc || state.doc.eq(saved.doc);
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { initialLines, onInfo, onDirtyChange },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensionsRef = useRef<Extension | null>(null);
  const savedRef = useRef<Snapshot | null>(null);
  const dirtyRef = useRef(false);
  const lastInfoRef = useRef<EditorInfo | null>(null);
  const onInfoRef = useRef(onInfo);
  const onDirtyRef = useRef(onDirtyChange);
  onInfoRef.current = onInfo;
  onDirtyRef.current = onDirtyChange;

  function setDirty(dirty: boolean) {
    if (dirtyRef.current === dirty) return;
    dirtyRef.current = dirty;
    onDirtyRef.current(dirty);
  }

  function publishInfo(state: EditorState, recount: boolean) {
    lastInfoRef.current = readInfo(state, recount ? null : lastInfoRef.current);
    onInfoRef.current(lastInfoRef.current);
  }

  useImperativeHandle(ref, () => ({
    setStyle(style) {
      const view = viewRef.current;
      if (!view) return;
      setStyle(style)(view);
      view.focus();
    },
    load(lines) {
      const view = viewRef.current;
      if (!view || !extensionsRef.current) return;
      const state = createScriptState(lines, extensionsRef.current);
      view.setState(state);
      savedRef.current = snapshot(state);
      setDirty(false);
      publishInfo(state, true);
      view.focus();
    },
    getLines() {
      const view = viewRef.current;
      return view ? scriptLines(view.state) : [];
    },
    markSaved() {
      const view = viewRef.current;
      if (!view) return;
      savedRef.current = snapshot(view.state);
      setDirty(false);
    },
    undo() {
      if (viewRef.current) undo(viewRef.current);
    },
    redo() {
      if (viewRef.current) redo(viewRef.current);
    },
    find() {
      if (viewRef.current) openSearchPanel(viewRef.current);
    },
    focus() {
      viewRef.current?.focus();
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;

    const extensions: Extension = [
      history(),
      drawSelection(),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: "false", lang: "ko" }),
      placeholder("여기에 시나리오를 쓰세요…"),
      scriptEditing(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      paperTheme,
      EditorView.updateListener.of((update) => {
        const changed =
          update.docChanged ||
          update.startState.field(lineStylesField) !== update.state.field(lineStylesField);
        if (changed && savedRef.current) setDirty(!sameAs(update.state, savedRef.current));
        if (!changed && !update.selectionSet) return;
        // 글이나 스타일이 바뀌었을 때만 전체 개수를 다시 센다.
        publishInfo(update.state, changed);
      }),
    ];
    extensionsRef.current = extensions;

    const state = createScriptState(initialLines, extensions);
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    savedRef.current = snapshot(state);
    publishInfo(state, true);
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 에디터는 처음 한 번만 만든다. 이후 내용은 load()로 바꾼다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor-host" ref={hostRef} />;
});
