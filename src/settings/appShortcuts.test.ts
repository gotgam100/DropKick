import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_SHORTCUTS,
  checkAppShortcut,
  comboFromEvent,
  formatCombo,
  matchesCombo,
  parseAppShortcuts,
  shortcutForEvent,
} from "./appShortcuts";

const ev = (code: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({
  code, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods,
});

describe("앱 단축키", () => {
  it("⌥⌘1은 ⌥를 눌러 글자가 바뀌어도 물리 키로 알아본다", () => {
    expect(shortcutForEvent(ev("Digit1", { metaKey: true, altKey: true }), DEFAULT_APP_SHORTCUTS)).toBe("toggleSidebar");
    expect(shortcutForEvent(ev("Digit2", { metaKey: true, altKey: true }), DEFAULT_APP_SHORTCUTS)).toBe("toggleStats");
    expect(shortcutForEvent(ev("Digit3", { metaKey: true, altKey: true }), DEFAULT_APP_SHORTCUTS)).toBe("toggleSplit");
    expect(shortcutForEvent(ev("Slash", { metaKey: true, shiftKey: true }), DEFAULT_APP_SHORTCUTS)).toBe("openGuide");
  });

  it("⌘ 없이는 단축키가 아니다", () => {
    expect(comboFromEvent(ev("Digit1", { altKey: true }))).toBeNull();
    expect(matchesCombo(ev("Digit1", { metaKey: true }), "Alt+Cmd+1")).toBe(false);
  });

  it("화면에는 ⌥⇧⌘ 순서로 보인다", () => {
    expect(formatCombo("Shift+Alt+Cmd+K")).toBe("⌥⇧⌘K");
  });

  it("이미 쓰는 조합은 지정할 수 없다", () => {
    const styleKeys = ["1", "2", "3", "4", "5", "6", "7"];
    expect(checkAppShortcut("toggleStats", "Cmd+S", DEFAULT_APP_SHORTCUTS, styleKeys)).not.toBeNull();
    expect(checkAppShortcut("toggleStats", "Cmd+3", DEFAULT_APP_SHORTCUTS, styleKeys)).not.toBeNull();
    expect(checkAppShortcut("toggleStats", "Alt+Cmd+1", DEFAULT_APP_SHORTCUTS, styleKeys)).not.toBeNull();
    expect(checkAppShortcut("toggleStats", "Alt+Cmd+2", DEFAULT_APP_SHORTCUTS, styleKeys)).toBeNull();
    expect(checkAppShortcut("toggleStats", "Alt+Cmd+8", DEFAULT_APP_SHORTCUTS, styleKeys)).toBeNull();
  });

  it("망가진 저장값은 기본값으로 돌아간다", () => {
    expect(parseAppShortcuts(null)).toEqual(DEFAULT_APP_SHORTCUTS);
    expect(parseAppShortcuts({ toggleStats: "zzz", toggleSidebar: "Cmd+B" })).toEqual({
      ...DEFAULT_APP_SHORTCUTS,
      toggleSidebar: "Cmd+B",
    });
  });
});
