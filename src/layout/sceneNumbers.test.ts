import { describe, expect, it } from "vitest";
import { fromFountain, toFountain } from "../fountain/fountain";
import { numberScenes } from "./sceneNumbers";
import { paginate } from "./paginate";
import { analyzeScript } from "../analysis/analyze";

const lines = [
  { style: "scene" as const, text: "내부. 집 - 낮" },
  { style: "action" as const, text: "조용하다." },
  { style: "scene" as const, text: "외부. 골목 - 밤" },
  { style: "scene" as const, text: "#20. 내부. 학교 - 낮" },
  { style: "scene" as const, text: "내부. 교실 - 낮" },
];
const text = (n: number) => lines[n - 1].text;
const styles = lines.map((l) => l.style);

describe("씬 번호 시작", () => {
  it("기본은 1번부터다", () => {
    expect([...numberScenes(styles, text).values()].map((s) => s.number)).toEqual([1, 2, 20, 21]);
  });

  it("원하는 번호부터 시작해 하나씩 늘어난다 (직접 쓴 번호가 있으면 거기서부터 이어진다)", () => {
    expect([...numberScenes(styles, text, 10).values()].map((s) => s.number)).toEqual([10, 11, 20, 21]);
  });

  it("페이지 계산, 분석, Fountain 저장에도 같은 시작 번호를 쓴다", () => {
    const plain = lines.slice(0, 3);
    const pageNumbers = paginate(plain, undefined, 5).pages.flatMap((p) => p.lines.filter((l) => l.style === "scene").map((l) => l.sceneNumber));
    expect(pageNumbers).toEqual([5, 6]);
    expect(analyzeScript(plain, undefined, 5).scenes.map((s) => s.number)).toEqual([5, 6]);
    const saved = toFountain({ titlePage: null, lines: plain, sceneStart: 5 });
    expect(saved).toContain("#5#");
    expect(saved).toContain("#6#");
    // 다시 읽으면 번호는 지워지고 글만 남는다 (시작 번호는 스크립트 설정에 있다)
    expect(fromFountain(saved).lines[0].text).toBe("내부. 집 - 낮");
  });
});
