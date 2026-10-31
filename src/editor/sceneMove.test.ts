import { describe, expect, it } from "vitest";
import { history, undo } from "@codemirror/commands";
import { createScriptState, sceneNumbersField, scriptLines, type ScriptLine } from "./lineStyles";
import { moveScene, sceneMoveSpec, sceneStarts } from "./sceneMove";

const L = (style: ScriptLine["style"], text: string): ScriptLine => ({ style, text });
const doc: ScriptLine[] = [
  L("action", "머리말"), // 1
  L("scene", "A"), // 2
  L("action", "a1"), // 3
  L("scene", "B"), // 4
  L("action", "b1"), // 5
  L("action", "b2"), // 6
  L("scene", "C"), // 7
  L("action", "c1"), // 8
];
const apply = (move: NonNullable<ReturnType<typeof moveScene>>) => [
  ...doc.slice(0, move.from - 1),
  ...move.lines,
  ...doc.slice(move.to),
];
const texts = (lines: ScriptLine[]) => lines.map((l) => l.text).join(",");

describe("씬 옮기기", () => {
  it("씬헤딩 줄을 찾는다", () => {
    expect(sceneStarts(doc)).toEqual([2, 4, 7]);
  });

  it("아래 씬을 위로 올린다", () => {
    const move = moveScene(doc, 7, 2)!;
    expect(texts(apply(move))).toBe("머리말,C,c1,A,a1,B,b1,b2");
    expect(move.headingLine).toBe(2);
  });

  it("위 씬을 아래로 내린다", () => {
    const move = moveScene(doc, 2, 7)!;
    expect(texts(apply(move))).toBe("머리말,B,b1,b2,A,a1,C,c1");
    expect(move.headingLine).toBe(5);
  });

  it("맨 끝으로 보낸다", () => {
    const move = moveScene(doc, 4, null)!;
    expect(texts(apply(move))).toBe("머리말,A,a1,C,c1,B,b1,b2");
    expect(move.headingLine).toBe(6);
  });

  it("첫 씬을 맨 끝으로 보내도 머리말은 그대로다", () => {
    expect(texts(apply(moveScene(doc, 2, null)!))).toBe("머리말,B,b1,b2,C,c1,A,a1");
  });

  it("스타일도 함께 움직인다", () => {
    const moved = apply(moveScene(doc, 7, 2)!);
    expect(moved.map((l) => l.style).join(",")).toBe("action,scene,action,scene,action,scene,action,action");
  });

  it("옮겨도 그대로인 경우와 씬이 아닌 줄은 null", () => {
    expect(moveScene(doc, 4, 4)).toBeNull();
    expect(moveScene(doc, 4, 7)).toBeNull(); // 바로 다음 자리
    expect(moveScene(doc, 7, null)).toBeNull(); // 이미 맨 끝
    expect(moveScene(doc, 3, 2)).toBeNull();
    expect(moveScene(doc, 4, 5)).toBeNull();
  });
});

describe("편집기 상태에서 씬 옮기기", () => {
  const lines: ScriptLine[] = [
    { style: "scene", text: "내부. A - 낮" },
    { style: "action", text: "a1" },
    { style: "scene", text: "내부. B - 밤" },
    { style: "character", text: "민재" },
    { style: "dialogue", text: "안녕" },
  ];
  const make = () => createScriptState(lines, [history()]);

  it("글과 스타일이 함께 옮겨지고 씬 번호가 다시 매겨진다", () => {
    const move = sceneMoveSpec(make(), 3, 1)!;
    const next = make().update(move.spec).state;
    expect(scriptLines(next)).toEqual([
      { style: "scene", text: "내부. B - 밤" },
      { style: "character", text: "민재" },
      { style: "dialogue", text: "안녕" },
      { style: "scene", text: "내부. A - 낮" },
      { style: "action", text: "a1" },
    ]);
    expect(move.headingLine).toBe(1);
    expect([...next.field(sceneNumbersField).values()].map((n) => n.number)).toEqual([1, 2]);
  });

  it("⌘Z 한 번으로 글과 스타일이 모두 돌아온다", () => {
    const moved = make().update(sceneMoveSpec(make(), 3, 1)!.spec).state;
    let back = moved;
    undo({ state: moved, dispatch: (tr) => (back = tr.state) });
    expect(scriptLines(back)).toEqual(lines);
  });
});
