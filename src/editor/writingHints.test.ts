import { beforeEach, describe, expect, it } from "vitest";
import { markTipSeen, nextStylesFor, pendingTip, resetTips, seenTips } from "./writingHints";
import { LINE_STYLES, OUTLINE_STYLES } from "./styles";

describe("쓰기 도움말", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    // @ts-expect-error Node에는 localStorage가 없어서 흉내 낸다
    globalThis.localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
  });

  it("푸터의 다음 요소: 기본 규칙대로 ⏎와 Tab의 요소를 알려 준다", () => {
    expect(nextStylesFor("character")).toEqual({ enter: "dialogue", tab: "dialogue" });
    expect(nextStylesFor("dialogue")).toEqual({ enter: "action", tab: "parenthetical" });
    expect(nextStylesFor("scene")).toEqual({ enter: "action", tab: "action" });
    expect(nextStylesFor("act")).toEqual({ enter: "action", tab: "character" });
  });

  it("설정에서 바꾼 Enter 규칙을 따른다", () => {
    localStorage.setItem("dropkick.settings.v1", JSON.stringify({ nextStyleOnEnter: { dialogue: "character" } }));
    expect(nextStylesFor("dialogue").enter).toBe("character");
  });

  it("처음 알림은 모든 요소에 있고, 요소마다 한 번만, 다시 보기를 누르면 또 나온다", () => {
    for (const style of [...LINE_STYLES, ...OUTLINE_STYLES]) expect(pendingTip(style, seenTips())?.text).toBeTruthy();
    expect(pendingTip("character", seenTips())).toMatchObject({ title: "인물", enter: "대사", tab: "대사" });
    expect(pendingTip("scene", seenTips())?.example).toBe("실내. 미숙의 집 - 오전");
    expect(pendingTip("transition", seenTips())?.example).toBe("CUT TO:, FADE IN:");
    expect(pendingTip("action", seenTips())?.example).toBeUndefined();
    expect(pendingTip("act", seenTips())?.title).toBe("막");
    markTipSeen("act");
    expect(pendingTip("act", seenTips())).toBeNull();
    expect(pendingTip("synopsis", seenTips())?.title).toBe("씬 요약");
    resetTips();
    expect(pendingTip("act", seenTips())?.title).toBe("막");
  });

});
