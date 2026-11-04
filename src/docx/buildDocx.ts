/**
 * 원고를 할리우드 표준 Word(.docx) 문서로 만든다. (docx, MIT 라이선스)
 *
 * - US Letter 용지 규격, 상하 1인치, 좌 1.5인치, 우 1인치 여백
 * - 스타일별 들여쓰기(씬헤딩 볼드, 인물 2.2인치, 괄호 1.6인치, 대사 1.0인치, 전환 우측 정렬)
 * - 줄 간격 1.3배
 * - 표지(Title Page)가 있으면 첫 페이지 표지 생성 및 페이지 구분
 * - 메모([[...]])는 인쇄/출력에서 완전히 제외
 */
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  convertInchesToTwip,
  LineRuleType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  type FileChild,
} from "docx";
import type { ExtraBlock, ExtraSection } from "../export/extras";
import type { ScriptDocument } from "../fountain/fountain";
import { numberScenes, sceneHeadingText } from "../layout/sceneNumbers";
import { toUpperLatin } from "../layout/metrics";
import { isPrinted, previousPrinted } from "../layout/paginate";
import { actionIndent, alignOf, hasInline, leadingIndent, plainText, rowSpans, stripMarks, supportsInline, type Align } from "../layout/inline";

/** 글자 꾸밈(굵게·기울임·밑줄) 기호를 빼고 꾸밈을 입힌 TextRun 목록. 꾸밈이 없으면 한 덩어리 */
function styledRuns(text: string, align: Align = "left"): TextRun[] {
  const font = { name: FONT_PRIMARY, eastAsia: FONT_ASIAN };
  if (!hasInline(text)) return [new TextRun({ text, size: FONT_SIZE, font })];
  const spans = rowSpans(text, [plainText(text.replace(/\t/g, "    "), align).trimEnd()], align)[0];
  return spans.map(
    (sp) =>
      new TextRun({
        text: sp.text,
        size: FONT_SIZE,
        font,
        ...(sp.bold ? { bold: true } : {}),
        ...(sp.italic ? { italics: true } : {}),
        ...(sp.underline ? { underline: {} } : {}),
      }),
  );
}

const FONT_PRIMARY = "Courier Prime";
const FONT_ASIAN = "NanumGothicCoding";

// 12pt 글꼴 = 24 half-points
const FONT_SIZE = 24;
// 줄 간격 1.3배: 240 * 1.3 = 312
const LINE_SPACING = 312;

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

const EXTRA_SIZE = 21; // 10.5pt
const EXTRA_FONT = { name: FONT_PRIMARY, eastAsia: FONT_ASIAN };

/** 줄바꿈이 있는 글을 줄마다 TextRun으로 나눈다. */
function extraRuns(text: string, bold = false, size = EXTRA_SIZE): TextRun[] {
  return text.split("\n").map(
    (line, i) => new TextRun({ text: line, bold, size, font: EXTRA_FONT, break: i > 0 ? 1 : undefined }),
  );
}

function extraBlockToChildren(block: ExtraBlock): FileChild[] {
  switch (block.kind) {
    case "heading":
      return [
        new Paragraph({
          keepNext: true,
          spacing: { before: 280, after: 120 },
          children: extraRuns(block.text, true, block.level === 2 ? 26 : 23),
        }),
      ];
    case "paragraph":
      return [new Paragraph({ spacing: { after: 120, line: 340 }, children: extraRuns(block.text) })];
    case "bullet":
      return [
        new Paragraph({
          indent: { left: 360, hanging: 240 },
          spacing: { after: 60, line: 340 },
          children: [new TextRun({ text: "- ", size: EXTRA_SIZE, font: EXTRA_FONT }), ...extraRuns(block.text)],
        }),
      ];
    case "table": {
      const cell = (text: string, width: number, header: boolean) =>
        new TableCell({
          width: { size: width, type: WidthType.PERCENTAGE },
          margins: { top: 60, bottom: 60, left: 100, right: 100 },
          shading: header ? { fill: "EEEEEE" } : undefined,
          children: [new Paragraph({ children: extraRuns(text, header) })],
        });
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              cantSplit: true,
              children: block.header.map((h, i) => cell(h, block.widths[i], true)),
            }),
            ...block.rows.map(
              (row) => new TableRow({ children: row.map((c, i) => cell(c, block.widths[i], false)) }),
            ),
          ],
        }),
        new Paragraph({ text: "" }),
      ];
    }
  }
}

/**
 * doc가 null이면 원고 없이 부록(extras)만 담는다.
 * extras는 원고 뒤에 문서마다 새 페이지에서 이어 붙는다.
 */
export async function buildDocx(docOrNull: ScriptDocument | null, extras: ExtraSection[] = []): Promise<Uint8Array> {
  const doc: ScriptDocument = docOrNull ?? { titlePage: null, lines: [] };
  const paragraphs: FileChild[] = [];

  // ---------- 1. 표지 (Title Page) ----------
  if (doc.titlePage && doc.titlePage.trim()) {
    const fields = parseTitlePage(doc.titlePage);
    const title = fields.get("title")?.join(" ") || "";
    const credit = fields.get("credit")?.join(" ") || "";
    const author = fields.get("author")?.join(", ") || fields.get("authors")?.join(", ") || "";
    const source = fields.get("source")?.join(" ") || "";
    const draftDate = fields.get("draft date")?.join(" ") || "";
    const contact = fields.get("contact") || [];

    // 위쪽 여백 (약 2.5인치)
    for (let i = 0; i < 7; i++) {
      paragraphs.push(new Paragraph({ text: "" }));
    }

    // 제목 (볼드, 대문자)
    if (title) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          // 제목은 글자가 커서 줄 높이를 그만큼 늘린다 (17pt × 1.3, 글자 윗부분이 잘리지 않게)
          spacing: { after: 240, line: Math.round(((FONT_SIZE + 10) / 2) * 1.3 * 20), lineRule: LineRuleType.EXACT },
          children: [
            new TextRun({
              text: toUpperLatin(stripMarks(title)),
              bold: true,
              size: FONT_SIZE + 4 + 6,
              font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
            }),
          ],
        }),
      );
    }

    // 크레딧
    if (credit) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
          children: [
            new TextRun({
              text: credit,
              size: FONT_SIZE,
              font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
            }),
          ],
        }),
      );
    }

    // 원작
    if (source) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          // 작가와의 사이는 한 줄(LINE_SPACING) 더 띄운다
          spacing: { after: 120 + LINE_SPACING, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
          children: [
            new TextRun({
              text: source,
              size: FONT_SIZE,
              font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
            }),
          ],
        }),
      );
    }

    // 작가
    if (author) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
          children: [
            new TextRun({
              text: author,
              size: FONT_SIZE,
              font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
            }),
          ],
        }),
      );
    }

    // 아래쪽 여백 (중간 공간 채우기)
    for (let i = 0; i < 8; i++) {
      paragraphs.push(new Paragraph({ text: "" }));
    }

    // 작성일 및 연락처 (우측 정렬)
    if (draftDate) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 120, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
          children: [
            new TextRun({
              text: draftDate,
              size: FONT_SIZE - 2,
              font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
            }),
          ],
        }),
      );
    }

    for (const c of contact) {
      paragraphs.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { after: 60, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
          children: [
            new TextRun({
              text: c,
              size: FONT_SIZE - 2,
              font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
            }),
          ],
        }),
      );
    }

    // 표지 후 페이지 나눔
    paragraphs.push(
      new Paragraph({
        pageBreakBefore: true,
        text: "",
      }),
    );
  }

  // ---------- 2. 시나리오 본문 ----------
  const scenes = numberScenes(
    doc.lines.map((l) => l.style),
    (n) => doc.lines[n - 1].text,
    doc.sceneStart ?? 1,
  );

  for (let i = 0; i < doc.lines.length; i++) {
    const line = doc.lines[i];
    // 막·장·씬 요약은 설정에서 넣기로 했을 때만 인쇄한다. 앞 줄을 볼 때도 인쇄되지 않는 줄은 건너뛴다.
    if (!isPrinted(line.style, doc.printOutline)) continue;
    // 꾸밈을 쓰지 않는 줄에 남은 꾸밈 기호(*, _)는 뺀다.
    const text = supportsInline(line.style) ? line.text : stripMarks(line.text);
    const prevLine = previousPrinted(doc.lines, i, doc.printOutline);
    const isContinuedAction = (line.style === "action" || line.style === "synopsis") && prevLine?.style === line.style;

    // 스타일별 설정
    switch (line.style) {
      case "scene": {
        const sceneNum = scenes.get(i + 1);
        const headingText = sceneHeadingText(text, sceneNum);
        paragraphs.push(
          new Paragraph({
            spacing: { before: 240, after: 0, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
            children: [
              new TextRun({
                text: toUpperLatin(headingText),
                bold: true,
                size: FONT_SIZE,
                font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
              }),
            ],
          }),
        );
        break;
      }

      case "subheader": {
        paragraphs.push(
          new Paragraph({
            spacing: { before: 240, after: 0, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
            children: [
              new TextRun({
                text: toUpperLatin(text),
                bold: true,
                size: FONT_SIZE,
                font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
              }),
            ],
          }),
        );
        break;
      }

      case "act":
      case "chapter": {
        paragraphs.push(
          new Paragraph({
            spacing: { before: line.style === "act" ? 480 : 240, after: 0, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
            keepNext: true,
            children: [
              new TextRun({
                text,
                bold: true,
                size: FONT_SIZE,
                font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
              }),
            ],
          }),
        );
        break;
      }

      case "synopsis": {
        paragraphs.push(
          new Paragraph({
            spacing: { before: isContinuedAction ? 0 : 240, after: 0, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
            children: [
              new TextRun({
                text,
                color: "666666",
                size: FONT_SIZE,
                font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
              }),
            ],
          }),
        );
        break;
      }

      case "action": {
        const align = alignOf(text);
        const indentCols = actionIndent(text);
        const body = indentCols > 0 ? leadingIndent(text).rest : text;
        paragraphs.push(
          new Paragraph({
            ...(align === "center" ? { alignment: AlignmentType.CENTER } : align === "right" ? { alignment: AlignmentType.RIGHT } : {}),
            ...(indentCols > 0 ? { indent: { left: convertInchesToTwip(indentCols * 0.1) } } : {}),
            spacing: {
              before: isContinuedAction ? 0 : 240,
              after: 0,
              line: LINE_SPACING,
              lineRule: LineRuleType.EXACT,
            },
            children: styledRuns(body, align),
          }),
        );
        break;
      }

      case "character": {
        paragraphs.push(
          new Paragraph({
            indent: { left: convertInchesToTwip(2.2) },
            spacing: { before: 240, after: 0, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
            children: [
              new TextRun({
                text: toUpperLatin(text),
                size: FONT_SIZE,
                font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
              }),
            ],
          }),
        );
        break;
      }

      case "parenthetical": {
        paragraphs.push(
          new Paragraph({
            indent: {
              left: convertInchesToTwip(1.6),
              right: convertInchesToTwip(2.0),
            },
            spacing: { before: 0, after: 0, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
            children: styledRuns(text.startsWith("(") ? text : `(${text})`),
          }),
        );
        break;
      }

      case "dialogue": {
        paragraphs.push(
          new Paragraph({
            indent: {
              left: convertInchesToTwip(1.0),
              right: convertInchesToTwip(1.5),
            },
            spacing: { before: 0, after: 0, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
            children: styledRuns(text),
          }),
        );
        break;
      }

      case "transition": {
        paragraphs.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { before: 240, after: 0, line: LINE_SPACING, lineRule: LineRuleType.EXACT },
            children: [
              new TextRun({
                text: toUpperLatin(text),
                size: FONT_SIZE,
                font: { name: FONT_PRIMARY, eastAsia: FONT_ASIAN },
              }),
            ],
          }),
        );
        break;
      }
    }
  }

  // ---------- 3. 부록 (다른 문서) ----------
  for (const section of extras) {
    paragraphs.push(
      new Paragraph({
        pageBreakBefore: true,
        spacing: { after: 200 },
        children: extraRuns(section.title, true, 36),
      }),
    );
    for (const block of section.blocks) paragraphs.push(...extraBlockToChildren(block));
  }

  // US Letter: 폭 8.5인치, 높이 11인치
  // 여백: 상 1인치, 하 1인치, 좌 1.5인치, 우 1인치
  const wordDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: convertInchesToTwip(8.5),
              height: convertInchesToTwip(11),
            },
            margin: {
              top: convertInchesToTwip(1.0),
              bottom: convertInchesToTwip(1.0),
              left: convertInchesToTwip(1.5),
              right: convertInchesToTwip(1.0),
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toArrayBuffer(wordDoc);
  return new Uint8Array(buffer);
}
