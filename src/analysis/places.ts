import type { SceneSummary } from "./analyze";

export type PlaceGroup = {
  /** 장소 이름 ("내부. 체육관 - 밤"에서 "체육관") */
  place: string;
  scenes: { line: number; number: number; heading: string }[];
};

const NUMBER_PREFIX = /^(?:S\s*#|#)\s*\d+\.?\s*/i;
const IN_OUT_PREFIX = /^(?:내부|외부|실내|실외|내|외|INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\s*\/\s*E|INT|EXT)\.?\s+/i;

/** 씬헤딩에서 장소만 뽑는다: "#3. 내부. 체육관 - 밤" → "체육관" */
export function placeOf(heading: string): string {
  const clean = heading.replace(NUMBER_PREFIX, "").trim();
  const withoutInOut = clean.replace(IN_OUT_PREFIX, "");
  const place = withoutInOut.split(/\s+[-–—](?:\s+|$)/)[0].trim();
  return place || clean;
}

/** 장소별로 씬을 묶는다. 씬이 많은 장소부터, 같으면 먼저 나온 장소부터. */
export function groupScenesByPlace(scenes: readonly SceneSummary[]): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const s of scenes) {
    if (s.number <= 0) continue;
    const place = placeOf(s.heading);
    if (!place || place === "(장소 없음)") continue;
    const key = place.toUpperCase();
    const group = groups.get(key) ?? { place, scenes: [] };
    group.scenes.push({ line: s.line, number: s.number, heading: s.heading.replace(NUMBER_PREFIX, "").trim() });
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.scenes.length - a.scenes.length);
}

export type HeadingParts = {
  /** 장소 앞부분 ("내부. " 같은 것, 띄어쓰기까지). 없으면 빈 글 */
  prefix: string;
  place: string;
  /** " - " 뒤 시간대. 없으면 null */
  time: string | null;
};

/** 씬헤딩을 앞부분(내부·외부), 장소, 시간대로 나눈다. 쓰는 중인 글도 받는다. */
export function parseHeading(text: string): HeadingParts {
  const clean = text.replace(NUMBER_PREFIX, "");
  const inOut = IN_OUT_PREFIX.exec(clean);
  const prefix = inOut ? inOut[0] : "";
  const rest = clean.slice(prefix.length);
  const dash = /\s+[-–—](?:\s+|$)/.exec(rest);
  if (!dash) return { prefix, place: rest, time: null };
  return { prefix, place: rest.slice(0, dash.index), time: rest.slice(dash.index + dash[0].length) };
}

/** 앞에서 쓴 장소들. 자주 쓴 것부터, 같으면 나중에 쓴 것부터. (내부·외부는 따지지 않는다) */
export function knownPlaces(headings: readonly string[]): string[] {
  const found = new Map<string, { count: number; last: number }>();
  headings.forEach((h, i) => {
    const place = parseHeading(h).place.trim();
    if (!place) return;
    const e = found.get(place) ?? { count: 0, last: 0 };
    found.set(place, { count: e.count + 1, last: i });
  });
  return [...found.entries()].sort((a, b) => b[1].count - a[1].count || b[1].last - a[1].last).map(([p]) => p);
}

/** 앞에서 쓴 시간대들. 같은 장소에서 쓴 것을 먼저 보여 준다. */
export function knownTimes(headings: readonly string[], place: string): string[] {
  const here = new Map<string, number>();
  const all = new Map<string, number>();
  for (const h of headings) {
    const parts = parseHeading(h);
    const time = parts.time?.trim();
    if (!time) continue;
    all.set(time, (all.get(time) ?? 0) + 1);
    if (parts.place.trim() === place.trim()) here.set(time, (here.get(time) ?? 0) + 1);
  }
  const byCount = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const first = byCount(here);
  return [...first, ...byCount(all).filter((t) => !first.includes(t))];
}
