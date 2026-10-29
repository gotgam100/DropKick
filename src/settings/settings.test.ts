import { describe, expect, it, beforeEach } from "vitest";
import {
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  DEFAULT_STYLE_SHORTCUTS,
  DEFAULT_NEXT_STYLE_RULES,
} from "./settings";
import { getNextStyleRules, shortcutFor } from "../editor/styles";

describe("Settings & Shortcuts / Enter Rules", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    // @ts-expect-error Mock localStorage in Node/Vitest
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
  });

  it("loads default settings including styleShortcuts and nextStyleOnEnter", () => {
    const settings = loadSettings();
    expect(settings.styleShortcuts).toEqual(DEFAULT_STYLE_SHORTCUTS);
    expect(settings.nextStyleOnEnter).toEqual(DEFAULT_NEXT_STYLE_RULES);
    expect(shortcutFor("scene")).toBe("⌘1");
    expect(shortcutFor("transition")).toBe("⌘7");
  });

  it("saves and loads custom style shortcuts", () => {
    const custom = {
      ...DEFAULT_SETTINGS,
      styleShortcuts: {
        ...DEFAULT_STYLE_SHORTCUTS,
        scene: "9",
        action: "0",
      },
    };
    saveSettings(custom);
    const loaded = loadSettings();
    expect(loaded.styleShortcuts.scene).toBe("9");
    expect(loaded.styleShortcuts.action).toBe("0");
    expect(shortcutFor("scene")).toBe("⌘9");
    expect(shortcutFor("action")).toBe("⌘0");
  });

  it("saves and loads custom nextStyleOnEnter rules", () => {
    const custom = {
      ...DEFAULT_SETTINGS,
      nextStyleOnEnter: {
        ...DEFAULT_NEXT_STYLE_RULES,
        dialogue: "character" as const,
        transition: "scene" as const,
      },
    };
    saveSettings(custom);
    const rules = getNextStyleRules();
    expect(rules.dialogue).toBe("character");
    expect(rules.transition).toBe("scene");
  });
});
