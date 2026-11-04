/**
 * 스크립트 설정: 스크립트마다 따로 가지는 설정 (project.json의 scriptSettings)
 *  - coverOff: 표지에서 끈 항목 (내용은 그대로 두고 내보낼 때만 뺀다. 모두 끄면 표지가 없다)
 *  - sceneStart: 첫 씬의 번호 (기본 1)
 *  - watermark: PDF 모든 쪽에 흐리게 반복해서 찍을 글
 *  - printSections / printSynopsis: PDF·Word로 내보낼 때 막·장 제목, 씬 요약을 원고에 넣을지 (기본은 뺀다)
 */
import { COVER_FIELDS, type CoverField } from "../titlepage/titlePage";

export type ScriptSettings = {
  coverOff?: CoverField[];
  sceneStart?: number;
  watermark?: string;
  printSections?: boolean;
  printSynopsis?: boolean;
};

/** 씬 번호로 쓸 수 있는 가장 큰 수 */
export const MAX_SCENE_START = 9999;

/** 첫 씬 번호 (설정이 없거나 잘못되면 1) */
export function sceneStartOf(settings: ScriptSettings | undefined): number {
  const n = settings?.sceneStart;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_SCENE_START ? n : 1;
}

/** 기본값과 같은 항목은 빼서 저장할 값만 남긴다. 아무것도 안 남으면 undefined */
export function compactSettings(settings: ScriptSettings): ScriptSettings | undefined {
  const out: ScriptSettings = {};
  const off = COVER_FIELDS.filter((f) => settings.coverOff?.includes(f));
  if (off.length > 0) out.coverOff = off;
  const start = sceneStartOf(settings);
  if (start !== 1) out.sceneStart = start;
  const watermark = (settings.watermark ?? "").trim();
  if (watermark) out.watermark = watermark;
  if (settings.printSections === true) out.printSections = true;
  if (settings.printSynopsis === true) out.printSynopsis = true;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 저장 파일에서 읽은 값을 믿지 않고 검사한다. 있는 스크립트(validIds)의 설정만 남긴다. */
export function parseScriptSettings(value: unknown, validIds: ReadonlySet<string>): Record<string, ScriptSettings> {
  const result: Record<string, ScriptSettings> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!validIds.has(id) || !raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const settings = compactSettings({
      coverOff: Array.isArray(r.coverOff)
        ? r.coverOff.filter((f): f is CoverField => COVER_FIELDS.includes(f as CoverField))
        : undefined,
      sceneStart: typeof r.sceneStart === "number" ? r.sceneStart : undefined,
      watermark: typeof r.watermark === "string" ? r.watermark : undefined,
      printSections: r.printSections === true ? true : undefined,
      printSynopsis: r.printSynopsis === true ? true : undefined,
    });
    if (settings) result[id] = settings;
  }
  return result;
}

/** PDF 워터마크 모양: 불투명도, 기울기(도), 글자 크기와 한 줄 최대 폭(pt). 설정 창 미리보기도 이 값을 쓴다 */
export const WATERMARK = { opacity: 0.1, angle: 35, size: 22, maxWidth: 360 };

/** 표지 제목 글자 크기: 본문(12pt)보다 3pt 크다. PDF 표지와 설정 창 미리보기가 함께 쓴다 */
export const COVER_TITLE_SCALE = 15 / 12;
