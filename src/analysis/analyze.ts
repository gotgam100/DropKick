/**
 * 원고 분석: 씬 목록, 인물별 대사량, 씬 길이, 예상 러닝타임.
 * 스타일 정보(씬헤딩/인물/대사 줄)를 그대로 쓰므로 글자 모양을 추측하지 않는다.
 * 2차 단계 AI 분석도 이 결과를 바탕으로 한다.
 */
import type { ScriptLine } from "../editor/lineStyles";
import { characterName } from "../editor/styles";
import { toUpperLatin } from "../layout/metrics";
import { STANDARD_LINES_PER_PAGE, paginate, type Pagination } from "../layout/paginate";
import { numberScenes, sceneHeadingText } from "../layout/sceneNumbers";

export type SceneSummary = {
  /** 씬헤딩이 있는 원고 줄 번호 (1부터). 씬헤딩 앞 내용은 0번 씬(line 0) */
  line: number;
  number: number;
  heading: string;
  /** 씬이 시작하는 페이지 */
  page: number;
  /** 씬 길이 (1/8페이지 단위, 최소 1) */
  eighths: number;
  /** 등장 인물 (대사 순서대로) */
  characters: string[];
  speeches: number;
  /** 씬 안의 글 전체 (찾기용, 씬헤딩 다음 줄부터 다음 씬헤딩 전까지) */
  text: string;
};

export type CharacterSummary = {
  name: string;
  /** 대사 횟수 (인물 이름 줄 수) */
  speeches: number;
  /** 대사 글자 수 (공백 제외) */
  dialogueChars: number;
  /** 등장한 씬 수 */
  scenes: number;
  /** 처음 등장한 씬 번호 */
  firstScene: number;
};

export type ScriptAnalysis = {
  pages: number;
  scenes: SceneSummary[];
  characters: CharacterSummary[];
  /** 할리우드 표준 형식(1페이지 ≈ 1분)으로 계산한 예상 러닝타임 (분) */
  runtimeMinutes: number;
  dialogueChars: number;
  actionChars: number;
};

const countChars = (text: string) => text.replace(/\s/g, "").length;

/** 인물 이름을 묶을 때 쓰는 키: 괄호 확장((V.O.) 등)을 떼고, 영문은 대문자로 */
export function characterKey(text: string): string {
  return toUpperLatin(characterName(text));
}

/** "1 3/8"처럼 1/8 페이지 단위를 읽기 쉽게 */
export function formatEighths(eighths: number): string {
  const whole = Math.floor(eighths / 8);
  const rest = eighths % 8;
  if (whole === 0) return `${rest}/8`;
  return rest === 0 ? `${whole}` : `${whole} ${rest}/8`;
}

export function analyzeScript(
  lines: ScriptLine[],
  pagination: Pagination = paginate(lines),
  /** 첫 씬의 번호 (스크립트 설정) */
  sceneStart = 1,
): ScriptAnalysis {
  const { pages } = pagination;
  const linesPerPage = Math.max(1, ...pages.flatMap((p) => p.lines.map((l) => l.row + 1)));

  // 원고 줄마다 (페이지, 줄 위치)
  const position = new Map<number, { page: number; row: number }>();
  for (const page of pages) {
    for (const l of page.lines) {
      if (l.source > 0 && !position.has(l.source)) position.set(l.source, { page: page.number, row: l.row });
    }
  }
  const absoluteRow = (line: number) => {
    const p = position.get(line);
    return p ? (p.page - 1) * linesPerPage + p.row : 0;
  };
  const totalRows = (pages.length - 1) * linesPerPage + pagination.lastPageRows;

  const sceneNumbers = numberScenes(
    lines.map((l) => l.style),
    (n) => lines[n - 1].text,
    sceneStart,
  );
  const sceneLines = [...sceneNumbers.keys()];

  const scenes: SceneSummary[] = sceneLines.map((line, i) => {
    const nextLine = i + 1 < sceneLines.length ? sceneLines[i + 1] : lines.length + 1;
    const text = lines
      .slice(line, nextLine - 1)
      .map((l) => l.text)
      .join("\n");
    const start = absoluteRow(line);
    const end = i + 1 < sceneLines.length ? absoluteRow(sceneLines[i + 1]) : totalRows;
    const rows = Math.max(1, end - start);
    return {
      line,
      number: sceneNumbers.get(line)!.number,
      heading: sceneHeadingText(lines[line - 1].text, sceneNumbers.get(line)).trim() || "(장소 없음)",
      page: position.get(line)?.page ?? 1,
      eighths: Math.max(1, Math.ceil((rows / linesPerPage) * 8)),
      characters: [],
      speeches: 0,
      text,
    };
  });

  const characters = new Map<string, CharacterSummary & { sceneSet: Set<number> }>();
  let dialogueChars = 0;
  let actionChars = 0;
  let sceneIndex = -1;
  let speaker: (CharacterSummary & { sceneSet: Set<number> }) | null = null;

  lines.forEach((line, i) => {
    const n = i + 1;
    if (line.style === "scene") {
      sceneIndex = sceneLines.indexOf(n);
      speaker = null;
      return;
    }
    if (line.style === "character") {
      const key = characterKey(line.text);
      if (!key) {
        speaker = null;
        return;
      }
      let entry = characters.get(key);
      if (!entry) {
        entry = {
          name: key,
          speeches: 0,
          dialogueChars: 0,
          scenes: 0,
          firstScene: scenes[sceneIndex]?.number ?? 0,
          sceneSet: new Set(),
        };
        characters.set(key, entry);
      }
      entry.speeches++;
      entry.sceneSet.add(sceneIndex);
      speaker = entry;
      const scene = scenes[sceneIndex];
      if (scene) {
        scene.speeches++;
        if (!scene.characters.includes(key)) scene.characters.push(key);
      }
      return;
    }
    if (line.style === "dialogue") {
      const chars = countChars(line.text);
      dialogueChars += chars;
      if (speaker) speaker.dialogueChars += chars;
      return;
    }
    if (line.style === "parenthetical") return;
    speaker = null;
    if (line.style === "action") actionChars += countChars(line.text);
  });

  const characterList = [...characters.values()]
    .map(({ sceneSet, ...rest }) => ({ ...rest, scenes: sceneSet.size }))
    .sort((a, b) => b.dialogueChars - a.dialogueChars || b.speeches - a.speeches);

  const standard = paginate(lines, STANDARD_LINES_PER_PAGE);
  const runtimeMinutes = Math.max(
    0,
    Math.round(standard.pages.length - 1 + standard.lastPageRows / STANDARD_LINES_PER_PAGE),
  );

  return {
    pages: pages.length,
    scenes,
    characters: characterList,
    runtimeMinutes,
    dialogueChars,
    actionChars,
  };
}

/** 커서가 있는 줄이 속한 씬 (씬헤딩 앞이면 null) */
export function sceneAtLine(scenes: SceneSummary[], line: number): SceneSummary | null {
  let found: SceneSummary | null = null;
  for (const scene of scenes) {
    if (scene.line > line) break;
    found = scene;
  }
  return found;
}
