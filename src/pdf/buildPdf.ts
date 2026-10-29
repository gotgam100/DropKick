/**
 * 원고를 할리우드 표준 PDF로 만든다. (pdf-lib, MIT)
 *
 * 화면과 같은 페이지 계산(paginate) 결과를 그대로 찍으므로
 * 화면의 페이지 번호와 PDF의 페이지 번호가 같다.
 * 영문은 Courier Prime, 한글은 나눔고딕코딩으로 찍는다.
 */
import { PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ScriptDocument } from "../fountain/fountain";
import { KOREAN_SCALE, splitRuns, textColumns } from "../layout/metrics";
import { PAGE, paginate } from "../layout/paginate";

import type { FontFiles } from "./fonts";

export { FONT_PATHS, type FontFiles } from "./fonts";

const PT = 72; // 1인치 = 72pt
const WIDTH = PAGE.widthIn * PT;
const HEIGHT = PAGE.heightIn * PT;
const LEFT = PAGE.leftMarginIn * PT;
const COLUMN = PAGE.columnIn * PT; // 7.2pt
const SIZE = PAGE.fontSizePt;
const LINE = PAGE.lineHeightPt;
// 줄 칸 위쪽에서 글자 기준선까지 거리 (12pt 글자를 줄 칸 가운데에 놓는다)
const BASELINE = (LINE - SIZE) / 2 + 9.5;

type Fonts = { regular: [PDFFont, PDFFont]; bold: [PDFFont, PDFFont] };

/** 한 줄을 글꼴별 묶음으로 나눠, 칸 위치에 맞춰 찍는다. */
function drawLine(page: PDFPage, fonts: Fonts, text: string, column: number, row: number, bold: boolean) {
  const [courier, korean] = bold ? fonts.bold : fonts.regular;
  const y = HEIGHT - PAGE.topMarginIn * PT - row * LINE - BASELINE;
  for (const run of splitRuns(text)) {
    if (run.text.trim() === "") continue;
    page.drawText(run.text, {
      x: LEFT + (column + run.column) * COLUMN,
      y,
      size: run.courier ? SIZE : SIZE * KOREAN_SCALE,
      font: run.courier ? courier : korean,
    });
  }
}

/** 표지: Title / Credit / Author / Source 는 가운데, Draft date / Contact 는 아래 왼쪽 */
function parseTitlePage(text: string): Map<string, string[]> {
  const fields = new Map<string, string[]>();
  let key = "";
  for (const raw of text.split("\n")) {
    const match = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(raw);
    if (match) {
      key = match[1].trim().toLowerCase();
      fields.set(key, match[2].trim() ? [match[2].trim()] : []);
    } else if (key && raw.trim()) {
      fields.get(key)?.push(raw.trim());
    }
  }
  return fields;
}

function drawTitlePage(pdf: PDFDocument, fonts: Fonts, titlePage: string) {
  const fields = parseTitlePage(titlePage);
  const page = pdf.addPage([WIDTH, HEIGHT]);
  const centerColumn = PAGE.bodyColumns / 2;
  const centered = (text: string, row: number, bold = false) =>
    drawLine(page, fonts, text, centerColumn - textColumns(text) / 2, row, bold);

  let row = Math.round(PAGE.linesPerPage / 3);
  for (const line of fields.get("title") ?? []) centered(line.replace(/[*_]/g, ""), row++, true);
  row += 3;
  for (const key of ["credit", "author", "authors", "source"]) {
    for (const line of fields.get(key) ?? []) centered(line, row++);
    if (fields.has(key)) row++;
  }

  const bottom = [...(fields.get("draft date") ?? []), ...(fields.get("contact") ?? [])];
  bottom.forEach((line, i) => drawLine(page, fonts, line, 0, PAGE.linesPerPage - bottom.length + i, false));
}

export async function buildPdf(doc: ScriptDocument, files: FontFiles): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [courier, courierBold, korean, koreanBold] = await Promise.all([
    pdf.embedFont(files.courier, { subset: true }),
    pdf.embedFont(files.courierBold, { subset: true }),
    pdf.embedFont(files.korean, { subset: true }),
    pdf.embedFont(files.koreanBold, { subset: true }),
  ]);
  const fonts: Fonts = { regular: [courier, korean], bold: [courierBold, koreanBold] };

  const title = doc.titlePage ? parseTitlePage(doc.titlePage).get("title")?.join(" ") : undefined;
  if (title) pdf.setTitle(title.replace(/[*_]/g, ""));
  pdf.setCreator("DropKick");
  pdf.setProducer("DropKick (pdf-lib)");

  if (doc.titlePage && doc.titlePage.trim()) drawTitlePage(pdf, fonts, doc.titlePage);

  const { pages } = paginate(doc.lines);
  const totalPages = pages.length;
  for (const p of pages) {
    const page = pdf.addPage([WIDTH, HEIGHT]);
    // 페이지 번호: 1페이지부터, 하단 중앙, '1/20' 형식
    const label = `${p.number}/${totalPages}`;
    const textWidth = textColumns(label) * COLUMN;
    const x = (WIDTH - textWidth) / 2;
    const y = 0.5 * PT - 4;
    page.drawText(label, { x, y, size: SIZE, font: courier });

    for (const line of p.lines) {
      drawLine(page, fonts, line.text, line.column, line.row, line.bold);
      if (line.style === "scene" && line.sceneNumber != null) {
        const numStr = String(line.sceneNumber);
        // 씬 번호(할리우드 촬영고 표준): 본문에 가깝게 배치 (화면과 1:1)
        const leftX = LEFT - (textColumns(numStr) + 1.5) * COLUMN;
        const lineY = HEIGHT - PAGE.topMarginIn * PT - line.row * LINE - BASELINE;
        page.drawText(numStr, {
          x: leftX,
          y: lineY,
          size: SIZE,
          font: courierBold,
        });
        const rightX = 7.5 * PT - textColumns(numStr) * COLUMN;
        page.drawText(numStr, {
          x: rightX,
          y: lineY,
          size: SIZE,
          font: courierBold,
        });
      }
    }
  }

  return pdf.save();
}
