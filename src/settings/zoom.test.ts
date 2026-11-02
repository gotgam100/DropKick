import { describe, expect, it } from "vitest";
import { stepZoomPercent } from "./settings";

describe("화면 비율 단계", () => {
  it("한 단계씩 키우고 줄인다", () => {
    expect(stepZoomPercent(100, 1)).toBe(120);
    expect(stepZoomPercent(150, 1)).toBe(200);
    expect(stepZoomPercent(100, -1)).toBe(90);
    expect(stepZoomPercent(80, -1)).toBe(70);
  });

  it("끝에서는 더 가지 않는다", () => {
    expect(stepZoomPercent(200, 1)).toBe(200);
    expect(stepZoomPercent(70, -1)).toBe(70);
  });
});
