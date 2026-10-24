import type { LineStyle } from "../editor/styles";

export type SceneNumber = { line: number; number: number; manual: boolean };

// 씬헤딩을 "S#12. 내부..."처럼 직접 번호를 써서 시작한 경우
export const MANUAL_SCENE_NUMBER = /^\s*S\s*#\s*(\d+)/i;

/**
 * 씬헤딩마다 번호를 매긴다. 앞 씬 번호 + 1이 기본이고,
 * 직접 "S#10." 처럼 번호를 쓴 씬이 있으면 그 번호부터 이어서 센다.
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

/** 화면과 PDF에 보이는 씬헤딩 글자 (자동 번호면 앞에 S#n. 를 붙인다) */
export function sceneHeadingText(text: string, scene: SceneNumber | undefined): string {
  if (!scene || scene.manual) return text;
  return `S#${scene.number}. ${text}`;
}
