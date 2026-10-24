import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  drawSelection,
  highlightActiveLine,
  placeholder,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { paperTheme } from "./theme";

export type EditorStats = {
  lines: number;
  chars: number;
  charsNoSpace: number;
};

type Props = {
  initialText: string;
  onStats: (stats: EditorStats) => void;
};

function countStats(state: EditorState): EditorStats {
  const text = state.doc.toString();
  return {
    lines: state.doc.lines,
    chars: text.replace(/\n/g, "").length,
    charsNoSpace: text.replace(/\s/g, "").length,
  };
}

export function Editor({ initialText, onStats }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onStatsRef = useRef(onStats);
  onStatsRef.current = onStats;

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: initialText,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        placeholder("여기에 시나리오를 쓰세요…"),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        paperTheme,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onStatsRef.current(countStats(update.state));
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    onStatsRef.current(countStats(state));
    view.focus();

    return () => view.destroy();
    // 에디터는 처음 한 번만 만든다. 이후 내용은 에디터가 직접 관리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor-host" ref={hostRef} />;
}
