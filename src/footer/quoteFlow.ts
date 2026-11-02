/**
 * 푸터 명대사를 보여 주는 규칙 (화면과 상관없는 순수 함수들).
 *  - 순서는 한 바퀴를 다 돌 때까지 겹치지 않게 섞는다.
 *  - 긴 문장은 가운데 근처에서 한 번만 나눠 "…"로 잇는다.
 *  - 나타나는 간격은 매번 다르게 한다.
 */
import { QUOTES, type Quote } from "./quotes";

/** 한 번에 보여 줄 글자 수(명대사 본문 기준). 넘으면 둘로 나눈다 */
export const MAX_PART_CHARS = 38;

/** 처음 나타나기까지, 그리고 그다음부터 쉬는 시간(ms) */
export const FIRST_DELAY_MS: readonly [number, number] = [10_000, 30_000];
export const GAP_DELAY_MS: readonly [number, number] = [25_000, 90_000];
/** 올라오고 내려가는 데 걸리는 시간과 머무는 시간(ms). 올라오고 내려가는 시간은 CSS와 같게 둔다 */
export const SLIDE_MS = 500;
export const STAY_MS = 7_000;

/** [min, max] 사이의 무작위 시간 */
export function randomDelay([min, max]: readonly [number, number], random: () => number = Math.random): number {
  return Math.round(min + random() * (max - min));
}

/**
 * 긴 문장을 한 번만 나눈다. 가운데에서 가장 가까운 띄어쓰기에서 자르고,
 * 앞 조각은 "..."으로 끝나고 뒤 조각은 "..."으로 시작한다. 짧으면 나누지 않는다.
 */
export function splitQuote(text: string, max: number = MAX_PART_CHARS): string[] {
  let clean = text.replace(/\s+/g, " ").trim();
  if ([...clean].length <= max) return [clean];
  // 두 조각으로도 안 들어가는 아주 긴 대사는 뒤를 줄인다
  if (clean.length > max * 2) clean = `${clean.slice(0, max * 2 - 3).trimEnd().replace(/[.,]$/, "")}...`;
  const middle = clean.length / 2;
  let best = -1;
  for (let i = 1; i < clean.length - 1; i++) {
    if (clean[i] !== " ") continue;
    if (best === -1 || Math.abs(i - middle) < Math.abs(best - middle)) best = i;
  }
  if (best === -1) return [clean];
  const head = clean.slice(0, best).trim().replace(/[.,]$/, "");
  return [`${head}...`, `...${clean.slice(best + 1).trim()}`];
}

/** 사용자가 적은 명대사가 한 바퀴에 나오는 횟수. 100개 속에 묻히지 않게 여러 번 넣는다 */
export const CUSTOM_WEIGHT = 5;
/** 나만의 명대사는 최대 두 줄, 한 줄에 100자까지 */
export const MAX_CUSTOM_LINES = 2;
export const MAX_CUSTOM_CHARS = 100;

/** 입력창에 적은 글을 나만의 명대사 줄들로 바꾼다 (빈 줄은 뺀다) */
export function customQuoteLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim().slice(0, MAX_CUSTOM_CHARS))
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_LINES);
}

/** 입력창 글을 두 줄, 줄마다 100자까지로 맞춘다 (적는 도중이라 빈 줄은 그대로 둔다) */
export function limitCustomQuotes(text: string): string {
  return text
    .split("\n")
    .slice(0, MAX_CUSTOM_LINES)
    .map((l) => l.slice(0, MAX_CUSTOM_CHARS))
    .join("\n");
}

/** 기본 명대사에 나만의 명대사를 섞은 목록 */
export function quotePool(customText: string, base: readonly Quote[] = QUOTES): Quote[] {
  const custom = customQuoteLines(customText).map((text): Quote => ({ text, custom: true }));
  return [...base, ...custom.flatMap((q) => Array.from({ length: CUSTOM_WEIGHT }, () => q))];
}

/** 대사 뒤에 붙는 출처: <작품명>(연도), 인물명(배우). 나만의 명대사에는 없다 */
export function quoteSuffix(quote: Quote): string {
  if (quote.custom || !quote.work) return "";
  return ` <${quote.work}>${quote.year ? `(${quote.year})` : ""}${quote.who ? `, ${quote.who}` : ""}`;
}

/** 화면에 보여 줄 글: "대사" <작품명>(연도), 인물명(배우). 나만의 명대사는 적은 그대로 */
export function quoteLabel(part: string, quote: Quote, isLast: boolean): string {
  if (quote.custom) return part;
  return `"${part}"${isLast ? quoteSuffix(quote) : ""}`;
}

/** 명대사 목록을 섞어서 하나씩 내준다. 한 바퀴가 끝나면 다시 섞되, 같은 글(나만의 명대사는 여러 번 들어 있다)이 연달아 나오지 않게 한다 */
export function createQuoteDeck(quotes: readonly Quote[], random: () => number = Math.random): () => Quote {
  let queue: Quote[] = [];
  let at = 0;
  let last: Quote | null = null;
  const shuffled = () => {
    const copy = [...quotes];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    // 섞은 차례를 되도록 지키면서, 같은 글이 이웃하지 않게 다시 놓는다.
    // 한 글이 남은 자리의 절반을 넘게 남으면 그 글을 먼저 놓아야 끝에서 겹치지 않는다.
    const rest = copy;
    const out: Quote[] = [];
    let prev = last?.text;
    while (rest.length > 0) {
      const counts = new Map<string, number>();
      for (const q of rest) counts.set(q.text, (counts.get(q.text) ?? 0) + 1);
      let top = rest[0].text;
      for (const [text, n] of counts) if (n > (counts.get(top) ?? 0)) top = text;
      const mustPlaceTop = (counts.get(top) ?? 0) * 2 - 1 >= rest.length && top !== prev;
      let at = mustPlaceTop ? rest.findIndex((q) => q.text === top) : rest.findIndex((q) => q.text !== prev);
      if (at === -1) at = 0; // 남은 것이 모두 같은 글이면 어쩔 수 없다
      const [picked] = rest.splice(at, 1);
      out.push(picked);
      prev = picked.text;
    }
    return out;
  };
  return () => {
    if (at >= queue.length) {
      queue = shuffled();
      at = 0;
    }
    last = queue[at++];
    return last;
  };
}
