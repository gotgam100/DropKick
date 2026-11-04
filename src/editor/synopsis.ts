/**
 * 씬 요약(`=` 줄)의 규칙.
 *
 * 요약은 씬헤딩 바로 아래에서 이어지는 줄들뿐이다. 씬헤딩이 지워지거나 스타일이 바뀌어
 * 어느 씬에도 속하지 않게 된 요약 줄을 "주인 없는 요약"이라 부르고,
 * 앞 씬의 요약으로 합치거나 일반 글(액션)로 남긴다.
 */
import type { EditorState, StateEffect, TransactionSpec } from "@codemirror/state";
import { sceneHeadingText } from "../layout/sceneNumbers";
import { lineStylesField, sceneNumbersField, setLineStyleEffect, type ScriptLine } from "./lineStyles";

export type LineRange = { from: number; to: number };

/** 주인 없는 요약 줄을 이어진 덩어리로 (1부터, 끝 포함) */
export function orphanChains(lines: readonly Pick<ScriptLine, "style">[]): LineRange[] {
  const chains: LineRange[] = [];
  let owned = false;
  lines.forEach((line, i) => {
    if (line.style === "scene") owned = true;
    else if (line.style === "synopsis") {
      if (owned) return;
      const last = chains[chains.length - 1];
      if (last && last.to === i) last.to = i + 1;
      else chains.push({ from: i + 1, to: i + 1 });
    } else owned = false;
  });
  return chains;
}

/** line보다 앞에 있는 가장 가까운 씬헤딩 줄 번호 (없으면 null) */
export function previousScene(lines: readonly Pick<ScriptLine, "style">[], line: number): number | null {
  for (let n = line - 1; n >= 1; n--) if (lines[n - 1].style === "scene") return n;
  return null;
}

/** 일반 글(액션)로 남긴다. 글은 그대로다. */
export function keepOrphans(lines: readonly ScriptLine[]): ScriptLine[] {
  const out = lines.map((l) => ({ ...l }));
  for (const chain of orphanChains(out)) for (let n = chain.from; n <= chain.to; n++) out[n - 1].style = "action";
  return out;
}

/**
 * 앞 씬의 요약 맨 끝으로 옮겨 합친다. 앞에 씬이 없는 요약은 일반 글(액션)로 남긴다.
 */
export function mergeOrphans(lines: readonly ScriptLine[]): ScriptLine[] {
  let out = lines.map((l) => ({ ...l }));
  for (;;) {
    const chains = orphanChains(out);
    const chain = chains[chains.length - 1];
    if (!chain) return out;
    const scene = previousScene(out, chain.from);
    if (scene === null) {
      for (let n = chain.from; n <= chain.to; n++) out[n - 1].style = "action";
      continue;
    }
    // 앞 씬의 요약이 끝나는 곳
    let end = scene;
    while (end < chain.from - 1 && out[end].style === "synopsis") end++;
    const moved = out.slice(chain.from - 1, chain.to);
    out = [...out.slice(0, end), ...moved, ...out.slice(end, chain.from - 1), ...out.slice(chain.to)];
  }
}

/** 지금 상태에서 첫 번째 주인 없는 요약 덩어리와, 합칠 앞 씬의 이름 */
export function orphanInfo(
  state: EditorState,
): { chains: LineRange[]; texts: string[]; target: string | null } | null {
  const styles = state.field(lineStylesField);
  const chains = orphanChains(styles.map((style) => ({ style })));
  if (chains.length === 0) return null;
  const first = chains[0];
  const texts: string[] = [];
  for (let n = first.from; n <= first.to; n++) texts.push(state.doc.line(n).text);
  const scene = previousScene(
    styles.map((style) => ({ style })),
    first.from,
  );
  let target: string | null = null;
  if (scene !== null) {
    const heading = state.doc.line(scene).text;
    target = sceneHeadingText(heading, state.field(sceneNumbersField).get(scene)).replace(/^#/, "").trim() || "(장소 없음)";
  }
  return { chains, texts, target };
}

/**
 * 원고 전체를 newLines로 바꾸는 변경 (달라진 줄 범위만 바꾼다). 글과 줄 스타일이 함께 바뀌고
 * 한 번의 ⌘Z로 되돌아간다. 달라진 게 없으면 null.
 */
export function replaceLinesSpec(state: EditorState, newLines: readonly ScriptLine[]): TransactionSpec | null {
  const styles = state.field(lineStylesField);
  const oldCount = state.doc.lines;
  const same = (i: number) => newLines[i] && newLines[i].text === state.doc.line(i + 1).text && newLines[i].style === styles[i];
  let start = 0;
  while (start < oldCount && start < newLines.length && same(start)) start++;
  let endOld = oldCount;
  let endNew = newLines.length;
  const sameTail = () =>
    newLines[endNew - 1].text === state.doc.line(endOld).text && newLines[endNew - 1].style === styles[endOld - 1];
  while (endOld > start && endNew > start && sameTail()) {
    endOld--;
    endNew--;
  }
  if (start >= oldCount && start >= newLines.length) return null;

  const region = newLines.slice(start, endNew);
  const from = start < oldCount ? state.doc.line(start + 1).from : state.doc.length;
  const to = endOld > start ? state.doc.line(endOld).to : from;
  const effects: StateEffect<unknown>[] = [];
  let pos = from;
  for (const l of region) {
    effects.push(setLineStyleEffect.of({ pos, style: l.style }));
    pos += l.text.length + 1;
  }
  return { changes: { from, to, insert: region.map((l) => l.text).join("\n") }, effects, userEvent: "input.style" };
}
