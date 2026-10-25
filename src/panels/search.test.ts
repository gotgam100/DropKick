import { describe, expect, it } from "vitest";
import type { SceneSummary } from "../analysis/analyze";
import type { ProjectNode } from "../project/model";
import { makeSnippet, searchProject } from "./search";

const tree: ProjectNode[] = [
  { id: "f1", type: "folder", name: "메모", children: [{ id: "m1", type: "memo", name: "아이디어", file: "" }] },
  { id: "s", type: "script", name: "스크립트", file: "" },
  { id: "f2", type: "folder", name: "인물 설정", children: [{ id: "c1", type: "character", name: "민재", file: "" }] },
];
const scene = (line: number, heading: string, characters: string[], text: string) =>
  ({ line, number: line, heading, page: 1, eighths: 1, characters, speeches: 0, text }) as SceneSummary;
const scenes = [
  scene(1, "S#1. 내부. 체육관 - 밤", ["민재"], "형광등이 깜빡인다.\n딱 한 번만 더."),
  scene(5, "S#2. 외부. 골목 - 밤", ["수아"], "비가 내린다. 우산이 없다."),
];
const texts = new Map([
  ["m1", "결말에서 민재가 링으로 돌아온다."],
  ["c1", "# 민재\n- 나이: 34"],
]);

describe("사이드바 찾기", () => {
  it("문서 본문에서 찾으면 앞뒤 문맥과 함께 보여 준다", () => {
    const result = searchProject(tree, scenes, "s", texts, "링으로");
    expect(result.tree.map((n) => n.name)).toEqual(["메모"]);
    expect(result.docSnippets.get("m1")).toEqual({ before: "결말에서 민재가 ", match: "링으로", after: " 돌아온다." });
    expect(result.count).toBe(1);
  });

  it("씬 내용에서도 찾는다", () => {
    const result = searchProject(tree, scenes, "s", texts, "우산");
    expect(result.scenes.map((s) => s.line)).toEqual([5]);
    expect(result.sceneSnippets.get(5)?.match).toBe("우산");
    expect(result.tree.map((n) => n.name)).toEqual(["스크립트"]);
  });

  it("인물 이름은 씬, 인물 설정 문서, 메모 본문에서 모두 찾는다", () => {
    const result = searchProject(tree, scenes, "s", texts, "민재");
    expect(result.scenes.map((s) => s.line)).toEqual([1]);
    expect(result.tree.map((n) => n.name)).toEqual(["메모", "스크립트", "인물 설정"]);
    expect(result.count).toBe(3);
  });

  it("영문은 대소문자를 가리지 않고, 긴 글은 앞뒤를 줄인다", () => {
    expect(makeSnippet("Hello World", "world")?.match).toBe("World");
    const long = "가".repeat(40) + "찾는말" + "나".repeat(40);
    const snip = makeSnippet(long, "찾는말")!;
    expect(snip.before.startsWith("…")).toBe(true);
    expect(snip.after.endsWith("…")).toBe(true);
  });

  it("빈 검색어는 전체를 그대로", () => {
    const result = searchProject(tree, scenes, "s", texts, "  ");
    expect(result.tree).toBe(tree);
    expect(result.count).toBe(0);
  });
});
