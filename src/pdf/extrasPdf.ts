/**
 * 원고 뒤에 붙는 부록(인물 설정, 메모, 3막 구조 표 등)을 일반 문서 모양으로 그린다.
 * 한글 글꼴(나눔고딕코딩) 하나로 영문까지 모두 찍는다.
 */
import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import type { ExtraBlock, ExtraSection } from "../export/extras";

const PT = 72;
const PAGE_W = 8.5 * PT;
const PAGE_H = 11 * PT;
const MARGIN = PT;
const CONTENT_W = PAGE_W - MARGIN * 2;
const SIZE = 10.5;
const LEADING = SIZE * 1.6;
const PAD = 5;

type Fonts = { regular: PDFFont; bold: PDFFont };

/** 글꼴에 없는 제어 문자를 걷어 낸다. */
function clean(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "");
}

/** 칸 너비에 맞게 줄을 나눈다. 띄어쓰기에서 나누고, 한 단어가 너무 길면 글자 단위로 나눈다. */
export function wrapLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of clean(text).split("\n")) {
    if (paragraph.trim() === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/(?<= )/)) {
      const candidate = line + word;
      if (font.widthOfTextAtSize(candidate.trimEnd(), size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) out.push(line.trimEnd());
      line = "";
      let rest = word;
      while (font.widthOfTextAtSize(rest.trimEnd(), size) > maxWidth) {
        let n = rest.length;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > maxWidth) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line.trimEnd());
  }
  return out;
}

class Cursor {
  page!: PDFPage;
  y = 0;
  constructor(private pdf: PDFDocument) {
    this.newPage();
  }
  newPage() {
    this.page = this.pdf.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }
  /** 이만큼 높이가 안 남았으면 새 페이지 */
  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }
}

function drawTextLines(cur: Cursor, lines: string[], font: PDFFont, size: number, x: number, leading = LEADING) {
  for (const line of lines) {
    cur.ensure(leading);
    if (line) cur.page.drawText(line, { x, y: cur.y - size, size, font });
    cur.y -= leading;
  }
}

function drawTable(cur: Cursor, fonts: Fonts, block: Extract<ExtraBlock, { kind: "table" }>) {
  const widths = block.widths.map((w) => (CONTENT_W * w) / 100);
  const border = rgb(0.72, 0.72, 0.72);

  const drawRow = (cells: string[], font: PDFFont, fill?: ReturnType<typeof rgb>) => {
    const wrapped = cells.map((c, i) => wrapLines(c, font, SIZE, widths[i] - PAD * 2));
    const offsets = new Array(cells.length).fill(0) as number[];
    // 한 행이 페이지보다 길면 줄 단위로 나눠 다음 페이지에 이어 그린다.
    for (;;) {
      cur.ensure(LEADING + PAD * 2);
      const fit = Math.max(1, Math.floor((cur.y - MARGIN - PAD * 2) / LEADING));
      const remain = Math.max(...wrapped.map((w, i) => w.length - offsets[i]));
      const take = Math.min(fit, Math.max(1, remain));
      const height = take * LEADING + PAD * 2;
      let x = MARGIN;
      wrapped.forEach((lines, i) => {
        cur.page.drawRectangle({
          x,
          y: cur.y - height,
          width: widths[i],
          height,
          borderColor: border,
          borderWidth: 0.6,
          color: fill,
        });
        lines.slice(offsets[i], offsets[i] + take).forEach((line, j) => {
          if (line) cur.page.drawText(line, { x: x + PAD, y: cur.y - PAD - j * LEADING - SIZE, size: SIZE, font });
        });
        offsets[i] += take;
        x += widths[i];
      });
      cur.y -= height;
      if (offsets.every((o, i) => o >= wrapped[i].length)) return;
      cur.newPage();
    }
  };

  drawRow(block.header, fonts.bold, rgb(0.93, 0.93, 0.93));
  for (const row of block.rows) drawRow(row, fonts.regular);
  cur.y -= LEADING * 0.5;
}

/** 부록을 PDF 끝에 붙인다. 문서(섹션)마다 새 페이지에서 시작한다. */
export function drawExtras(pdf: PDFDocument, fonts: Fonts, sections: ExtraSection[]) {
  for (const section of sections) {
    const cur = new Cursor(pdf);
    drawTextLines(cur, wrapLines(section.title, fonts.bold, 18, CONTENT_W), fonts.bold, 18, MARGIN, 18 * 1.5);
    cur.y -= LEADING * 0.6;
    for (const block of section.blocks) {
      if (block.kind === "heading") {
        cur.y -= LEADING * 0.4;
        const size = block.level === 2 ? 13 : SIZE + 1;
        cur.ensure(size * 2.5);
        drawTextLines(cur, wrapLines(block.text, fonts.bold, size, CONTENT_W), fonts.bold, size, MARGIN, size * 1.6);
      } else if (block.kind === "paragraph") {
        drawTextLines(cur, wrapLines(block.text, fonts.regular, SIZE, CONTENT_W), fonts.regular, SIZE, MARGIN);
        cur.y -= LEADING * 0.4;
      } else if (block.kind === "bullet") {
        const lines = wrapLines(block.text, fonts.regular, SIZE, CONTENT_W - 16);
        cur.ensure(LEADING);
        cur.page.drawText("-", { x: MARGIN + 4, y: cur.y - SIZE, size: SIZE, font: fonts.regular });
        drawTextLines(cur, lines, fonts.regular, SIZE, MARGIN + 16);
      } else {
        drawTable(cur, fonts, block);
      }
    }
  }
}
