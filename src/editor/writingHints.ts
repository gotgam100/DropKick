/**
 * 쓰는 동안 보이는 작은 도움말 (설정 → 화면의 "쓰기 도움말"로 끈다).
 * - 상태 막대: 지금 요소와 ⏎·Tab을 누르면 될 요소
 * - 처음 한 번만 알림: 요소(막·시퀀스·씬 요약 포함)를 처음 쓸 때 원고 오른쪽 위에 한 번
 */
import { cycleStyle, nextStyleOnEnter, styleLabel, type DocStyle, type LineStyle } from "./styles";

/** 상태 막대에 보여 줄 다음 요소: 줄 끝에서 ⏎, Tab */
export function nextStylesFor(style: DocStyle): { enter: LineStyle; tab: LineStyle } {
  return { enter: nextStyleOnEnter(style), tab: cycleStyle(style, 1) };
}

/** 요소마다 처음 한 번 보여 줄 설명 */
const TIP_TEXT: Record<DocStyle, string> = {
  scene: "장면이 일어나는 곳과 때를 적어요. 씬 번호는 자동으로 붙어요.",
  action: "눈에 보이는 행동과 장면을 적어요.",
  character: "말하는 사람의 이름을 적어요. 한 번 쓴 이름은 자동 완성돼요.",
  dialogue: "인물이 하는 말을 적어요.",
  parenthetical: "말투·감정·작은 행동을 적어요. 괄호는 자동으로 붙어요.",
  subheader: "같은 씬 안에서 작은 장소나 상황이 바뀔 때 써요.",
  transition: "다음 씬으로 넘어가는 방식을 적어요. 오른쪽에 붙어요.",
  act: "이야기를 크게 나누는 줄이에요. 인쇄되지 않고, 사이드바 씬 목록을 막으로 묶어 줘요.",
  chapter: "막 안에서 씬을 한 번 더 묶는 줄이에요. 인쇄되지 않아요.",
  synopsis: "이 씬에서 일어날 일을 적어 두는 줄이에요. 인쇄되지 않고, 사이드바 씬 목록에 함께 보여요.",
};

/** 짧은 예시가 있는 요소 */
const TIP_EXAMPLE: Partial<Record<DocStyle, string>> = {
  scene: "실내. 미숙의 집 - 오전",
  transition: "CUT TO:, FADE IN:",
};

export type Tip = { title: string; text: string; example?: string; enter: string; tab: string };

/** 알림 내용: 요소 이름, 설명, 줄 끝에서 ⏎·Tab을 누르면 될 요소 (설정의 Enter 규칙을 따른다) */
export function tipFor(style: DocStyle): Tip {
  const next = nextStylesFor(style);
  return {
    title: styleLabel(style),
    text: TIP_TEXT[style],
    ...(TIP_EXAMPLE[style] ? { example: TIP_EXAMPLE[style] } : {}),
    enter: styleLabel(next.enter),
    tab: styleLabel(next.tab),
  };
}

const SEEN_KEY = "dropkick.tips.seen.v1";

export function seenTips(): Set<string> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(SEEN_KEY) : null;
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((v) => typeof v === "string") : []);
  } catch {
    return new Set();
  }
}

export function markTipSeen(id: string): void {
  try {
    const seen = seenTips();
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // 기억하지 못해도 다음에 한 번 더 보일 뿐이다.
  }
}

/** 설정의 "처음 알림 다시 보기" */
export function resetTips(): void {
  try {
    localStorage.removeItem(SEEN_KEY);
  } catch {
    // 무시
  }
}

/** 이 요소의 알림을 아직 안 봤으면 알림 내용을 돌려준다. */
export function pendingTip(style: DocStyle, seen: Set<string>): Tip | null {
  if (seen.has(style)) return null;
  return tipFor(style);
}
