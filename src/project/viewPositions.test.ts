import { describe, expect, it } from "vitest";
import { createProject, parseManifest, serializeManifest } from "./model";
import { clampPosition, parseViewPositions, samePosition } from "./viewPositions";

describe("보던 자리 저장값", () => {
  const ids = new Set(["script-a", "script-b"]);

  it("있는 스크립트의 올바른 값만 읽는다", () => {
    const parsed = parseViewPositions(
      {
        "script-a": { caret: 120, top: 80 },
        "script-b": { caret: -1, top: 0 }, // 음수
        "script-c": { caret: 1, top: 1 }, // 없는 스크립트
        "script-d": "엉뚱한 값",
      },
      ids,
    );
    expect(parsed).toEqual({ "script-a": { caret: 120, top: 80 } });
  });

  it("객체가 아니거나 소수·글자인 값은 버린다", () => {
    expect(parseViewPositions(null, ids)).toEqual({});
    expect(parseViewPositions([1, 2], ids)).toEqual({});
    expect(parseViewPositions({ "script-a": { caret: 1.5, top: 2 } }, ids)).toEqual({});
    expect(parseViewPositions({ "script-a": { caret: "3", top: 2 } }, ids)).toEqual({});
  });

  it("글 길이를 넘는 위치는 끝으로 맞춘다", () => {
    expect(clampPosition({ caret: 500, top: 300 }, 100)).toEqual({ caret: 100, top: 100 });
    expect(clampPosition({ caret: 5, top: 3 }, 100)).toEqual({ caret: 5, top: 3 });
  });

  it("같은 자리인지 비교한다", () => {
    expect(samePosition({ caret: 1, top: 2 }, { caret: 1, top: 2 })).toBe(true);
    expect(samePosition({ caret: 1, top: 2 }, { caret: 1, top: 3 })).toBe(false);
    expect(samePosition(null, { caret: 1, top: 2 })).toBe(false);
  });
});

describe("프로젝트 파일에 보던 자리 저장", () => {
  it("저장했다가 다시 읽으면 그대로 돌아오고, 없는 스크립트의 것은 버린다", () => {
    const { manifest } = createProject("시험");
    const withPositions = {
      ...manifest,
      viewPositions: { [manifest.mainScript]: { caret: 42, top: 10 }, "script-없음": { caret: 1, top: 1 } },
    };
    const parsed = parseManifest(serializeManifest(withPositions));
    expect(parsed.viewPositions).toEqual({ [manifest.mainScript]: { caret: 42, top: 10 } });
  });

  it("예전 프로젝트(보던 자리 없음)도 그대로 열린다", () => {
    const { manifest } = createProject("시험");
    expect(parseManifest(serializeManifest(manifest)).viewPositions).toBeUndefined();
  });
});
