import { describe, expect, it } from "vitest";
import { createScriptState, scriptLines, type ScriptLine } from "./lineStyles";
import { keepOrphans, mergeOrphans, orphanChains, orphanInfo, previousScene, replaceLinesSpec } from "./synopsis";

const L = (style: ScriptLine["style"], text: string): ScriptLine => ({ style, text });
const brief = (lines: ScriptLine[]) => lines.map((l) => `${l.style}:${l.text}`).join(",");

describe("주인 없는 요약", () => {
  it("씬헤딩 바로 아래 이어진 요약은 주인이 있다", () => {
    const lines = [L("scene", "A"), L("synopsis", "a1"), L("synopsis", "a2"), L("action", "본문")];
    expect(orphanChains(lines)).toEqual([]);
  });

  it("씬헤딩이 없어졌거나 다른 줄 뒤에 있는 요약은 주인이 없다", () => {
    const lines = [L("scene", "A"), L("action", "a"), L("synopsis", "x1"), L("synopsis", "x2"), L("action", "b"), L("synopsis", "y")];
    expect(orphanChains(lines)).toEqual([
      { from: 3, to: 4 },
      { from: 6, to: 6 },
    ]);
  });

  it("맨 앞의 요약도 주인이 없다", () => {
    expect(orphanChains([L("synopsis", "x"), L("scene", "A")])).toEqual([{ from: 1, to: 1 }]);
  });

  it("막·장 줄 뒤의 요약도 주인이 없다", () => {
    expect(orphanChains([L("scene", "A"), L("act", "2막"), L("synopsis", "x")])).toEqual([{ from: 3, to: 3 }]);
  });

  it("앞 씬헤딩을 찾는다", () => {
    const lines = [L("action", "머리"), L("scene", "A"), L("action", "a"), L("synopsis", "x")];
    expect(previousScene(lines, 4)).toBe(2);
    expect(previousScene(lines, 2)).toBeNull();
  });
});

describe("주인 없는 요약 정리", () => {
  // B 씬헤딩이 지워져서 b 요약이 A의 본문 뒤에 남은 모양
  const broken = [L("scene", "A"), L("synopsis", "a 요약"), L("action", "a1"), L("synopsis", "b 요약"), L("action", "b1")];

  it("합치기: 앞 씬의 요약 맨 끝으로 옮긴다", () => {
    expect(brief(mergeOrphans(broken))).toBe("scene:A,synopsis:a 요약,synopsis:b 요약,action:a1,action:b1");
  });

  it("합치기: 앞 씬에 요약이 없으면 씬헤딩 바로 아래로 옮긴다", () => {
    const lines = [L("scene", "A"), L("action", "a1"), L("synopsis", "b 요약")];
    expect(brief(mergeOrphans(lines))).toBe("scene:A,synopsis:b 요약,action:a1");
  });

  it("합치기: 앞에 씬이 없으면 일반 글(액션)로 남긴다", () => {
    expect(brief(mergeOrphans([L("synopsis", "x"), L("scene", "A")]))).toBe("action:x,scene:A");
  });

  it("합치기: 여러 덩어리도 각각 앞 씬으로 간다", () => {
    const lines = [L("scene", "A"), L("action", "a"), L("synopsis", "p"), L("scene", "B"), L("action", "b"), L("synopsis", "q")];
    expect(brief(mergeOrphans(lines))).toBe("scene:A,synopsis:p,action:a,scene:B,synopsis:q,action:b");
  });

  it("합치지 않기: 글은 그대로 두고 일반 글(액션)로 바꾼다", () => {
    expect(brief(keepOrphans(broken))).toBe("scene:A,synopsis:a 요약,action:a1,action:b 요약,action:b1");
  });

  it("정리하고 나면 주인 없는 요약이 없다", () => {
    expect(orphanChains(mergeOrphans(broken))).toEqual([]);
    expect(orphanChains(keepOrphans(broken))).toEqual([]);
  });
});

describe("편집기에서 정리하기", () => {
  const broken = [L("scene", "내부. 방 - 낮"), L("action", "a1"), L("synopsis", "b 요약"), L("action", "b1")];

  it("첫 덩어리의 글과 합칠 앞 씬 이름을 알려 준다", () => {
    const info = orphanInfo(createScriptState(broken))!;
    expect(info.texts).toEqual(["b 요약"]);
    expect(info.target).toBe("1. 내부. 방 - 낮");
  });

  it("앞 씬이 없으면 target이 없다", () => {
    expect(orphanInfo(createScriptState([L("synopsis", "x"), L("scene", "A")]))!.target).toBeNull();
  });

  it("주인 없는 요약이 없으면 null", () => {
    expect(orphanInfo(createScriptState([L("scene", "A"), L("synopsis", "x")]))).toBeNull();
  });

  it("바뀐 줄만 바꾸고, 글과 스타일이 모두 새 모양이 된다", () => {
    const state = createScriptState(broken);
    const spec = replaceLinesSpec(state, mergeOrphans(scriptLines(state)))!;
    const next = state.update(spec).state;
    expect(brief(scriptLines(next))).toBe("scene:내부. 방 - 낮,synopsis:b 요약,action:a1,action:b1");
  });

  it("같은 내용이면 바꿀 게 없다", () => {
    const state = createScriptState([L("scene", "A"), L("synopsis", "x")]);
    expect(replaceLinesSpec(state, scriptLines(state))).toBeNull();
  });
});
