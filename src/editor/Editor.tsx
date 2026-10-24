import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { paperTheme } from "./theme";
import {
  characterNames,
  createScriptState,
  currentStyle,
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
  style: LineStyle;
};

export type EditorHandle = {
  setStyle: (style: LineStyle) => void;
};

type Props = {
  initialLines: ScriptLine[];
  onInfo: (info: EditorInfo) => void;
};

function readInfo(state: EditorState, withCounts: EditorInfo | null): EditorInfo {
  const style = currentStyle(state);
  if (withCounts) return { ...withCounts, style };
  const text = state.doc.toString();
  return {
    lines: state.doc.lines,
    chars: text.replace(/\n/g, "").length,
    charsNoSpace: text.replace(/\s/g, "").length,
    characters: characterNames(state).length,
    style,
  };
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { initialLines, onInfo },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onInfoRef = useRef(onInfo);
  onInfoRef.current = onInfo;

  useImperativeHandle(ref, () => ({
    setStyle(style) {
      const view = viewRef.current;
      if (!view) return;
      setStyle(style)(view);
      view.focus();
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;
    let last: EditorInfo | null = null;

    const state = createScriptState(initialLines, [
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
        const stylesChanged =
          update.transactions.some((tr) => tr.effects.length > 0) || update.docChanged;
        if (!stylesChanged && !update.selectionSet) return;
        // 글이나 스타일이 바뀌었을 때만 전체 개수를 다시 센다.
        last = readInfo(update.state, stylesChanged ? null : last);
        onInfoRef.current(last);
      }),
    ]);

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    last = readInfo(state, null);
    onInfoRef.current(last);
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 에디터는 처음 한 번만 만든다. 이후 내용은 에디터가 직접 관리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor-host" ref={hostRef} />;
});
