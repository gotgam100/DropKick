/**
 * 읽기 전용 원고 보기 (수정고 보기 등). 편집 화면과 같은 페이지 모양, 같은 줄바꿈.
 */
import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createScriptState, type ScriptLine } from "./lineStyles";
import { scriptEditing } from "./scriptView";
import { pageBreaks } from "./pageBreaks";
import { paperTheme } from "./theme";

export function ScriptPreview({ lines }: { lines: ScriptLine[] }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = createScriptState(lines, [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      scriptEditing(),
      pageBreaks(),
      paperTheme,
    ]);
    const view = new EditorView({ state, parent: hostRef.current });
    return () => view.destroy();
  }, [lines]);

  return (
    <article className="paper">
      <span className="page-number" aria-hidden="true">
        1.
      </span>
      <div className="editor-host" ref={hostRef} />
    </article>
  );
}
