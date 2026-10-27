/**
 * 두 원고 비교 (씬 정렬 + 줄 단위 비교)
 * 1) 옛 원고와 새 원고를 각각 씬으로 나눈다.
 * 2) 씬 순서와 본문 유사도를 함께 보는 동적 계획법(LCS)으로 씬 짝을 맞춘다.
 *    → 같은 장소 씬이 여러 번 나와도, 앞쪽 씬을 지웠을 때 뒤쪽 씬이 밀리거나 잘못 지워진 것으로 표시되지 않는다.
 * 3) 짝지어진 씬 안에서 줄 단위로 비교해 새 원고 줄 위에 수정 표시(marks)를 만든다.
 */
import type { ScriptLine } from "../editor/lineStyles";
import type { LineStyle } from "../editor/styles";
import { MANUAL_SCENE_NUMBER } from "../layout/sceneNumbers";

export type LineOp = { kind: "same" | "add" | "del"; line: ScriptLine };

const keyOf = (l: ScriptLine) => `${l.style}\u0001${l.text}`;

/** 줄 목록 비교 (앞뒤 같은 부분을 빼고, 가운데를 최장 공통 부분으로 맞춘다) */
export function diffLines(a: ScriptLine[], b: ScriptLine[]): LineOp[] {
  let start = 0;
  while (start < a.length && start < b.length && keyOf(a[start]) === keyOf(b[start])) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && keyOf(a[endA - 1]) === keyOf(b[endB - 1])) {
    endA--;
    endB--;
  }
  const head = a.slice(0, start).map((line): LineOp => ({ kind: "same", line }));
  const tail = a.slice(endA).map((line): LineOp => ({ kind: "same", line }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  let middle: LineOp[];
  if (midA.length * midB.length > 2_000_000) {
    middle = [
      ...midA.map((line): LineOp => ({ kind: "del", line })),
      ...midB.map((line): LineOp => ({ kind: "add", line })),
    ];
  } else {
    const n = midA.length;
    const m = midB.length;
    const ka = midA.map(keyOf);
    const kb = midB.map(keyOf);
    const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i][j] = ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
      }
    }
    middle = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (ka[i] === kb[j]) {
        middle.push({ kind: "same", line: midA[i] });
        i++;
        j++;
      } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
        middle.push({ kind: "del", line: midA[i++] });
      } else {
        middle.push({ kind: "add", line: midB[j++] });
      }
    }
    while (i < n) middle.push({ kind: "del", line: midA[i++] });
    while (j < m) middle.push({ kind: "add", line: midB[j++] });
  }
  return [...head, ...middle, ...tail];
}

type RawScene = {
  heading: string;
  base: string;
  lines: ScriptLine[];
  number: number;
  start: number;
};

const normalizeHeading = (text: string) =>
  text
    .replace(/^\s*S\s*#\s*\d+[A-Z]?\.?\s*/i, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

/** 원고를 씬으로 나눈다. 화면의 자동 씬 번호(layout/sceneNumbers.ts)와 같은 규칙 */
function splitScenes(lines: ScriptLine[]): RawScene[] {
  const scenes: RawScene[] = [];
  let current: RawScene = { heading: "", base: "", lines: [], number: 0, start: 0 };
  let previous = 0;
  const push = () => {
    if (current.heading || current.lines.some((l) => l.text.trim())) scenes.push(current);
  };
  lines.forEach((line, index) => {
    if (line.style === "scene") {
      push();
      const manual = MANUAL_SCENE_NUMBER.exec(line.text);
      previous = manual ? Number(manual[1]) : previous + 1;
      current = {
        heading: line.text,
        base: normalizeHeading(line.text),
        lines: [],
        number: previous,
        start: index,
      };
    } else {
      current.lines.push(line);
    }
  });
  push();
  return scenes;
}

/** 두 씬이 같은 씬인지 점수를 매긴다. 짝지을 수 없으면 0 이하 */
function sceneMatchScore(a: RawScene, b: RawScene): number {
  const sameHeading = (a.number === 0 && b.number === 0) || (a.base !== "" && a.base === b.base);
  const counts = new Map<string, number>();
  let nonEmptyA = 0;
  for (const l of a.lines) {
    if (!l.text.trim()) continue;
    nonEmptyA++;
    const k = keyOf(l);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let shared = 0;
  let nonEmptyB = 0;
  for (const l of b.lines) {
    if (!l.text.trim()) continue;
    nonEmptyB++;
    const k = keyOf(l);
    const c = counts.get(k) ?? 0;
    if (c > 0) {
      shared++;
      counts.set(k, c - 1);
    }
  }
  if (!sameHeading && shared === 0) return -1;
  const total = Math.max(1, nonEmptyA + nonEmptyB);
  const ratio = nonEmptyA === 0 && nonEmptyB === 0 ? 1 : (2 * shared) / total;
  // 씬헤딩만 같고 본문이 완전히 다르면 낮은 점수(300), 본문까지 같으면 높은 점수(최대 1800)
  let score = 100 + Math.round(ratio * 1000);
  if (sameHeading) score += 200;
  if (sameHeading && shared === nonEmptyA && nonEmptyA === nonEmptyB) score += 500;
  return score;
}

type ScenePair =
  | { kind: "pair"; oldScene: RawScene; newScene: RawScene }
  | { kind: "removed"; oldScene: RawScene }
  | { kind: "added"; newScene: RawScene };

/** 옛 씬 목록과 새 씬 목록을 순서대로 정렬해 짝을 짓는다 */
function alignScenes(oldScenes: RawScene[], newScenes: RawScene[]): ScenePair[] {
  const n = oldScenes.length;
  const m = newScenes.length;
  const scores = Array.from({ length: n }, (_, i) =>
    Int32Array.from({ length: m }, (_, j) => sceneMatchScore(oldScenes[i], newScenes[j])),
  );
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      let best = Math.max(dp[i + 1][j], dp[i][j + 1]);
      if (scores[i][j] > 0) {
        best = Math.max(best, scores[i][j] + dp[i + 1][j + 1]);
      }
      dp[i][j] = best;
    }
  }
  const pairs: ScenePair[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const s = scores[i][j];
    if (s > 0 && dp[i][j] === s + dp[i + 1][j + 1]) {
      pairs.push({ kind: "pair", oldScene: oldScenes[i++], newScene: newScenes[j++] });
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pairs.push({ kind: "removed", oldScene: oldScenes[i++] });
    } else {
      pairs.push({ kind: "added", newScene: newScenes[j++] });
    }
  }
  while (i < n) pairs.push({ kind: "removed", oldScene: oldScenes[i++] });
  while (j < m) pairs.push({ kind: "added", newScene: newScenes[j++] });
  return pairs;
}

/** 새 원고의 한 줄에 붙는 수정 표시 */
export type LineMark = {
  /** 새로 쓴 줄(added)인지, 있던 줄을 고친 줄(changed)인지 */
  kind?: "added" | "changed";
  /** 고친 줄이면 고치기 전 줄들 */
  before?: ScriptLine[];
  /** 이 줄 바로 앞(atEnd면 바로 뒤)에서 지운 줄들 */
  removed?: ScriptLine[];
  /** 원고 맨 끝에서 지운 줄이라 마지막 줄 뒤에 표시해야 하는지 */
  atEnd?: boolean;
};

export type SceneChange = {
  kind: "added" | "removed" | "changed" | "same";
  /** 씬헤딩 글자. 지운 씬이면 옛 씬헤딩, 첫 씬 앞이면 "" */
  heading: string;
  /** 씬 번호 (새 원고 기준, 지운 씬은 옛 원고 번호, 첫 씬 앞은 0) */
  number: number;
  /** 짝지어진 옛 씬의 번호 (앞 씬이 지워지거나 추가되어 번호가 밀렸을 때 확인용) */
  oldNumber?: number;
  added: number;
  removed: number;
  ops: LineOp[];
  /** 새 원고에서 이 씬이 놓인 줄 번호(0부터). 지운 씬은 지운 자리 */
  anchor: number;
  /** 씬 길이(줄 수). 지운 씬은 지운 줄 수 */
  size: number;
};

export type ScriptComparison = {
  scenes: SceneChange[];
  /** 새 원고 줄 번호(0부터) → 수정 표시 */
  marks: Map<number, LineMark>;
  addedScenes: number;
  removedScenes: number;
  changedScenes: number;
  addedLines: number;
  removedLines: number;
};

/** 옛 원고(before)와 새 원고(after)를 씬 단위로 정렬해 비교한다 */
export function compareScripts(before: ScriptLine[], after: ScriptLine[]): ScriptComparison {
  const oldScenes = splitScenes(before);
  const newScenes = splitScenes(after);
  const pairs = alignScenes(oldScenes, newScenes);
  const last = Math.max(0, after.length - 1);

  const marks = new Map<number, LineMark>();
  const mark = (i: number) => {
    let m = marks.get(i);
    if (!m) marks.set(i, (m = {}));
    return m;
  };
  const addRemoved = (at: number, lines: ScriptLine[]) => {
    if (lines.length === 0) return;
    const m = mark(Math.min(at, last));
    if (at > last) m.atEnd = true;
    m.removed = [...(m.removed ?? []), ...lines];
  };
  const headingLine = (h: string): ScriptLine[] => (h ? [{ style: "scene" as LineStyle, text: h }] : []);
  const count = (ops: LineOp[], kind: LineOp["kind"]) => ops.filter((o) => o.kind === kind).length;

  const result: SceneChange[] = [];
  let nextNewLine = 0;

  for (const pair of pairs) {
    if (pair.kind === "removed") {
      const { oldScene } = pair;
      const fullLines = [...headingLine(oldScene.heading), ...oldScene.lines];
      const ops = oldScene.lines.map((line): LineOp => ({ kind: "del", line }));
      const anchor = Math.min(nextNewLine, last);
      addRemoved(nextNewLine, fullLines);
      result.push({
        kind: "removed",
        heading: oldScene.heading,
        number: oldScene.number,
        oldNumber: oldScene.number,
        added: 0,
        removed: ops.length,
        ops,
        anchor,
        size: fullLines.length,
      });
      continue;
    }

    if (pair.kind === "added") {
      const { newScene } = pair;
      const fullLines = [...headingLine(newScene.heading), ...newScene.lines];
      const ops = newScene.lines.map((line): LineOp => ({ kind: "add", line }));
      for (let k = 0; k < fullLines.length; k++) {
        mark(newScene.start + k).kind = "added";
      }
      nextNewLine = newScene.start + fullLines.length;
      result.push({
        kind: "added",
        heading: newScene.heading,
        number: newScene.number,
        added: ops.length,
        removed: 0,
        ops,
        anchor: newScene.start,
        size: fullLines.length,
      });
      continue;
    }

    const { oldScene, newScene } = pair;
    const oldFull = [...headingLine(oldScene.heading), ...oldScene.lines];
    const newFull = [...headingLine(newScene.heading), ...newScene.lines];
    const ops = diffLines(oldFull, newFull);
    const added = count(ops, "add");
    const removed = count(ops, "del");

    let cursor = newScene.start;
    let i = 0;
    while (i < ops.length) {
      if (ops[i].kind === "same") {
        cursor++;
        i++;
        continue;
      }
      const dels: ScriptLine[] = [];
      const adds: number[] = [];
      while (i < ops.length && ops[i].kind !== "same") {
        if (ops[i].kind === "del") dels.push(ops[i].line);
        else adds.push(cursor++);
        i++;
      }
      if (adds.length > 0) {
        for (const a of adds) mark(a).kind = dels.length > 0 ? "changed" : "added";
        if (dels.length > 0) mark(adds[0]).before = dels;
      } else {
        addRemoved(cursor, dels);
      }
    }
    nextNewLine = newScene.start + newFull.length;

    result.push({
      kind: added || removed ? "changed" : "same",
      heading: newScene.heading,
      number: newScene.number,
      oldNumber: oldScene.number,
      added,
      removed,
      ops,
      anchor: newScene.start,
      size: newFull.length,
    });
  }

  return {
    scenes: result,
    marks,
    addedScenes: result.filter((s) => s.kind === "added").length,
    removedScenes: result.filter((s) => s.kind === "removed").length,
    changedScenes: result.filter((s) => s.kind === "changed").length,
    addedLines: result.reduce((n, s) => n + s.added, 0),
    removedLines: result.reduce((n, s) => n + s.removed, 0),
  };
}

/** 일반 글(인물 설정, 개요) 비교: 줄 단위 */
export function diffText(before: string, after: string): LineOp[] {
  const toLines = (text: string) => text.split("\n").map((t): ScriptLine => ({ style: "action", text: t }));
  return diffLines(toLines(before), toLines(after));
}
