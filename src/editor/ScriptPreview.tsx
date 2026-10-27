/**
 * 읽기 전용 원고 보기 (수정고 보기, 수정고 비교).
 * marks를 주면 교정지 방식으로 지운 줄(빨간 취소선)과 새로 쓴 줄(파란색)을 원고 그 자리에 바로 함께 보여 준다.
 */
import { useEffect, useRef } from "react";
import { EditorState, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import { createScriptState, type ScriptLine } from "./lineStyles";
import { scriptEditing } from "./scriptView";
import { pageBreaks } from "./pageBreaks";
import { paperTheme } from "./theme";
import type { LineMark } from "../revisions/diff";

type Props = {
  lines: ScriptLine[];
  marks?: Map<number, LineMark>;
  /** 이 줄(0부터)로 화면을 옮긴다. seq가 바뀔 때마다 다시 옮긴다 */
  scrollTo?: { line: number; seq: number } | null;
};

type RemovedGroup = {
  badge: string;
  lines: ScriptLine[];
};

/** 지운 줄이나 수정 전 원래 줄을 원고의 같은 들여쓰기 위치에 빨간 취소선으로 그리는 위젯 */
class RemovedLinesWidget extends WidgetType {
  constructor(
    readonly groups: RemovedGroup[],
    readonly isPageTop: boolean,
  ) {
    super();
  }

  eq(other: RemovedLinesWidget) {
    if (this.isPageTop !== other.isPageTop || this.groups.length !== other.groups.length) return false;
    return this.groups.every(
      (g, i) =>
        g.badge === other.groups[i].badge &&
        g.lines.length === other.groups[i].lines.length &&
        g.lines.every((l, j) => l.style === other.groups[i].lines[j].style && l.text === other.groups[i].lines[j].text),
    );
  }

  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "rev-removed-block";
    let firstInBlock = true;
    for (const group of this.groups) {
      group.lines.forEach((line, idx) => {
        const row = document.createElement("div");
        const prevStyle = idx > 0 ? group.lines[idx - 1].style : undefined;
        const continued = idx > 0 && line.style === "action" && prevStyle === "action";
        const classes = ["cm-line", "sl", `sl-${line.style}`, "rev-del-line"];
        if (continued) classes.push("sl-continued");
        if (firstInBlock && this.isPageTop) classes.push("sl-page-top");
        row.className = classes.join(" ");
        const badge = idx === 0 ? group.badge : "−";
        row.setAttribute("data-rev-badge", badge);

        const span = document.createElement("span");
        span.className = "rev-del-text";
        span.textContent = line.text || " ";
        row.appendChild(span);
        wrap.appendChild(row);
        firstInBlock = false;
      });
    }
    return wrap;
  }

  ignoreEvent() {
    return true;
  }
}

function markDecorations(lines: ScriptLine[], marks: Map<number, LineMark>) {
  const ranges: Range<Decoration>[] = [];
  let pos = 0;
  lines.forEach((line, i) => {
    const lineEnd = pos + line.text.length;
    const m = marks.get(i);
    if (m) {
      const beforeGroups: RemovedGroup[] = [];
      if (m.removed && !m.atEnd) {
        const hasScene = m.removed.some((l) => l.style === "scene");
        beforeGroups.push({ badge: hasScene ? "− 지운 씬" : "− 삭제", lines: m.removed });
      }
      if (m.before) {
        beforeGroups.push({ badge: "− 수정 전", lines: m.before });
      }
      if (beforeGroups.length > 0) {
        ranges.push(
          Decoration.widget({
            widget: new RemovedLinesWidget(beforeGroups, i === 0),
            block: true,
            side: 0,
          }).range(pos),
        );
      }

      const classes: string[] = [];
      const attrs: Record<string, string> = {};
      if (m.kind === "added") {
        classes.push("rev-added");
        attrs["data-rev-badge"] = line.style === "scene" ? "+ 새 씬" : "+ 추가";
      } else if (m.kind === "changed") {
        classes.push("rev-changed");
        attrs["data-rev-badge"] = "+ 수정";
      }
      if (m.before) {
        classes.push("rev-has-before");
      }
      if (classes.length > 0) {
        ranges.push(Decoration.line({ class: classes.join(" "), attributes: attrs }).range(pos));
      }

      if (m.removed && m.atEnd) {
        const hasScene = m.removed.some((l) => l.style === "scene");
        ranges.push(
          Decoration.widget({
            widget: new RemovedLinesWidget([{ badge: hasScene ? "− 지운 씬" : "− 삭제", lines: m.removed }], false),
            block: true,
            side: 1,
          }).range(lineEnd),
        );
      }
    }
    pos = lineEnd + 1;
  });
  return Decoration.set(ranges, true);
}

export function ScriptPreview({ lines, marks, scrollTo }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = createScriptState(lines, [
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.lineWrapping,
      scriptEditing(),
      pageBreaks(),
      paperTheme,
      marks && lines.length > 0 ? EditorView.decorations.of(markDecorations(lines, marks)) : [],
    ]);
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [lines, marks]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !scrollTo) return;
    const n = Math.min(Math.max(1, scrollTo.line + 1), view.state.doc.lines);
    view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(n).from, { y: "start", yMargin: 100 }) });
  }, [scrollTo]);

  return (
    <article className={marks ? "paper compare-paper" : "paper"}>
      <span className="page-number" aria-hidden="true">
        1.
      </span>
      <div className="editor-host" ref={hostRef} />
    </article>
  );
}
