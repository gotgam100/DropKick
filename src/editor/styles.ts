// 시나리오 문장 스타일 정의. 줄(문단)마다 이 중 하나가 지정된다.

export const LINE_STYLES = [
  "scene",
  "action",
  "character",
  "dialogue",
  "parenthetical",
  "subheader",
  "transition",
] as const;

export type LineStyle = (typeof LINE_STYLES)[number];

export const DEFAULT_STYLE: LineStyle = "action";

/**
 * 원고 안에 있지만 인쇄되지 않는 줄: 막(#), 장(##), 씬 요약(=).
 * PDF·Word·페이지 계산에 들어가지 않고, 사이드바 씬 목록의 구조와 요약이 된다.
 * 줄 스타일 7가지(LINE_STYLES)와 달리 단축키·Tab 순환에는 없고, `# `, `## `, `= `을 쳐서 만든다.
 */
export const OUTLINE_STYLES = ["act", "chapter", "synopsis"] as const;
export type OutlineStyle = (typeof OUTLINE_STYLES)[number];

/** 원고 줄 하나가 가질 수 있는 스타일: 인쇄되는 7가지 + 인쇄되지 않는 3가지 */
export type DocStyle = LineStyle | OutlineStyle;

export function isOutlineStyle(style: unknown): style is OutlineStyle {
  return (OUTLINE_STYLES as readonly unknown[]).includes(style);
}

export const STYLE_LABELS: Record<LineStyle, string> = {
  scene: "씬헤딩",
  action: "액션",
  character: "인물",
  parenthetical: "괄호지문",
  dialogue: "대사",
  subheader: "서브 헤더",
  transition: "전환",
};

export const OUTLINE_LABELS: Record<OutlineStyle, string> = {
  act: "막",
  chapter: "시퀀스",
  synopsis: "씬 요약",
};

/** 줄 스타일 이름 (화면 왼쪽 여백 표시용) */
export function styleLabel(style: DocStyle): string {
  return isOutlineStyle(style) ? OUTLINE_LABELS[style] : STYLE_LABELS[style];
}

// 줄 끝에서 Enter를 눌렀을 때 다음 줄에 자동으로 붙는 기본 스타일
export const NEXT_STYLE_ON_ENTER: Record<LineStyle, LineStyle> = {
  scene: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "action",
  subheader: "action",
  transition: "action",
};

/**
 * 막·장·요약 줄 끝에서 Enter를 누르면 새 줄은 액션이 된다.
 * (요약을 이어 쓰려면 새 줄에서 `= `를 다시 친다. 씬헤딩은 Tab이나 ⌘1로 바꾼다)
 */
export const NEXT_STYLE_AFTER_OUTLINE: Record<OutlineStyle, LineStyle> = {
  act: "action",
  chapter: "action",
  synopsis: "action",
};

/** 줄 끝에서 Enter를 눌렀을 때 새 줄의 스타일 (설정 반영) */
export function nextStyleOnEnter(style: DocStyle): LineStyle {
  return isOutlineStyle(style) ? NEXT_STYLE_AFTER_OUTLINE[style] : getNextStyleRules()[style];
}

/** 사용자 설정이 반영된 줄바꿈 다음 스타일 규칙을 가져옵니다. */
export function getNextStyleRules(): Record<LineStyle, LineStyle> {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("dropkick.settings.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.nextStyleOnEnter && typeof parsed.nextStyleOnEnter === "object") {
          return { ...NEXT_STYLE_ON_ENTER, ...parsed.nextStyleOnEnter };
        }
      }
    }
  } catch {
    // 기본값 반환
  }
  return NEXT_STYLE_ON_ENTER;
}

// 스타일별 단축키를 반환합니다. (설정에서 변경한 경우 해당 단축키 표시)
export function shortcutFor(style: LineStyle): string {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem("dropkick.settings.v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.styleShortcuts?.[style]) {
          return `⌘${parsed.styleShortcuts[style]}`.toUpperCase();
        }
      }
    }
  } catch {
    // 기본값 반환
  }
  return `⌘${LINE_STYLES.indexOf(style) + 1}`;
}

// Tab / Shift+Tab 으로 스타일을 순환한다.
export function cycleStyle(style: DocStyle, direction: 1 | -1): LineStyle {
  // 막·장·요약 줄에서는 액션에서 시작한 것처럼 돈다.
  const i = isOutlineStyle(style) ? LINE_STYLES.indexOf(DEFAULT_STYLE) : LINE_STYLES.indexOf(style);
  const n = LINE_STYLES.length;
  return LINE_STYLES[(i + direction + n) % n];
}

export function isLineStyle(value: unknown): value is LineStyle {
  return (LINE_STYLES as readonly unknown[]).includes(value);
}

// "민재 (V.O.)", "민재 (계속)" 처럼 뒤에 붙은 괄호를 떼고 이름만 남긴다.
export function characterName(text: string): string {
  return text.replace(/\s*\(.*\)\s*$/, "").trim();
}
