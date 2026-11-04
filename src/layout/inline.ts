/**
 * 글자 꾸밈(굵게·기울임·밑줄)과 가운데 정렬. Fountain 기호를 그대로 쓴다.
 *
 *   **굵게**   *기울임*   ***굵은 기울임***   _밑줄_
 *   >가운데 정렬<   (액션 줄 전체가 >로 시작해 <로 끝나면 가운데에 놓는다)
 *   >오른쪽 정렬    (액션 줄이 >로 시작하고 <로 끝나지 않으면 오른쪽에 붙인다)
 *
 * 짝이 맞는 기호만 꾸밈이 된다. 짝이 없는 * 와 _ 는 보통 글자처럼 그대로 보이고 인쇄된다. (별점 ***, min_jae 등)
 * 밑줄 _ 은 영문·숫자 단어 안에서는 꾸밈을 시작하거나 끝내지 않는다. (file_name_v2 는 그대로)
 * 짝이 맞는데도 글자 그대로 쓰고 싶으면 앞에 \ 를 붙인다: \*, \_ (Fountain 규칙. \ 는 화면과 인쇄에서 숨는다)
 *
 * 기호는 글 속에 그대로 남아 있지만(Fountain 파일에도 그대로 저장), 화면에서는 숨기고 꾸밈만 보여 준다.
 * 줄바꿈 계산은 기호를 뺀 글로 한다. 그래서 화면과 PDF의 줄바꿈이 같다.
 */
import { textColumns } from "./metrics";

export type Span = { text: string; bold: boolean; italic: boolean; underline: boolean };

/** 글자 꾸밈이 적용되는 줄 스타일 */
export function supportsInline(style: string): boolean {
  return style === "action" || style === "dialogue" || style === "parenthetical";
}

/** `>글<` 모양의 액션 줄인지 (가운데 정렬) */
export function isCenteredText(text: string): boolean {
  const t = text.trim();
  return t.length >= 2 && t.startsWith(">") && t.endsWith("<");
}

/** `>글` 모양의 액션 줄인지 (오른쪽 정렬) */
export function isRightText(text: string): boolean {
  const t = text.trim();
  return t.length >= 2 && t.startsWith(">") && !t.endsWith("<");
}

export type Align = "left" | "center" | "right";

/** 줄 글에서 정렬을 읽는다. (액션 줄에서만 쓴다) */
export function alignOf(text: string): Align {
  if (isCenteredText(text)) return "center";
  if (isRightText(text)) return "right";
  return "left";
}

/**
 * 줄 스타일이 글자 꾸밈을 쓸 수 없는 것이면, 짝이 맞는 꾸밈 기호와 \ 표시만 빼서 돌려준다.
 * (액션을 씬헤딩으로 바꿔도 **기호**가 튀어나오지 않게. 짝이 없는 * 와 _ 는 글자라서 남긴다)
 */
export function stripMarks(text: string): string {
  return hasInline(text) ? plainText(text) : text;
}

export type Marks = {
  /** 기호 글자인지 (글자 위치마다. 화면에서는 흐리게, 인쇄에서는 뺀다) */
  marker: boolean[];
  bold: boolean[];
  italic: boolean[];
  underline: boolean[];
};

type Pattern = { re: RegExp; len: number; bold?: boolean; italic?: boolean; underline?: boolean };

// 먼저 찾은 것의 기호는 지워서 다음 패턴이 다시 쓰지 않게 한다.
const PATTERNS: Pattern[] = [
  { re: /\*{3}(?=[^\s*])([\s\S]*?[^\s*])\*{3}/g, len: 3, bold: true, italic: true },
  { re: /\*{2}(?=[^\s*])([\s\S]*?[^\s*])\*{2}/g, len: 2, bold: true },
  { re: /\*(?=[^\s*])([\s\S]*?[^\s*])\*/g, len: 1, italic: true },
  // 밑줄은 영문·숫자 바로 옆의 _ 로는 시작하거나 끝나지 않는다. (snake_case, 메일 주소 등)
  { re: /(?<![A-Za-z0-9])_(?=[^\s_])([\s\S]*?[^\s_])_(?![A-Za-z0-9])/g, len: 1, underline: true },
];

/** 글 한 줄(문단)의 글자마다 꾸밈과 기호 표시를 계산한다. 가운데 정렬 기호 `>` `<`도 기호로 친다. */
export function inlineMarks(text: string, alignment: Align | boolean = "left"): Marks {
  const align: Align = alignment === true ? "center" : alignment === false ? "left" : alignment;
  const n = text.length;
  const marks: Marks = {
    marker: new Array(n).fill(false),
    bold: new Array(n).fill(false),
    italic: new Array(n).fill(false),
    underline: new Array(n).fill(false),
  };
  let work = text;

  // \* \_ \\ : 앞의 \ 는 숨기고 뒤 글자는 꾸밈 기호로 읽지 않는다.
  if (work.includes("\\")) {
    const chars = work.split("");
    for (let i = 0; i < n - 1; i++) {
      if (chars[i] === "\\" && (chars[i + 1] === "*" || chars[i + 1] === "_" || chars[i + 1] === "\\")) {
        marks.marker[i] = true;
        chars[i] = "\u0001";
        chars[i + 1] = "\u0002";
        i++;
      }
    }
    work = chars.join("");
  }

  if (align !== "left") {
    const first = text.search(/\S/);
    if (first >= 0) marks.marker[first] = true;
    if (align === "center") {
      const last = text.search(/\S\s*$/);
      if (last >= 0) marks.marker[last] = true;
      // 안쪽만 보고 꾸밈을 찾는다.
      if (first >= 0 && last >= 0) work = work.slice(0, first) + " " + work.slice(first + 1, last) + " " + work.slice(last + 1);
    } else if (first >= 0) {
      work = work.slice(0, first) + " " + work.slice(first + 1);
    }
  }

  for (const p of PATTERNS) {
    const re = new RegExp(p.re.source, "g");
    const hits: { start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(work)) !== null) hits.push({ start: m.index, end: m.index + m[0].length });
    if (hits.length === 0) continue;
    const chars = work.split("");
    for (const { start, end } of hits) {
      for (let i = start; i < start + p.len; i++) {
        marks.marker[i] = true;
        chars[i] = "\u0001";
      }
      for (let i = end - p.len; i < end; i++) {
        marks.marker[i] = true;
        chars[i] = "\u0001";
      }
      for (let i = start + p.len; i < end - p.len; i++) {
        if (p.bold) marks.bold[i] = true;
        if (p.italic) marks.italic[i] = true;
        if (p.underline) marks.underline[i] = true;
      }
    }
    work = chars.join("");
  }
  // 짝이 맞지 않고 남은 * 와 _ 는 보통 글자다. (그대로 보이고 인쇄된다)
  return marks;
}

/** 글 한 줄에 꾸밈이나 가운데 정렬 기호가 하나라도 있는지 */
export function hasInline(text: string): boolean {
  return isCenteredText(text) || isRightText(text) || /[*_\\]/.test(text);
}

/**
 * 줄바꿈된 줄(rows)마다 꾸밈별로 나눈 글 조각을 돌려준다.
 * rows는 wrapText(plainText(raw), …)의 결과여야 한다. (기호를 뺀 보이는 글을 줄바꿈한 것. 줄 사이에서 버려진 공백만 건너뛰며 맞춰 본다)
 */
export function rowSpans(raw: string, rows: readonly string[], align: Align | boolean = "left"): Span[][] {
  const clean = raw.replace(/\t/g, "    ");
  const marks = inlineMarks(clean, align);
  const visible: number[] = [];
  for (let i = 0; i < clean.length; i++) if (!marks.marker[i]) visible.push(i);
  const out: Span[][] = [];
  let p = 0;
  for (const row of rows) {
    while (p < visible.length && /\s/.test(clean[visible[p]])) p++;
    const spans: Span[] = [];
    for (let k = 0; k < row.length; k++) {
      if (p + k >= visible.length) break;
      const i = visible[p + k];
      const bold = marks.bold[i];
      const italic = marks.italic[i];
      const underline = marks.underline[i];
      const last = spans[spans.length - 1];
      if (last && last.bold === bold && last.italic === italic && last.underline === underline) last.text += clean[i];
      else spans.push({ text: clean[i], bold, italic, underline });
    }
    p += row.length;
    out.push(spans);
  }
  return out;
}

export function spansColumns(spans: readonly Span[]): number {
  return spans.reduce((sum, s) => sum + textColumns(s.text), 0);
}

/** 기호를 뺀 보이는 글 */
export function plainText(raw: string, align: Align | boolean = "left"): string {
  const marks = inlineMarks(raw, align);
  let out = "";
  for (let i = 0; i < raw.length; i++) if (!marks.marker[i]) out += raw[i];
  return out;
}

/** 액션 줄 앞의 들여쓰기가 너무 넓어 줄이 안 남지 않게 하는 한도 (칸) */
export const MAX_INDENT = 40;

/** 줄 앞의 공백(탭은 4칸)을 칸 수로 센다. 쪽지·편지처럼 안쪽으로 들여 쓴 액션에 쓴다. */
export function leadingIndent(text: string): { columns: number; rest: string } {
  const m = /^[ \t]+/.exec(text);
  if (!m) return { columns: 0, rest: text };
  let columns = 0;
  for (const ch of m[0]) columns += ch === "\t" ? 4 : 1;
  return { columns, rest: text.slice(m[0].length) };
}

/** 화면과 PDF가 줄 전체를 안쪽으로 들여 그리는 액션 줄이면 들여쓴 칸 수, 아니면 0 */
export function actionIndent(text: string): number {
  const { columns, rest } = leadingIndent(text);
  if (columns === 0 || rest.trim() === "" || isCenteredText(rest) || isRightText(rest)) return 0;
  return Math.min(columns, MAX_INDENT);
}

export type FormatKind = "bold" | "italic" | "underline";

type Piece = { ch: string; bold: boolean; italic: boolean; underline: boolean };

/**
 * 한 줄 글에서 [from, to) 글자(기호를 뺀 보이는 글 기준)에 굵게·기울임·밑줄을 켜거나 끈다.
 * 고른 글이 모두 이미 그 꾸밈이면 끄고, 아니면 켠다. 꾸밈이 겹쳐도 되고, 글자 그대로의 * _ 는 그대로 남는다.
 * 커서만 있을 때(from===to)는 커서가 꾸민 글 안에 있을 때만 그 꾸밈을 끄고, 아니면 null을 돌려준다.
 * 돌려주는 from·to는 새 글 속 위치다. (줄 맨 앞부터 센 글자 수)
 */
export function applyFormat(text: string, selFrom: number, selTo: number, kind: FormatKind): { text: string; from: number; to: number } | null {
  const align = alignOf(text);
  const leadRe = align === "left" ? /^\s*/ : /^\s*>/;
  const lead = leadRe.exec(text)?.[0] ?? "";
  const tailMatch = align === "center" ? /<\s*$/.exec(text.slice(lead.length)) : null;
  const tail = tailMatch?.[0] ?? "";
  const middle = text.slice(lead.length, text.length - tail.length);

  const marks = inlineMarks(middle);
  const pieces: Piece[] = [];
  const visibleAt: number[] = []; // 보이는 글자 번호 → middle 위치
  for (let i = 0; i < middle.length; i++) {
    if (marks.marker[i]) continue;
    visibleAt.push(i);
    pieces.push({ ch: middle[i], bold: marks.bold[i], italic: marks.italic[i], underline: marks.underline[i] });
  }
  const toVisible = (pos: number) => {
    const p = Math.max(0, Math.min(middle.length, pos - lead.length));
    let k = 0;
    while (k < visibleAt.length && visibleAt[k] < p) k++;
    return k;
  };
  const a0 = toVisible(selFrom);
  const b0 = toVisible(selTo);
  let a = a0;
  let b = b0;
  let turnOff = false;

  if (a === b) {
    // 커서만: 커서 앞뒤 글자가 이 꾸밈이면 그 꾸밈이 이어진 곳 전체를 끈다.
    const has = (i: number) => i >= 0 && i < pieces.length && pieces[i][kind];
    const c = has(a - 1) ? a - 1 : has(a) ? a : -1;
    if (c < 0) return null;
    a = c;
    while (has(a - 1)) a--;
    b = c + 1;
    while (has(b)) b++;
    turnOff = true;
  } else {
    const targets = pieces.slice(a, b).filter((p) => !/\s/.test(p.ch));
    if (targets.length === 0) return null;
    turnOff = targets.every((p) => p[kind]);
  }
  for (let i = a; i < b; i++) pieces[i][kind] = !turnOff;

  // 다시 쓰기: 밑줄이 바깥, 그 안에 굵게·기울임.
  // 글자 그대로의 * _ \ 는 먼저 그대로 써 보고, 다시 읽었을 때 모양이 달라지면 앞에 \ 를 붙여 다시 쓴다.
  const write = (escape: boolean) => {
    const outPos: number[] = new Array(pieces.length);
    let out = "";
    const put = (k: number) => {
      const ch = pieces[k].ch;
      if (escape && (ch === "*" || ch === "_" || ch === "\\")) out += "\\";
      outPos[k] = out.length;
      out += ch;
    };
    const emitRun = (from: number, to: number, mark: string) => {
      let s0 = from;
      let e0 = to;
      if (mark) {
        while (s0 < e0 && /\s/.test(pieces[s0].ch)) s0++;
        while (e0 > s0 && /\s/.test(pieces[e0 - 1].ch)) e0--;
        if (s0 === e0) mark = "";
      }
      for (let k = from; k < to; k++) {
        if (mark && k === s0) out += mark;
        put(k);
        if (mark && k === e0 - 1) out += mark;
      }
    };
    const emitInner = (from: number, to: number) => {
      let i = from;
      while (i < to) {
        let j = i;
        while (j < to && pieces[j].bold === pieces[i].bold && pieces[j].italic === pieces[i].italic) j++;
        emitRun(i, j, pieces[i].bold ? (pieces[i].italic ? "***" : "**") : pieces[i].italic ? "*" : "");
        i = j;
      }
    };
    let i = 0;
    while (i < pieces.length) {
      let j = i;
      while (j < pieces.length && pieces[j].underline === pieces[i].underline) j++;
      if (!pieces[i].underline) emitInner(i, j);
      else {
        let s0 = i;
        let e0 = j;
        while (s0 < e0 && /\s/.test(pieces[s0].ch)) s0++;
        while (e0 > s0 && /\s/.test(pieces[e0 - 1].ch)) e0--;
        if (s0 === e0) emitInner(i, j);
        else {
          emitInner(i, s0);
          out += "_";
          emitInner(s0, e0);
          out += "_";
          emitInner(e0, j);
        }
      }
      i = j;
    }
    return { out, outPos };
  };
  const readsBack = (text: string) => {
    const m = inlineMarks(text);
    const back: Piece[] = [];
    for (let k = 0; k < text.length; k++)
      if (!m.marker[k]) back.push({ ch: text[k], bold: m.bold[k], italic: m.italic[k], underline: m.underline[k] });
    return (
      back.length === pieces.length &&
      back.every((p, k) => p.ch === pieces[k].ch && p.bold === pieces[k].bold && p.italic === pieces[k].italic && p.underline === pieces[k].underline)
    );
  };
  let written = write(false);
  if (!readsBack(written.out)) written = write(true);
  const { out, outPos } = written;

  const base = lead.length;
  const caret = a0 === b0;
  const pos = (k: number, end = false) => {
    if (pieces.length === 0) return base;
    if (end) return base + (k <= 0 ? 0 : outPos[k - 1] + 1);
    return base + (k >= pieces.length ? outPos[pieces.length - 1] + 1 : outPos[k]);
  };
  return {
    text: lead + out + tail,
    from: pos(a0),
    to: caret ? pos(a0) : pos(b0, true),
  };
}
