import { describe, expect, it } from "vitest";
import { SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN, clampSidebar } from "./SidebarResizer";

describe("사이드바 폭", () => {
  it("기본 폭은 최소와 최대 사이에 있다", () => {
    expect(SIDEBAR_DEFAULT).toBeGreaterThanOrEqual(SIDEBAR_MIN);
    expect(SIDEBAR_DEFAULT).toBeLessThanOrEqual(SIDEBAR_MAX);
  });

  it("끌어도 최소·최대를 넘지 않는다", () => {
    expect(clampSidebar(50)).toBe(SIDEBAR_MIN);
    expect(clampSidebar(5000)).toBe(SIDEBAR_MAX);
    expect(clampSidebar(400)).toBe(400);
  });

  it("창이 좁으면 창 폭의 절반까지만, 그래도 최소보다는 줄지 않는다", () => {
    expect(clampSidebar(500, 800)).toBe(400);
    expect(clampSidebar(500, 300)).toBe(SIDEBAR_MIN);
  });
});
