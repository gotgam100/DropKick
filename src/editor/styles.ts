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

export const STYLE_LABELS: Record<LineStyle, string> = {
  scene: "씬헤딩",
  action: "액션",
  character: "인물",
  parenthetical: "괄호지문",
  dialogue: "대사",
  subheader: "서브 헤더",
  transition: "전환",
};

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
export function cycleStyle(style: LineStyle, direction: 1 | -1): LineStyle {
  const i = LINE_STYLES.indexOf(style);
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
