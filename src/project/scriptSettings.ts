/**
 * 스크립트 설정: 스크립트마다 따로 가지는 설정 (project.json의 scriptSettings)
 *  - coverOff: 표지에서 끈 항목 (내용은 그대로 두고 내보낼 때만 뺀다. 모두 끄면 표지가 없다)
 *  - sceneStart: 첫 씬의 번호 (기본 1)
 *  - watermark: PDF 모든 쪽에 흐리게 반복해서 찍을 글
 */
import { COVER_FIELDS, type CoverField } from "../titlepage/titlePage";

export type ScriptSettings = {
  coverOff?: CoverField[];
  sceneStart?: number;
  watermark?: string;
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
    });
    if (settings) result[id] = settings;
  }
  return result;
}
