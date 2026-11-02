/**
 * 스크립트마다 마지막으로 보던 자리 (project.json의 viewPositions). 키는 스크립트 id.
 *  - caret: 커서가 있던 글 위치(글자 수)
 *  - top: 화면 맨 위에 보이던 줄의 시작 위치
 * 다시 열면 그 자리로 돌아간다. 글이 밖에서 바뀌어 위치가 글 길이를 넘으면 끝으로 맞춘다.
 */
export type ViewPosition = { caret: number; top: number };

const isOffset = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

/** 저장 파일에서 읽은 값을 믿지 않고 검사한다. 있는 스크립트(validIds)의 것만 남긴다. */
export function parseViewPositions(value: unknown, validIds: ReadonlySet<string>): Record<string, ViewPosition> {
  const result: Record<string, ViewPosition> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!validIds.has(id) || !raw || typeof raw !== "object") continue;
    const { caret, top } = raw as Record<string, unknown>;
    if (isOffset(caret) && isOffset(top)) result[id] = { caret, top };
  }
  return result;
}

/** 글 길이를 넘지 않게 맞춘다 */
export function clampPosition(position: ViewPosition, length: number): ViewPosition {
  return { caret: Math.min(position.caret, length), top: Math.min(position.top, length) };
}

export function samePosition(a: ViewPosition | null | undefined, b: ViewPosition | null | undefined): boolean {
  return !!a && !!b && a.caret === b.caret && a.top === b.top;
}
