import { describe, expect, it } from "vitest";
import { compactSettings, parseScriptSettings, sceneStartOf } from "./scriptSettings";

describe("스크립트 설정", () => {
  it("첫 씬 번호는 기본 1이고, 잘못된 값은 1로 본다", () => {
    expect(sceneStartOf(undefined)).toBe(1);
    expect(sceneStartOf({ sceneStart: 10 })).toBe(10);
    for (const bad of [0, -3, 1.5, 100000, Number.NaN]) expect(sceneStartOf({ sceneStart: bad })).toBe(1);
  });

  it("기본값과 같은 항목은 저장하지 않는다", () => {
    expect(compactSettings({ sceneStart: 1, watermark: "  ", coverOff: [] })).toBeUndefined();
    expect(compactSettings({ sceneStart: 5, watermark: " 비밀 ", coverOff: ["author"] })).toEqual({
      coverOff: ["author"],
      sceneStart: 5,
      watermark: "비밀",
    });
  });

  it("저장 파일의 값을 검사하고, 없는 스크립트의 설정은 버린다", () => {
    const parsed = parseScriptSettings(
      {
        s1: { coverOff: ["author", "엉터리"], sceneStart: 7, watermark: "초안" },
        없는스크립트: { sceneStart: 3 },
        s2: { sceneStart: "열" },
      },
      new Set(["s1", "s2"]),
    );
    expect(parsed).toEqual({ s1: { coverOff: ["author"], sceneStart: 7, watermark: "초안" } });
    expect(parseScriptSettings(null, new Set())).toEqual({});
  });

  it("막·장·요약 인쇄 설정: 켠 것만 저장하고, 파일에서 읽을 때 true만 믿는다", () => {
    expect(compactSettings({ printSections: false, printSynopsis: false })).toBeUndefined();
    expect(compactSettings({ printSynopsis: true })).toEqual({ printSynopsis: true });
    const parsed = parseScriptSettings(
      { s1: { printSections: true, printSynopsis: "예" }, s2: { printSections: 1 } },
      new Set(["s1", "s2"]),
    );
    expect(parsed).toEqual({ s1: { printSections: true } });
  });
});
