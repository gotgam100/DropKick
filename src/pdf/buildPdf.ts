/**
 * 원고를 할리우드 표준 PDF로 만든다. (pdf-lib, MIT)
 *
 * 화면과 같은 페이지 계산(paginate) 결과를 그대로 찍으므로
 * 화면의 페이지 번호와 PDF의 페이지 번호가 같다.
 * 영문은 Courier Prime, 한글은 나눔고딕코딩으로 찍는다.
 */
import { PDFDocument, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { ScriptDocument } from "../fountain/fountain";
import { KOREAN_SCALE, splitRuns, textColumns } from "../layout/metrics";
import { PAGE, paginate } from "../layout/paginate";
import { COVER_TITLE_SCALE, WATERMARK } from "../project/scriptSettings";

import type { ExtraSection } from "../export/extras";
import { drawExtras } from "./extrasPdf";
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
function drawLine(page: PDFPage, fonts: Fonts, text: string, column: number, row: number, bold: boolean, scale = 1) {
  const [courier, korean] = bold ? fonts.bold : fonts.regular;
  const y = HEIGHT - PAGE.topMarginIn * PT - row * LINE - BASELINE;
  for (const run of splitRuns(text)) {
    if (run.text.trim() === "") continue;
    page.drawText(run.text, {
      x: LEFT + column * COLUMN + run.column * COLUMN * scale,
      y,
      size: (run.courier ? SIZE : SIZE * KOREAN_SCALE) * scale,
      font: run.courier ? courier : korean,
    });
  }
}

/** 표지: Title / Credit / Source / Author 는 가운데, Draft date / Contact 는 아래 오른쪽(오른쪽 정렬) */
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
  const centered = (text: string, row: number, bold = false, scale = 1) =>
    drawLine(page, fonts, text, centerColumn - (textColumns(text) * scale) / 2, row, bold, scale);

  let row = Math.round(PAGE.linesPerPage / 3);
  for (const line of fields.get("title") ?? []) centered(line.replace(/[*_]/g, ""), row++, true, COVER_TITLE_SCALE);
  row += 1; // 제목 아래는 한 줄만 띄운다
  for (const key of ["credit", "source", "author", "authors"]) {
    for (const line of fields.get(key) ?? []) centered(line, row++);
    if (fields.has(key)) row += key === "source" ? 2 : 1; // 부제·원작과 작가 사이는 한 줄 더 띄운다
  }

  const bottom = [...(fields.get("draft date") ?? []), ...(fields.get("contact") ?? [])];
  bottom.forEach((line, i) =>
    drawLine(page, fonts, line, PAGE.bodyColumns - textColumns(line), PAGE.linesPerPage - bottom.length + i, false),
  );
}

/** 워터마크 글자: 불투명도 10%, 기울어진 글씨가 쪽 전체에 반복된다. */

/** 한 쪽 전체에 워터마크를 반복해서 찍는다. 글이 길면 글자를 줄여 한 줄이 쪽 안에 들어오게 한다. */
export function drawWatermark(page: PDFPage, font: PDFFont, rawText: string) {
  const text = rawText.replace(/\s+/g, " ").trim();
  if (!text) return;
  const { width, height } = page.getSize();
  const natural = font.widthOfTextAtSize(text, WATERMARK.size);
  const size = natural > WATERMARK.maxWidth ? Math.max(8, (WATERMARK.size * WATERMARK.maxWidth) / natural) : WATERMARK.size;
  const w = font.widthOfTextAtSize(text, size);
  const rad = (WATERMARK.angle * Math.PI) / 180;
  const stepX = w + 70;
  const stepY = Math.max(110, w * Math.sin(rad) + size * 4);
  // 글자 가운데가 격자 점에 오도록 시작점을 옮긴다. 줄마다 반 칸씩 엇갈리게 놓는다.
  for (let row = 0, cy = -stepY; cy < height + stepY; cy += stepY, row++) {
    for (let cx = -stepX + (row % 2 ? stepX / 2 : 0); cx < width + stepX; cx += stepX) {
      page.drawText(text, {
        x: cx - (w / 2) * Math.cos(rad),
        y: cy - (w / 2) * Math.sin(rad),
        size,
        font,
        color: rgb(0, 0, 0),
        opacity: WATERMARK.opacity,
        rotate: degrees(WATERMARK.angle),
      });
    }
  }
}

/**
 * doc가 null이면 원고 없이 부록(extras)만 담는다.
 * extras는 원고 뒤에 문서마다 새 페이지에서 이어 붙는다.
 * watermark가 있으면 표지와 부록을 포함한 모든 쪽에 찍는다.
 */
export async function buildPdf(
  doc: ScriptDocument | null,
  files: FontFiles,
  extras: ExtraSection[] = [],
  options: { watermark?: string } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [courier, courierBold, korean, koreanBold] = await Promise.all([
    pdf.embedFont(files.courier, { subset: true }),
    pdf.embedFont(files.courierBold, { subset: true }),
    pdf.embedFont(files.korean, { subset: true }),
    pdf.embedFont(files.koreanBold, { subset: true }),
  ]);
  const fonts: Fonts = { regular: [courier, korean], bold: [courierBold, koreanBold] };

  const title = doc?.titlePage ? parseTitlePage(doc.titlePage).get("title")?.join(" ") : undefined;
  if (title) pdf.setTitle(title.replace(/[*_]/g, ""));
  pdf.setCreator("DropKick");
  pdf.setProducer("DropKick (pdf-lib)");

  if (doc?.titlePage && doc.titlePage.trim()) drawTitlePage(pdf, fonts, doc.titlePage);

  const { pages } = paginate(doc?.lines ?? [], PAGE.linesPerPage, doc?.sceneStart ?? 1);
  const totalPages = pages.length;
  for (const p of doc ? pages : []) {
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

  drawExtras(pdf, { regular: korean, bold: koreanBold }, extras);

  if (options.watermark?.trim()) {
    for (const page of pdf.getPages()) drawWatermark(page, korean, options.watermark);
  }

  return pdf.save();
}
