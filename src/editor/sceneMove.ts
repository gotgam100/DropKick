import type { EditorState, StateEffect, TransactionSpec } from "@codemirror/state";
import { lineStylesField, setLineStyleEffect, type ScriptLine } from "./lineStyles";

export type SceneMove = {
  /** 바뀌는 줄 범위 (1부터, 끝 포함). 이 밖의 줄은 그대로다. */
  from: number;
  to: number;
  /** 그 범위를 대신할 새 줄들 */
  lines: ScriptLine[];
  /** 옮긴 씬의 씬헤딩이 새 원고에서 있는 줄 번호 */
  headingLine: number;
};

/** 씬헤딩 줄 번호들 (1부터) */
export function sceneStarts(lines: readonly ScriptLine[]): number[] {
  const starts: number[] = [];
  lines.forEach((l, i) => l.style === "scene" && starts.push(i + 1));
  return starts;
}

/** 씬이 끝나는 곳: 다음 씬헤딩이나 막·장 줄 앞. (막·장 줄은 씬을 옮겨도 제자리에 남는다) */
function blockEndOf(lines: readonly ScriptLine[], headingLine: number): number {
  let end = headingLine;
  while (end < lines.length && !["scene", "act", "chapter"].includes(lines[end].style)) end++;
  return end;
}

/**
 * 씬 하나(씬헤딩부터 다음 씬헤딩이나 막·장 줄 앞까지, 씬 요약 포함)를 다른 씬 앞으로 옮긴다.
 * @param fromLine 옮길 씬의 씬헤딩 줄 번호
 * @param beforeLine 이 씬헤딩 앞에 놓는다. null이면 맨 끝
 * 옮겨도 달라지는 게 없거나 씬이 아니면 null.
 */
export function moveScene(lines: readonly ScriptLine[], fromLine: number, beforeLine: number | null): SceneMove | null {
  const starts = sceneStarts(lines);
  const at = starts.indexOf(fromLine);
  if (at < 0) return null;
  if (beforeLine !== null && !starts.includes(beforeLine)) return null;

  const blockEnd = blockEndOf(lines, fromLine);
  const dest = beforeLine ?? lines.length + 1;
  // 자기 자리나 바로 다음 자리로는 옮길 게 없다.
  if (dest === fromLine || dest === blockEnd + 1) return null;

  const block = lines.slice(fromLine - 1, blockEnd);
  if (dest < fromLine) {
    const between = lines.slice(dest - 1, fromLine - 1);
    return { from: dest, to: blockEnd, lines: [...block, ...between], headingLine: dest };
  }
  const between = lines.slice(blockEnd, dest - 1);
  return { from: fromLine, to: dest - 1, lines: [...between, ...block], headingLine: fromLine + between.length };
}

/**
 * 편집기 상태에서 씬을 옮기는 변경을 만든다. 글과 줄 스타일이 함께 바뀌고, 한 번의 ⌘Z로 되돌아간다.
 * headingLine은 옮긴 씬의 씬헤딩이 바뀐 뒤 문서에서 있는 줄 번호.
 */
export function sceneMoveSpec(
  state: EditorState,
  fromLine: number,
  beforeLine: number | null,
): { spec: TransactionSpec; headingLine: number } | null {
  const styles = state.field(lineStylesField);
  const lines = styles.map((style, i) => ({ style, text: state.doc.line(i + 1).text }));
  const move = moveScene(lines, fromLine, beforeLine);
  if (!move) return null;
  const from = state.doc.line(move.from).from;
  const to = state.doc.line(move.to).to;
  // 줄마다 스타일도 새 자리에 맞게 정한다. (효과 위치는 바뀐 뒤 문서 기준)
  const effects: StateEffect<unknown>[] = [];
  let pos = from;
  for (const l of move.lines) {
    effects.push(setLineStyleEffect.of({ pos, style: l.style }));
    pos += l.text.length + 1;
  }
  return {
    spec: { changes: { from, to, insert: move.lines.map((l) => l.text).join("\n") }, effects, userEvent: "move" },
    headingLine: move.headingLine,
  };
}
