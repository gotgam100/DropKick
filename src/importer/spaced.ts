/**
 * 공백(스페이스)으로 들여쓰기한 원고를 위치로 바꾼다.
 * 맨 앞 공백의 폭은 들여쓰기가 되고, 글 가운데 넓게 벌어진 공백은 덩어리를 나눈다.
 * (예: "          민재" → 인물 위치, "민재          안녕하세요." → 이름과 대사)
 */
const SPACE_PT = 4;
const WIDE_SPACE_PT = 11;
/** 이 폭(pt) 이상 벌어진 공백은 다른 덩어리로 본다 */
const GAP_PT = 12;

const SPACE = /^[  　]+$/;

function spaceWidth(run: string): number {
  let width = 0;
  for (const ch of run) width += ch === "　" ? WIDE_SPACE_PT : SPACE_PT;
  return width;
}

/** 글이 차지하는 폭 (대략). 한글·한자는 넓고 영문·숫자는 절반쯤 */
function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += (ch.codePointAt(0) ?? 0) > 0x2e7f ? 10 : 5;
  return width;
}

/** 한 줄 글을 (위치, 글) 덩어리들로 나눈다. 글이 없으면 빈 배열 */
export function splitSpaced(raw: string, x: number): { x: number; text: string }[] {
  const out: { x: number; text: string }[] = [];
  let pos = x;
  let current = "";
  let currentX = x;
  const flush = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) out.push({ x: currentX, text });
    pos = currentX + textWidth(current);
    current = "";
  };
  for (const part of raw.split(/([  　]+)/)) {
    if (part === "") continue;
    if (!SPACE.test(part)) {
      if (!current) currentX = pos;
      current += part;
      continue;
    }
    const width = spaceWidth(part);
    if (!current) pos += width; // 맨 앞 공백: 들여쓰기
    else if (width >= GAP_PT) {
      flush();
      pos += width; // 넓게 벌어진 공백: 다음 덩어리는 그만큼 오른쪽에서 시작
    } else current += " ";
  }
  flush();
  return out;
}
