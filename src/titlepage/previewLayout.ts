/**
 * 스크립트 설정 창의 미니 페이지(미리보기)를 위한 배치 계산.
 * PDF 표지(src/pdf/buildPdf.ts의 drawTitlePage)와 워터마크(drawWatermark)가 놓는 자리를 그대로 따른다.
 */
import type { ScriptLine } from "../editor/lineStyles";
import { stripMarks } from "../layout/inline";
import { PAGE, paginate, type OutlinePrint } from "../layout/paginate";
import { COVER_TITLE_SCALE, WATERMARK } from "../project/scriptSettings";
import type { CoverField, TitlePageFields } from "./titlePage";

/** 미리보기 그림 한 장의 크기 (pt). PDF 한 쪽과 같다 */
export const PREVIEW_WIDTH = PAGE.widthIn * 72;
export const PREVIEW_HEIGHT = PAGE.heightIn * 72;

export type PreviewLine = {
  text: string;
  /** 본문 맨 위에서 몇 번째 줄인가 */
  row: number;
  /** 왼쪽 여백에서 몇 칸 떨어져 시작하는가. center이면 가운데 기준 */
  column: number;
  align: "start" | "center" | "end";
  bold: boolean;
  /** 글자 크기 배율 (본문 크기 = 1) */
  scale?: number;
  /** 회색 글씨 (씬 요약) */
  gray?: boolean;
};

const linesOf = (value: string) =>
  value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * 켠 항목만 표지에 놓는다. 제목은 쪽 위에서 1/3 지점에 3pt 키운 굵은 글씨로, 크레딧·원작·작가는
 * 그 아래 가운데(원작이 제목과 작가 사이), 날짜/고와 연락처는 쪽 맨 아래 오른쪽(오른쪽 정렬).
 * 내용이 없는 항목은 자리를 차지하지 않는다.
 */
export function coverLines(fields: TitlePageFields, off: ReadonlySet<CoverField>): PreviewLine[] {
  const get = (key: CoverField) => (off.has(key) ? [] : linesOf(fields[key]));
  const out: PreviewLine[] = [];
  const center = PAGE.bodyColumns / 2;

  let row = Math.round(PAGE.linesPerPage / 3);
  for (const text of get("title")) out.push({ text: stripMarks(text), row: row++, column: center, align: "center", bold: true, scale: COVER_TITLE_SCALE });
  row += 1; // 제목 아래는 한 줄만 띄운다
  for (const key of ["credit", "source", "author"] as const) {
    const lines = get(key);
    for (const text of lines) out.push({ text, row: row++, column: center, align: "center", bold: false });
    if (lines.length > 0) row += key === "source" ? 2 : 1; // 부제·원작과 작가 사이는 한 줄 더 띄운다
  }

  const bottom = [...get("draftDate"), ...get("contact")];
  bottom.forEach((text, i) => out.push({ text, row: PAGE.linesPerPage - bottom.length + i, column: PAGE.bodyColumns, align: "end", bold: false }));
  return out;
}

/**
 * 본문 예시 쪽: 막·장·씬헤딩·요약·액션·인물·괄호지문·대사를 한 번씩 보여 준다.
 * 실제 내보내기와 같은 쪽 계산(paginate)으로 놓아서, 막·장·요약을 넣기로 하면 그 줄이 들어간 모양이 그대로 보인다.
 */
const SAMPLE_SCRIPT: ScriptLine[] = [
  { style: "act", text: "1막: 코끼리 우리" },
  { style: "chapter", text: "시퀀스 A: 조련사의 하루" },
  { style: "scene", text: "실내. 사무실 - 낮" },
  { style: "synopsis", text: "해 질 녘, 둘만 남은 사무실의 대화." },
  { style: "action", text: "해가 기울고, 사무실에 둘만 남았다." },
  { style: "action", text: "민재가 서류를 덮는다." },
  { style: "character", text: "민재" },
  { style: "parenthetical", text: "(작게)" },
  { style: "dialogue", text: "오늘은 여기까지 하자." },
  { style: "character", text: "수아" },
  { style: "dialogue", text: "벌써요? 아직 할 게 남았는데." },
  { style: "action", text: "민재가 대답 없이 불을 끈다." },
  { style: "character", text: "민재" },
  { style: "dialogue", text: "내일 하면 돼." },
];

export function sampleBody(print: OutlinePrint = {}): PreviewLine[] {
  const page = paginate(SAMPLE_SCRIPT, PAGE.linesPerPage, 1, print).pages[0];
  return page.lines.map((l) => ({
    text: l.sceneNumber != null ? `${l.sceneNumber} ${l.text}` : l.text,
    row: l.row,
    column: l.column,
    align: "start",
    bold: l.bold,
    gray: l.style === "synopsis",
  }));
}

/** 글꼴에 따라 달라지는 글자 폭을 어림한다: 한글은 한 칸 전체, 그 밖은 절반 */
function estimateWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) w += (ch.codePointAt(0) ?? 0) > 0x2e7f ? size : size * 0.5;
  return w;
}

export type WatermarkMark = { x: number; y: number; size: number };

/**
 * 워터마크가 찍힐 자리들 (그림 위쪽이 y=0). PDF의 drawWatermark와 같은 격자·크기 규칙.
 * 반환하는 x, y는 글자 가운데 점이다.
 */
export function watermarkMarks(rawText: string): { marks: WatermarkMark[]; text: string } {
  const text = rawText.replace(/\s+/g, " ").trim();
  if (!text) return { marks: [], text };
  const natural = estimateWidth(text, WATERMARK.size);
  const size = natural > WATERMARK.maxWidth ? Math.max(8, (WATERMARK.size * WATERMARK.maxWidth) / natural) : WATERMARK.size;
  const w = estimateWidth(text, size);
  const rad = (WATERMARK.angle * Math.PI) / 180;
  const stepX = w + 70;
  const stepY = Math.max(110, w * Math.sin(rad) + size * 4);
  const marks: WatermarkMark[] = [];
  for (let row = 0, cy = -stepY; cy < PREVIEW_HEIGHT + stepY; cy += stepY, row++) {
    for (let cx = -stepX + (row % 2 ? stepX / 2 : 0); cx < PREVIEW_WIDTH + stepX; cx += stepX) {
      marks.push({ x: cx, y: PREVIEW_HEIGHT - cy, size });
    }
  }
  return { marks, text };
}
