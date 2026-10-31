/**
 * 원고 말고 함께 내보낼 문서(인물 설정, 메모, 3막 구조 등)를
 * PDF·Word가 똑같이 그릴 수 있는 '조각(블록)'으로 바꾼다. 화면과 파일 형식에 상관없는 순수 함수.
 */
import type { DocType } from "../project/model";
import { ACT_META, parseStructureBoard } from "../structure/structureModel";

export type ExtraBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string }
  /** widths는 열 너비 비율(합 100) */
  | { kind: "table"; header: string[]; widths: number[]; rows: string[][] };

export type ExtraSection = { title: string; blocks: ExtraBlock[] };

/** 글자 꾸밈 기호(**굵게**, `코드`, [링크](주소))를 걷어 낸다. */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\t/g, "    ")
    .trimEnd();
}

/** 일반 문서(Markdown)를 제목·목록·문단으로 나눈다. */
export function markdownToBlocks(markdown: string): ExtraBlock[] {
  const blocks: ExtraBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
    paragraph = [];
  };
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (line.trim() === "") {
      flush();
    } else if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length <= 1 ? 2 : 3, text: plain(heading[2]) });
    } else if (bullet) {
      flush();
      blocks.push({ kind: "bullet", text: plain(bullet[1]) });
    } else {
      paragraph.push(plain(line));
    }
  }
  flush();
  return blocks;
}

/** 3막 구조 보드를 막마다 '단계 / 요약' 표로 만든다. (카드에 등록한 씬은 담지 않는다) */
export function structureToBlocks(text: string): ExtraBlock[] {
  const board = parseStructureBoard(text);
  const blocks: ExtraBlock[] = [];
  let number = 0;
  for (const act of [1, 2, 3] as const) {
    const beats = board.beats.filter((b) => b.act === act);
    const rows = beats.map((beat) => {
      number += 1;
      return [String(number), beat.title, plain(beat.synopsis)];
    });
    blocks.push({ kind: "heading", level: 2, text: ACT_META[act].title });
    if (rows.length === 0) {
      blocks.push({ kind: "paragraph", text: "(단계 없음)" });
    } else {
      blocks.push({ kind: "table", header: ["#", "단계", "요약"], widths: [7, 28, 65], rows });
    }
  }
  return blocks;
}

export function buildExtraSection(
  type: DocType,
  name: string,
  text: string,
): ExtraSection {
  const blocks = type === "structure" ? structureToBlocks(text) : markdownToBlocks(text);
  // 첫 줄 제목이 문서 이름과 같으면 같은 제목이 두 번 나오지 않게 뺀다.
  const first = blocks[0];
  if (first?.kind === "heading" && first.text === name) blocks.shift();
  return { title: name, blocks };
}
