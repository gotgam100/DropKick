import { describe, expect, it } from "vitest";
import type { ScriptLine } from "../editor/lineStyles";
import { buildAskRequest, estimateTokens, formatLines, lineIndexAt, sceneRange } from "./context";
import { addUsage, emptyUsage } from "./usage";
import { parseAiSettings } from "./models";

const lines: ScriptLine[] = [
  { style: "scene", text: "내부. 집 - 낮" },
  { style: "action", text: "창문이 흔들린다." },
  { style: "character", text: "민재" },
  { style: "dialogue", text: "누구세요?" },
  { style: "scene", text: "외부. 골목 - 밤" },
  { style: "action", text: "비가 온다." },
];

describe("AI 묻기 글 고르기", () => {
  it("위치로 줄을 찾는다", () => {
    expect(lineIndexAt(lines, 0)).toBe(0);
    expect(lineIndexAt(lines, 14)).toBe(1); // 첫 줄은 9글자 + 줄바꿈
    expect(lineIndexAt(lines, 9999)).toBe(5);
  });

  it("씬 범위는 앞뒤 씬헤딩 사이다", () => {
    expect(sceneRange(lines, 3)).toEqual([0, 4]);
    expect(sceneRange(lines, 5)).toEqual([4, 6]);
  });

  it("줄 종류를 붙인 글로 만든다", () => {
    expect(formatLines(lines.slice(2, 4))).toBe("[인물] 민재\n[대사] 누구세요?");
  });

  it("'고른 글만'은 원고를 보내지 않는다", () => {
    const r = buildAskRequest({ kind: "selection", quote: "창문", lines, lineIndex: 1, question: "어때?" });
    expect(r.system).toHaveLength(1);
    expect(r.messages[0].content).toContain("창문");
  });

  it("씬은 그 씬만, 전체는 캐시 표시와 함께 보낸다", () => {
    const scene = buildAskRequest({ kind: "scene", quote: "민재", lines, lineIndex: 2, question: "?" });
    expect(scene.system[1].text).toContain("누구세요?");
    expect(scene.system[1].text).not.toContain("비가 온다");
    expect(scene.system[1].cache).toBe(false);
    const whole = buildAskRequest({ kind: "whole", quote: "민재", lines, lineIndex: 2, question: "?" });
    expect(whole.system[1].text).toContain("비가 온다");
    expect(whole.system[1].cache).toBe(true);
    expect(whole.contextTokens).toBeGreaterThan(estimateTokens("민재"));
  });
});

describe("사용량과 설정", () => {
  it("같은 달이면 더하고, 달이 바뀌면 새로 시작한다", () => {
    const may = addUsage(emptyUsage("2026-05"), { input: 10, output: 5, cached: 0 }, new Date(2026, 4, 3));
    expect(addUsage(may, { input: 1, output: 1, cached: 0 }, new Date(2026, 4, 9))).toMatchObject({ input: 11, calls: 2 });
    expect(addUsage(may, { input: 1, output: 1, cached: 0 }, new Date(2026, 5, 1))).toMatchObject({ month: "2026-06", input: 1, calls: 1 });
  });

  it("망가진 AI 설정은 기본값으로 돌아간다", () => {
    expect(parseAiSettings({ model: "zzz", consented: "yes" })).toEqual({ model: "sonnet", consented: false });
    expect(parseAiSettings({ model: "opus", consented: true })).toEqual({ model: "opus", consented: true });
  });
});
