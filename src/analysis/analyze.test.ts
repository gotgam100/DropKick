import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ScriptLine } from "../editor/lineStyles";
import { fromFountain } from "../fountain/fountain";
import { PAGE } from "../layout/paginate";
import { analyzeScript, characterKey, formatEighths, sceneAtLine } from "./analyze";

const script: ScriptLine[] = [
  { style: "transition", text: "FADE IN:" },
  { style: "scene", text: "내부. 체육관 - 밤" },
  { style: "action", text: "민재가 링 위에 서 있다." },
  { style: "character", text: "민재" },
  { style: "dialogue", text: "딱 한 번만 더." },
  { style: "character", text: "관장 (O.S.)" },
  { style: "parenthetical", text: "(웃으며)" },
  { style: "dialogue", text: "또냐." },
  { style: "scene", text: "S#10. 외부. 골목 - 밤" },
  { style: "character", text: "민재 (CONT'D)" },
  { style: "dialogue", text: "가자." },
  { style: "character", text: "수아" },
  { style: "dialogue", text: "네!" },
];

describe("원고 분석", () => {
  const result = analyzeScript(script);

  it("씬 목록: 번호, 헤딩, 페이지, 등장 인물", () => {
    expect(result.scenes.map((s) => [s.number, s.heading, s.page, s.characters])).toEqual([
      [1, "#1. 내부. 체육관 - 밤", 1, ["민재", "관장"]],
      [10, "#10. 외부. 골목 - 밤", 1, ["민재", "수아"]],
    ]);
    expect(result.scenes[0].speeches).toBe(2);
  });

  it("인물별 대사량: (V.O.)/(CONT'D) 같은 표시는 같은 인물로 묶는다", () => {
    expect(result.characters.map((c) => [c.name, c.speeches, c.dialogueChars, c.scenes, c.firstScene])).toEqual([
      ["민재", 2, 6 + 3, 2, 1],
      ["관장", 1, 3, 1, 1],
      ["수아", 1, 2, 1, 10],
    ]);
  });

  it("대사와 지문 글자 수", () => {
    // "딱 한 번만 더."(6) + "또냐."(3) + "가자."(3) + "네!"(2), 공백 제외
    expect(result.dialogueChars).toBe(6 + 3 + 3 + 2);
    expect(result.actionChars).toBe(10);
  });

  it("씬 길이는 1/8페이지 단위, 최소 1/8", () => {
    expect(result.scenes.every((s) => s.eighths >= 1)).toBe(true);
    expect(formatEighths(3)).toBe("3/8");
    expect(formatEighths(8)).toBe("1");
    expect(formatEighths(11)).toBe("1 3/8");
  });

  it("커서 줄이 속한 씬", () => {
    expect(sceneAtLine(result.scenes, 1)).toBeNull();
    expect(sceneAtLine(result.scenes, 5)?.number).toBe(1);
    expect(sceneAtLine(result.scenes, 9)?.number).toBe(10);
  });

  it("인물 키: 영문은 대문자로 맞춘다", () => {
    expect(characterKey("Will (V.O.)")).toBe("WILL");
    expect(characterKey("민재 (계속)")).toBe("민재");
  });
});

describe("100페이지 원고 분석", () => {
  const doc = fromFountain(
    readFileSync(new URL("../../samples/long-100p.fountain", import.meta.url), "utf8"),
  );

  it("씬 길이 합은 전체 분량과 같고, 러닝타임은 표준 형식 페이지 수", () => {
    const start = performance.now();
    const result = analyzeScript(doc.lines);
    const elapsed = performance.now() - start;
    expect(result.pages).toBe(100);
    expect(result.scenes).toHaveLength(107);
    const totalEighths = result.scenes.reduce((sum, s) => sum + s.eighths, 0);
    // 씬마다 올림하므로 실제 분량보다 조금 크다
    expect(totalEighths / 8).toBeGreaterThan(95);
    expect(totalEighths / 8).toBeLessThan(115);
    // 표준(54줄)은 넓힌 간격(41줄)보다 페이지가 적다
    expect(result.runtimeMinutes).toBeLessThan(100);
    expect(result.runtimeMinutes).toBeGreaterThan(100 * (PAGE.linesPerPage / 54) * 0.9);
    expect(result.characters[0].name).toBeTruthy();
    expect(elapsed).toBeLessThan(300);
  });
});
