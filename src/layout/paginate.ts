/**
 * 할리우드 표준 페이지 계산
 *
 * US Letter(8.5 x 11in), 글자 12pt. 줄 간격은 표준(1/6in)보다 넓은 1.3배라서 본문 41줄.
 * 화면(App.css --line)과 PDF가 같은 줄 간격을 쓴다.
 * 위치는 종이 왼쪽 여백(1.5in) 기준 칸 수 (1칸 = 0.1in).
 *
 *   스타일     들여쓰기  폭    앞 빈 줄
 *   씬헤딩        0      60      1
 *   액션          0      60      1 (앞 줄도 액션이면 0)
 *   인물         22      38      1
 *   괄호지문     16      24      0
 *   대사         10      35      0
 *   전환     오른쪽 정렬 60      1
 *
 * 페이지 나누기 규칙
 * - 페이지 맨 위의 빈 줄은 없앤다.
 * - 씬헤딩은 페이지 맨 아래에 혼자 남지 않게 다음 페이지로 넘긴다.
 * - 페이지는 문단(원고의 줄) 사이에서만 나눈다. 화면에서 한 문단을 두 장에 나눠 그릴 수
 *   없어서, 화면과 PDF가 똑같도록 정한 규칙이다. 한 페이지보다 긴 문단만 예외.
 * - 대사는 대사 줄과 줄 사이(문장 끝 우선)에서 나누고, 아래에 (MORE), 다음 페이지에 이름 (CONT'D)를 붙인다.
 *   앞뒤 페이지에 대사가 2줄 이상씩 남지 않으면 나누지 않고 통째로 넘긴다.
 * - 인물 이름은 대사 없이 혼자 페이지 끝에 남지 않는다.
 */
import type { ScriptLine } from "../editor/lineStyles";
import type { LineStyle } from "../editor/styles";
import { textColumns, toUpperLatin, wrapText } from "./metrics";
import { numberScenes } from "./sceneNumbers";

/**
 * 줄 간격 배수. 할리우드 표준은 1.0(12pt, 1인치 6줄)이지만 읽기 편하도록 넓혔다.
 * 바꾸면 App.css의 --line(16px × 배수, 1/64px 단위로 맞춤)도 같이 바꾼다.
 */
export const LINE_SPACING = 1.3;

const FONT_SIZE_PT = 12;
const LINE_HEIGHT_PT = FONT_SIZE_PT * LINE_SPACING;
const BODY_HEIGHT_PT = (11 - 1 - 1) * 72; // 위아래 여백 1인치씩

export const PAGE = {
  widthIn: 8.5,
  heightIn: 11,
  leftMarginIn: 1.5,
  topMarginIn: 1,
  linesPerPage: Math.floor(BODY_HEIGHT_PT / LINE_HEIGHT_PT + 1e-9),
  lineHeightPt: LINE_HEIGHT_PT,
  fontSizePt: FONT_SIZE_PT,
  columnIn: 0.1,
  bodyColumns: 60,
} as const;

type ElementSpec = { indent: number; width: number; before: number; upper: boolean; bold: boolean };

export const ELEMENTS: Record<LineStyle, ElementSpec> = {
  scene: { indent: 0, width: 60, before: 1, upper: true, bold: true },
  action: { indent: 0, width: 60, before: 1, upper: false, bold: false },
  character: { indent: 22, width: 38, before: 1, upper: true, bold: false },
  parenthetical: { indent: 16, width: 24, before: 0, upper: false, bold: false },
  dialogue: { indent: 10, width: 35, before: 0, upper: false, bold: false },
  subheader: { indent: 0, width: 60, before: 1, upper: true, bold: true },
  transition: { indent: 0, width: 60, before: 1, upper: true, bold: false },
};

export type PageLine = {
  text: string;
  /** 왼쪽 여백 기준 시작 칸 (전환은 오른쪽 정렬 후 계산된 값) */
  column: number;
  /** 페이지 안 몇 번째 줄인지 (0부터) */
  row: number;
  style: LineStyle | "more";
  bold: boolean;
  /** 원고의 몇 번째 줄에서 왔는지 (1부터). 자동으로 붙인 줄은 0 */
  source: number;
  /** 씬헤딩 첫 줄인 경우 씬 번호 (할리우드 촬영고 좌우 여백 표기용) */
  sceneNumber?: number;
};

export type Page = { number: number; lines: PageLine[] };

/** 화면에 페이지 경계를 그릴 때 필요한 정보 */
export type PageBreak = {
  /** 새 페이지 번호 */
  page: number;
  /** 새 페이지가 시작하는 원고 줄 번호 (1부터). 이 줄 바로 앞에 경계를 그린다. */
  beforeLine: number;
  /** 앞 페이지에 쓰인 줄 수 ((MORE) 포함) */
  usedRows: number;
  /** 앞 페이지 맨 아래에 (MORE)가 붙었는지 */
  more: boolean;
  /** 새 페이지 맨 위에 붙는 "이름 (CONT'D)" */
  contd?: string;
};

export type Pagination = {
  pages: Page[];
  /** 원고 줄마다 그 줄이 시작하는 페이지 번호 (index = 줄 번호 - 1) */
  pageOfLine: number[];
  breaks: PageBreak[];
  /** 마지막 페이지에 쓰인 줄 수 */
  lastPageRows: number;
};

type Row = { text: string; style: LineStyle | "more"; source: number };

type Block = {
  kind: "single" | "dialogue";
  before: number;
  rows: Row[];
  /** 대사 블록의 인물 이름 (CONT'D 용) */
  name?: string;
};

function elementRows(style: LineStyle, text: string, source: number): Row[] {
  const spec = ELEMENTS[style];
  const shown = spec.upper ? toUpperLatin(text) : text;
  return wrapText(shown, spec.width).map((t) => ({ text: t, style, source }));
}

function buildBlocks(lines: ScriptLine[]): Block[] {
  const blocks: Block[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const source = i + 1;

    if (line.style === "character") {
      const rows = elementRows("character", line.text, source);
      let j = i + 1;
      while (j < lines.length && (lines[j].style === "parenthetical" || lines[j].style === "dialogue")) {
        rows.push(...elementRows(lines[j].style, lines[j].text, j + 1));
        j++;
      }
      blocks.push({ kind: "dialogue", before: ELEMENTS.character.before, rows, name: line.text.trim() });
      i = j - 1;
      continue;
    }

    const text =
      line.style === "scene" ? line.text.replace(/^(?:S\s*#|#)\s*\d+\.?\s*/i, "").trim() : line.text;
    const continuedAction = line.style === "action" && lines[i - 1]?.style === "action";
    blocks.push({
      kind: "single",
      before: continuedAction ? 0 : ELEMENTS[line.style].before,
      rows: elementRows(line.style, text, source),
    });
  }
  return blocks;
}

const SENTENCE_END = /[.?!…。」』"”')\]]$/;

function contdName(name: string) {
  const upper = toUpperLatin(name);
  return /\(CONT'D\)\s*$/i.test(upper) ? upper : `${upper} (CONT'D)`;
}

/** 할리우드 표준 줄 간격(12pt)일 때 한 페이지 줄 수. 예상 러닝타임 계산에 쓴다. */
export const STANDARD_LINES_PER_PAGE = 54;

export function paginate(
  lines: ScriptLine[],
  linesPerPage: number = PAGE.linesPerPage,
  /** 첫 씬의 번호 (스크립트 설정) */
  sceneStart = 1,
): Pagination {
  const scenes = numberScenes(
    lines.map((l) => l.style),
    (n) => lines[n - 1].text,
    sceneStart,
  );
  const blocks = buildBlocks(lines);
  const pages: Page[] = [];
  const pageOfLine = new Array<number>(lines.length).fill(1);
  const max = linesPerPage;

  let page: Page = { number: 1, lines: [] };
  let row = 0;

  const newPage = () => {
    pages.push(page);
    page = { number: page.number + 1, lines: [] };
    row = 0;
  };

  const put = (r: Row) => {
    const spec = r.style === "more" ? ELEMENTS.character : ELEMENTS[r.style];
    const column =
      r.style === "transition" ? Math.max(0, spec.width - textColumns(r.text)) : spec.indent;
    const isFirstRowOfSource = r.source > 0 && !page.lines.some((l) => l.source === r.source);
    if (isFirstRowOfSource) {
      pageOfLine[r.source - 1] = page.number;
    }
    const sceneNumber =
      r.style === "scene" && isFirstRowOfSource ? scenes.get(r.source)?.number : undefined;
    page.lines.push({
      text: r.text,
      column,
      row,
      style: r.style,
      bold: r.style !== "more" && ELEMENTS[r.style].bold,
      source: r.source,
      sceneNumber,
    });
    row++;
  };

  const space = (n: number) => {
    if (row > 0) row += n;
  };

  for (let b = 0; b < blocks.length; b++) {
    const block = blocks[b];
    let rows = block.rows;
    let before = row === 0 ? 0 : block.before;

    // 씬헤딩: 다음 블록 첫 줄까지 이 페이지에 들어가야 한다.
    if (rows[0].style === "scene") {
      const next = blocks[b + 1];
      const nextNeed = next ? next.before + 1 : 0;
      if (row > 0 && row + before + rows.length + nextNeed > max) {
        newPage();
        before = 0;
      }
    }

    // 다 들어가면 그대로 놓는다.
    if (row + before + rows.length <= max) {
      space(before);
      rows.forEach(put);
      continue;
    }

    if (block.kind === "single" && rows[0].style === "action") {
      // 액션: 문단 중간에서 나누지 않고 다음 페이지로 넘긴다.
      // (화면에서 한 문단을 두 장에 나눠 그릴 수 없으므로)
      if (row > 0) {
        newPage();
        before = 0;
      }
      // 한 페이지보다 긴 문단만 어쩔 수 없이 나눈다.
      while (rows.length > max) {
        rows.slice(0, max).forEach(put);
        rows = rows.slice(max);
        newPage();
      }
      rows.forEach(put);
      continue;
    }

    if (block.kind === "dialogue") {
      // 대사: 이 페이지에 이름 + 대사 1줄 이상 + (MORE)가 들어가고,
      // 다음 페이지에 대사가 1줄 이상 남는 위치에서 나눈다. 문장 끝을 우선한다.
      while (row + (row === 0 ? 0 : before) + rows.length > max) {
        const avail = max - row - (row === 0 ? 0 : before);
        let split = -1;
        let fallback = -1;
        // 앞 페이지에 이름 + 대사 2줄 이상, 다음 페이지에 대사 2줄 이상이 남아야 나눈다.
        for (let k = rows.length - 2; k >= 3; k--) {
          // rows[0..k-1]을 이 페이지에, (MORE) 1줄 추가
          if (k + 1 > avail) continue;
          const last = rows[k - 1];
          if (last.style !== "dialogue") continue;
          // 대사 한 줄(문단) 중간이 아니라 줄과 줄 사이에서만 나눈다.
          if (rows[k].source === last.source) continue;
          if (rows.slice(1, k).filter((r) => r.style === "dialogue").length < 2) continue;
          if (rows.slice(k).filter((r) => r.style === "dialogue").length < 2) continue;
          if (fallback < 0) fallback = k;
          if (SENTENCE_END.test(last.text)) {
            split = k;
            break;
          }
        }
        if (split < 0) split = fallback;
        if (split < 0) {
          if (row === 0) {
            // 한 페이지보다 긴 대사: 들어가는 만큼 강제로 나눈다.
            split = Math.max(2, avail - 1);
          } else {
            newPage();
            before = 0;
            continue;
          }
        }
        space(before);
        rows.slice(0, split).forEach(put);
        put({ text: "(MORE)", style: "more", source: 0 });
        const name = contdName(block.name ?? "");
        rows = [{ text: name, style: "character", source: 0 }, ...rows.slice(split)];
        newPage();
        before = 0;
      }
      space(before);
      rows.forEach(put);
      continue;
    }

    // 그 밖의 요소(씬헤딩, 전환 등)는 나누지 않고 다음 페이지로 넘긴다.
    newPage();
    rows.forEach(put);
  }

  if (page.lines.length > 0 || pages.length === 0) pages.push(page);

  const usedRows = (p: Page) => (p.lines.length ? p.lines[p.lines.length - 1].row + 1 : 0);
  const breaks: PageBreak[] = [];
  for (let i = 1; i < pages.length; i++) {
    const prev = pages[i - 1];
    const current = pages[i];
    const first = current.lines.find((l) => l.source > 0 && pageOfLine[l.source - 1] === current.number);
    if (!first) continue;
    const top = current.lines[0];
    breaks.push({
      page: current.number,
      beforeLine: first.source,
      usedRows: usedRows(prev),
      more: prev.lines[prev.lines.length - 1]?.style === "more",
      contd: top.source === 0 && top.style === "character" ? top.text : undefined,
    });
  }
  return { pages, pageOfLine, breaks, lastPageRows: usedRows(pages[pages.length - 1]) };
}
