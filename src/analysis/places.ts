import type { SceneSummary } from "./analyze";

export type PlaceGroup = {
  /** 장소 이름 ("내부. 체육관 - 밤"에서 "체육관") */
  place: string;
  scenes: { line: number; number: number; heading: string }[];
};

const NUMBER_PREFIX = /^\s*(?:(?:S\s*#|#)\s*\d+[A-Z]?\.?|\d+[A-Z]?\.)\s*/i;
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

/** "내부·실내·INT"는 안, "외부·실외·EXT"는 밖. 둘이 섞인 표기(INT/EXT 등)는 따로 센다 */
function inOutKind(prefix: string): string {
  const p = prefix.replace(/[.\s]/g, "").toUpperCase();
  if (/\//.test(p) || p === "IE") return "안팎";
  if (p === "내부" || p === "실내" || p === "내" || p === "INT") return "안";
  if (p === "외부" || p === "실외" || p === "외" || p === "EXT") return "밖";
  return p;
}

/**
 * 같은 장소인지 가르는 열쇠: "실내. 장소명. 세부장소 - 시간대"에서 **"실내. 장소명"까지만** 본다.
 * 세부장소와 시간대는 달라도 같은 장소다. 안과 밖은 다른 장소로 센다.
 * 장소가 없거나 "(장소 없음)"이면 null.
 */
export function placeKeyOf(heading: string): string | null {
  const clean = heading.replace(NUMBER_PREFIX, "").trim();
  const inOut = IN_OUT_PREFIX.exec(clean);
  const rest = clean.slice(inOut ? inOut[0].length : 0);
  const withoutTime = rest.split(/\s+[-–—](?:\s+|$)/)[0];
  const place = withoutTime.split(/\.\s+/)[0].replace(/\s+/g, " ").trim().toUpperCase();
  if (!place || place === "(장소 없음)") return null;
  return `${inOut ? inOutKind(inOut[0]) : ""}|${place}`;
}

/** 원고에 나오는 장소의 수 (같은 장소는 한 번만 센다. 씬 번호가 없는 앞부분은 뺀다) */
export function countPlaces(scenes: readonly { number: number; heading: string }[]): number {
  const keys = new Set<string>();
  for (const s of scenes) {
    if (s.number <= 0) continue;
    const key = placeKeyOf(s.heading);
    if (key) keys.add(key);
  }
  return keys.size;
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

/**
 * 씬헤딩이 "실내. 장소명. (세부장소) - 시간대" 모양에서 벗어났을 때 알려 줄 말. 괜찮으면 null.
 * 강제하지 않고 화면에 물결 밑줄과 안내로만 보여 준다. (빈 씬헤딩은 쓰는 중이므로 알리지 않는다)
 */
export function headingProblem(text: string): string | null {
  if (text.replace(NUMBER_PREFIX, "").trim() === "") return null;
  const parts = parseHeading(text);
  if (!parts.prefix) return "실내/실외 표시가 없어요. 예: 실내. 장소명 - 시간대";
  if (parts.place.trim() === "") return "장소가 없어요. 예: 실내. 장소명 - 시간대";
  if (parts.time === null || parts.time.trim() === "") return "시간대가 없어요. 예: 실내. 장소명 - 낮";
  return null;
}
