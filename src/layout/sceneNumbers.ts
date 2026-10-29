import type { LineStyle } from "../editor/styles";

export type SceneNumber = { line: number; number: number; manual: boolean };

// 씬헤딩을 "S#12. 내부..." 또는 "#12. 내부..."처럼 직접 번호를 써서 시작한 경우
export const MANUAL_SCENE_NUMBER = /^\s*(?:S\s*#|#)\s*(\d+)/i;

/**
 * 씬헤딩마다 번호를 매긴다. 앞 씬 번호 + 1이 기본이고,
 * 직접 "#10." 또는 "S#10."처럼 번호를 쓴 씬이 있으면 그 번호부터 이어서 센다.
 * 결과는 줄 번호(1부터) → 씬 번호.
 */
export function numberScenes(
  styles: readonly LineStyle[],
  textAt: (lineNumber: number) => string,
): Map<number, SceneNumber> {
  const result = new Map<number, SceneNumber>();
  let previous = 0;
  for (let n = 1; n <= styles.length; n++) {
    if (styles[n - 1] !== "scene") continue;
    const match = MANUAL_SCENE_NUMBER.exec(textAt(n));
    const number = match ? Number(match[1]) : previous + 1;
    result.set(n, { line: n, number, manual: Boolean(match) });
    previous = number;
  }
  return result;
}

/**
 * 씬리스트, 3막 구조, 통계 등 목록 표시에 쓰는 씬헤딩 글자.
 * 요청에 따라 'S#1.' 대신 '#1.' 형태로 표기한다.
 */
export function sceneHeadingText(text: string, scene: SceneNumber | undefined): string {
  if (!scene) return text;
  const clean = text.replace(/^(?:S\s*#|#)\s*\d+\.?\s*/i, "").trim();
  return `#${scene.number}. ${clean}`;
}
