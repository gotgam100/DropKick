import { describe, expect, it } from "vitest";
import { tapFixStep, type TapFixState } from "./tapFix";

const ev = (type: "mousedown" | "mouseup" | "click", buttons = 0, trusted = true) => ({ type, button: 0, buttons, trusted });

describe("트랙패드 탭 보정", () => {
  it("순서대로 온 클릭은 건드리지 않는다", () => {
    const s: TapFixState = { staleDown: false, suppressClick: false };
    expect(tapFixStep(s, ev("mousedown", 1))).toBe("none");
    expect(tapFixStep(s, ev("mouseup"))).toBe("none");
    expect(tapFixStep(s, ev("click"))).toBe("none");
  });

  it("손 뗌이 먼저 오고 누름이 뒤에 오면 탭을 대신 마무리한다", () => {
    const s: TapFixState = { staleDown: false, suppressClick: false };
    expect(tapFixStep(s, ev("mouseup"))).toBe("none");
    expect(tapFixStep(s, ev("mousedown", 0))).toBe("finish-tap");
    expect(s.staleDown).toBe(true);
  });

  it("남은 누름과 다음 탭의 손 뗌이 만든 클릭은 막고, 그 탭도 다시 마무리한다", () => {
    const s: TapFixState = { staleDown: false, suppressClick: false };
    tapFixStep(s, ev("mouseup"));
    tapFixStep(s, ev("mousedown", 0));
    // 다음 탭도 뒤집혀 온다: 손 뗌 → (엉뚱한) 클릭 → 누름
    expect(tapFixStep(s, ev("mouseup"))).toBe("none");
    expect(tapFixStep(s, ev("click"))).toBe("suppress");
    expect(tapFixStep(s, ev("mousedown", 0))).toBe("finish-tap");
  });

  it("남은 누름 뒤에 진짜로 꾹 누르면 정상 클릭이 된다", () => {
    const s: TapFixState = { staleDown: false, suppressClick: false };
    tapFixStep(s, ev("mouseup"));
    tapFixStep(s, ev("mousedown", 0));
    expect(tapFixStep(s, ev("mousedown", 1))).toBe("none");
    expect(tapFixStep(s, ev("mouseup"))).toBe("none");
    expect(tapFixStep(s, ev("click"))).toBe("none");
  });

  it("앱이 보낸 가짜 이벤트와 오른쪽 버튼은 보지 않는다", () => {
    const s: TapFixState = { staleDown: false, suppressClick: false };
    expect(tapFixStep(s, ev("mousedown", 0, false))).toBe("none");
    expect(tapFixStep(s, { type: "mousedown", button: 2, buttons: 0, trusted: true })).toBe("none");
    expect(s.staleDown).toBe(false);
  });

  it("막을 클릭이 남아 있어도 키보드로 누른 클릭(detail 0)은 막지 않는다", () => {
    const s: TapFixState = { staleDown: true, suppressClick: false };
    tapFixStep(s, ev("mouseup"));
    expect(tapFixStep(s, { type: "click", button: 0, buttons: 0, trusted: true, detail: 0 })).toBe("none");
  });
});
