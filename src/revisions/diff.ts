/**
 * 두 원고 비교 (줄 단위, 씬 단위)
 * 씬은 장소(씬헤딩 글자)로 짝을 지어 추가/삭제/변경을 찾고, 바뀐 씬 안에서 줄 단위로 비교한다.
 */
import type { ScriptLine } from "../editor/lineStyles";
import type { LineStyle } from "../editor/styles";

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
    // 너무 많이 다르면 통째로 바뀐 것으로 본다.
    middle = [
      ...midA.map((line): LineOp => ({ kind: "del", line })),
      ...midB.map((line): LineOp => ({ kind: "add", line })),
    ];
  } else {
    const n = midA.length;
    const m = midB.length;
    const ka = midA.map(keyOf);
    const kb = midB.map(keyOf);
    // lcs[i][j] = midA[i..], midB[j..]의 최장 공통 길이
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

type Scene = { heading: string; key: string; lines: ScriptLine[]; number: number };

/** 원고를 씬으로 나눈다. 첫 씬헤딩 앞 내용은 "첫 씬 앞" */
function splitScenes(lines: ScriptLine[]): Scene[] {
  const scenes: Scene[] = [];
  let current: Scene = { heading: "", key: "", lines: [], number: 0 };
  let count = 0;
  const seen = new Map<string, number>();
  const push = () => {
    if (current.heading || current.lines.some((l) => l.text.trim())) scenes.push(current);
  };
  for (const line of lines) {
    if (line.style === "scene") {
      push();
      const base = line.text.replace(/^\s*S\s*#\s*\d+[A-Z]?\.?\s*/i, "").trim().toUpperCase();
      const n = (seen.get(base) ?? 0) + 1;
      seen.set(base, n);
      const manual = /^\s*S\s*#\s*(\d+)/i.exec(line.text);
      count = manual ? Number(manual[1]) : count + 1;
      current = { heading: line.text, key: `${base}#${n}`, lines: [], number: count };
    } else {
      current.lines.push(line);
    }
  }
  push();
  return scenes;
}

export type SceneChange = {
  kind: "added" | "removed" | "changed" | "same";
  /** 지금(나중) 원고의 씬헤딩. 지운 씬이면 옛 씬헤딩 */
  heading: string;
  added: number;
  removed: number;
  ops: LineOp[];
  /** 씬 짝짓기에 쓴 키 (장소 글자 + 같은 장소 몇 번째) */
  key: string;
  /** 씬 번호 (지운 씬은 옛 원고의 번호, 첫 씬 앞은 0) */
  number: number;
};

export type ScriptComparison = {
  scenes: SceneChange[];
  addedScenes: number;
  removedScenes: number;
  changedScenes: number;
  addedLines: number;
  removedLines: number;
};

/** 옛 원고(before)와 새 원고(after)를 씬 단위로 비교한다. 씬 순서는 새 원고 기준 */
export function compareScripts(before: ScriptLine[], after: ScriptLine[]): ScriptComparison {
  const oldScenes = splitScenes(before);
  const newScenes = splitScenes(after);
  const oldByKey = new Map(oldScenes.map((s) => [s.key, s]));
  const used = new Set<string>();
  const result: SceneChange[] = [];

  const count = (ops: LineOp[], kind: LineOp["kind"]) => ops.filter((o) => o.kind === kind).length;

  for (const scene of newScenes) {
    const old = oldByKey.get(scene.key);
    if (!old) {
      const ops = scene.lines.map((line): LineOp => ({ kind: "add", line }));
      result.push({ kind: "added", heading: scene.heading, added: ops.length, removed: 0, ops, key: scene.key, number: scene.number });
      continue;
    }
    used.add(scene.key);
    const headingLine = (h: string): ScriptLine[] => (h ? [{ style: "scene" as LineStyle, text: h }] : []);
    const ops = diffLines([...headingLine(old.heading), ...old.lines], [...headingLine(scene.heading), ...scene.lines]);
    const added = count(ops, "add");
    const removed = count(ops, "del");
    result.push({ kind: added || removed ? "changed" : "same", heading: scene.heading, added, removed, ops, key: scene.key, number: scene.number });
  }
  // 새 원고에 없는 옛 씬 = 지운 씬. 옛 순서에서 바로 앞 씬 뒤에 끼워 넣는다.
  oldScenes.forEach((scene, index) => {
    if (used.has(scene.key)) return;
    const ops = scene.lines.map((line): LineOp => ({ kind: "del", line }));
    const change: SceneChange = { kind: "removed", heading: scene.heading, added: 0, removed: ops.length, ops, key: scene.key, number: scene.number };
    const prevKey = oldScenes[index - 1]?.key;
    const at = prevKey ? result.findIndex((c) => c.key === prevKey) : -1;
    result.splice(prevKey ? at + 1 : 0, 0, change);
  });

  return {
    scenes: result,
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
