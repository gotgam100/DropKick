/**
 * 문서 스타일 말고 앱 전체에서 쓰는 단축키 (사이드바, 통계, 화면 나누기, 집중 모드, 가이드).
 * 키 조합은 "Alt+Cmd+1"처럼 글자로 저장한다. ⌥를 누르면 글자가 바뀌므로 key가 아니라 code로 읽는다.
 */

export type AppShortcutId = "toggleSidebar" | "toggleStats" | "toggleSplit" | "toggleFocus" | "openGuide";
export type AppShortcuts = Record<AppShortcutId, string>;

export const APP_SHORTCUT_IDS: readonly AppShortcutId[] = ["toggleSidebar", "toggleStats", "toggleSplit", "toggleFocus", "openGuide"];

export const APP_SHORTCUT_LABELS: Record<AppShortcutId, string> = {
  toggleSidebar: "사이드바 보기/숨기기",
  toggleStats: "통계 보기/숨기기",
  toggleSplit: "화면 나누기 켜기/끄기",
  toggleFocus: "집중 모드 켜기/끄기",
  openGuide: "시나리오 작성 가이드",
};

export const DEFAULT_APP_SHORTCUTS: AppShortcuts = {
  toggleSidebar: "Alt+Cmd+1",
  toggleStats: "Alt+Cmd+2",
  toggleSplit: "Alt+Cmd+3",
  toggleFocus: "Shift+Cmd+F",
  openGuide: "Shift+Cmd+/",
};

/** 메뉴나 편집기가 이미 쓰고 있어서 지정할 수 없는 조합 */
const RESERVED = new Set([
  "Cmd+N", "Cmd+O", "Cmd+S", "Shift+Cmd+S", "Cmd+W", "Cmd+P", "Cmd+F", "Cmd+Q", "Cmd+,",
  "Cmd+Z", "Shift+Cmd+Z", "Cmd+X", "Cmd+C", "Cmd+V", "Cmd+A", "Cmd+H", "Cmd+M",
]);

/** 키보드 이벤트의 물리 키(code)를 한 글자 이름으로 */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const map: Record<string, string> = {
    Slash: "/", Comma: ",", Period: ".", Semicolon: ";", Quote: "'", Backslash: "\\",
    BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`",
  };
  return map[code] ?? null;
}

type KeyLike = Pick<KeyboardEvent, "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">;

/** 이벤트를 조합 글자로 바꾼다. ⌘(또는 Ctrl)가 없거나 글자 키가 아니면 null. */
export function comboFromEvent(e: KeyLike): string | null {
  const key = keyName(e.code);
  if (!key || !(e.metaKey || e.ctrlKey)) return null;
  const parts: string[] = [];
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push("Cmd", key);
  return parts.join("+");
}

/** "Alt+Shift+Cmd+1" 모양으로 맞춘다 (저장·비교용) */
export function normalizeCombo(combo: string): string {
  const parts = combo.split("+");
  const key = parts[parts.length - 1];
  const has = (m: string) => parts.includes(m);
  return [has("Alt") ? "Alt" : "", has("Shift") ? "Shift" : "", "Cmd", key].filter(Boolean).join("+");
}

/** 화면에 보일 모양: ⌥⇧⌘1 */
export function formatCombo(combo: string): string {
  const parts = normalizeCombo(combo).split("+");
  const key = parts[parts.length - 1];
  return `${parts.includes("Alt") ? "⌥" : ""}${parts.includes("Shift") ? "⇧" : ""}⌘${key}`;
}

/** 이벤트가 눌린 조합과 같은지 */
export function matchesCombo(e: KeyLike, combo: string): boolean {
  const pressed = comboFromEvent(e);
  return pressed !== null && normalizeCombo(pressed) === normalizeCombo(combo);
}

/** 어느 단축키에 해당하는지 */
export function shortcutForEvent(e: KeyLike, shortcuts: AppShortcuts): AppShortcutId | null {
  for (const id of APP_SHORTCUT_IDS) if (matchesCombo(e, shortcuts[id])) return id;
  return null;
}

/**
 * 이 조합을 `id`에 지정할 수 있는지 검사한다. 문제가 없으면 null, 있으면 이유를 돌려준다.
 * 문서 스타일 단축키(⌘+글자 하나)와 겹치는 것도 막는다.
 */
export function checkAppShortcut(
  id: AppShortcutId,
  combo: string,
  shortcuts: AppShortcuts,
  styleKeys: readonly string[],
): string | null {
  const c = normalizeCombo(combo);
  if (RESERVED.has(c)) return "다른 기능이 이미 쓰는 단축키예요.";
  if (styleKeys.some((k) => c === `Cmd+${k.toUpperCase()}`)) return "문서 스타일 단축키와 겹쳐요.";
  for (const other of APP_SHORTCUT_IDS) {
    if (other !== id && normalizeCombo(shortcuts[other]) === c) return `'${APP_SHORTCUT_LABELS[other]}'에서 쓰고 있어요.`;
  }
  return null;
}

/** 저장된 값을 믿지 않고 검사한다. 이상한 값은 기본값으로 되돌린다. */
export function parseAppShortcuts(value: unknown): AppShortcuts {
  const result = { ...DEFAULT_APP_SHORTCUTS };
  if (!value || typeof value !== "object") return result;
  const v = value as Record<string, unknown>;
  for (const id of APP_SHORTCUT_IDS) {
    const raw = v[id];
    if (typeof raw === "string" && /^((Alt|Shift)\+)*Cmd\+[A-Z0-9/,.;'\\[\]\-=`]$/.test(raw)) result[id] = normalizeCombo(raw);
  }
  return result;
}
