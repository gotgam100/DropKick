/**
 * 글자 폭 계산. 원고는 타자기처럼 "칸" 단위로 계산한다.
 *
 * - 1칸 = 0.1인치 = Courier Prime 12pt 한 글자 (0.6em)
 * - Courier Prime에 없는 글자(한글 등)는 나눔고딕코딩으로 찍는다.
 *   12pt 줄 간격에서 한글이 답답하지 않도록 11pt로 찍고, 폭은 1em = 11pt ≈ 1.53칸
 *
 * 화면(CSS), 페이지 계산, PDF가 모두 이 기준을 쓰므로 세 곳의 줄바꿈이 같다.
 */

/** Courier Prime(보통/굵게 공통)이 가진 글자 범위. public/fonts의 글꼴에서 뽑았다. */
const COURIER_RANGES: ReadonlyArray<readonly [number, number]> = [
  [32, 126], [160, 311], [313, 328], [330, 382], [402, 402], [536, 539], [567, 567],
  [710, 711], [728, 733], [806, 806], [916, 916], [937, 937], [956, 956], [960, 960],
  [7808, 7813], [7922, 7923], [8209, 8209], [8211, 8212], [8216, 8218], [8220, 8222],
  [8224, 8226], [8230, 8230], [8240, 8240], [8242, 8243], [8249, 8250], [8260, 8260],
  [8308, 8308], [8355, 8355], [8361, 8361], [8364, 8364], [8482, 8482], [8706, 8706],
  [8719, 8719], [8721, 8722], [8725, 8725], [8730, 8730], [8734, 8734], [8747, 8747],
  [8776, 8776], [8800, 8800], [8804, 8805], [9674, 9674], [64257, 64258],
];

/** 한글 글자 크기 비율 (영문 12pt 대비 11pt). App.css의 size-adjust와 같아야 한다. */
export const KOREAN_SCALE = 11 / 12;

/** 한글 한 글자의 칸 수: 11pt ÷ 7.2pt */
export const WIDE_COLUMNS = (12 * KOREAN_SCALE) / 7.2;

export function isCourierChar(codePoint: number): boolean {
  if (codePoint < 127) return codePoint >= 32;
  let lo = 0;
  let hi = COURIER_RANGES.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [a, b] = COURIER_RANGES[mid];
    if (codePoint < a) hi = mid - 1;
    else if (codePoint > b) lo = mid + 1;
    else return true;
  }
  return false;
}

export function charColumns(char: string): number {
  return isCourierChar(char.codePointAt(0) ?? 32) ? 1 : WIDE_COLUMNS;
}

export function textColumns(text: string): number {
  let total = 0;
  for (const ch of text) total += charColumns(ch);
  return total;
}

/** 글꼴별로 이어진 글자 묶음. PDF에 찍을 때 쓴다. */
export type TextRun = { text: string; courier: boolean; column: number };

export function splitRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let column = 0;
  for (const ch of text) {
    const courier = isCourierChar(ch.codePointAt(0) ?? 32);
    const last = runs[runs.length - 1];
    if (last && last.courier === courier) last.text += ch;
    else runs.push({ text: ch, courier, column });
    column += courier ? 1 : WIDE_COLUMNS;
  }
  return runs;
}

const EPSILON = 1e-6;

/**
 * 주어진 칸 수 안에 들어가도록 줄을 나눈다.
 * 띄어쓰기(어절) 단위로 나누고, 한 어절이 너무 길면 글자 단위로 자른다.
 */
export function wrapText(text: string, width: number): string[] {
  const clean = text.replace(/\t/g, "    ");
  if (clean.trim() === "") return [""];

  const lines: string[] = [];
  const words = clean.split(/(\s+)/).filter((w) => w.length > 0);
  let line = "";
  let lineWidth = 0;

  const pushLine = () => {
    lines.push(line.replace(/\s+$/, ""));
    line = "";
    lineWidth = 0;
  };

  for (let index = 0; index < words.length; index++) {
    const word = words[index];
    const isSpace = /^\s+$/.test(word);
    if (isSpace) {
      if (line === "") continue; // 줄 맨 앞 공백은 버린다.
      line += word;
      lineWidth += textColumns(word);
      continue;
    }
    const wordWidth = textColumns(word);
    // 화면(브라우저)은 단어 뒤에 띄어쓰기가 오면 그 칸까지 들어가야 단어를 그 줄에 둔다.
    // 같은 규칙을 써야 화면과 PDF의 줄바꿈이 같아진다.
    const next = words[index + 1];
    const trailing = next && /^\s+$/.test(next) ? textColumns(next) : 0;
    if (lineWidth + wordWidth + trailing <= width + EPSILON) {
      line += word;
      lineWidth += wordWidth;
      continue;
    }
    if (line.trim() !== "") pushLine();
    else {
      line = "";
      lineWidth = 0;
    }
    if (wordWidth <= width + EPSILON) {
      line = word;
      lineWidth = wordWidth;
      continue;
    }
    // 한 어절이 줄보다 길면 글자 단위로 자른다.
    for (const ch of word) {
      const w = charColumns(ch);
      if (lineWidth + w > width + EPSILON && line !== "") pushLine();
      line += ch;
      lineWidth += w;
    }
  }
  if (line !== "" || lines.length === 0) pushLine();
  return lines;
}

/** 씬헤딩, 인물, 전환은 영문을 대문자로 찍는다. (한글은 영향 없음) */
export function toUpperLatin(text: string): string {
  return text.replace(/[a-zà-þ]/g, (c) => c.toUpperCase());
}
