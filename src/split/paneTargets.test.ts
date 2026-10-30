import { describe, expect, it } from "vitest";
import {
  INITIAL_PANES,
  clampRatio,
  closePane,
  normalizePanes,
  openBesideScript,
  parsePanes,
  revealScript,
  scriptPane,
  serializePanes,
  setSplit,
  showInPane,
  swapPanes,
  type PaneState,
} from "./paneTargets";

const split = (a: PaneState["panes"][0], b: PaneState["panes"][1]): PaneState => ({
  ...INITIAL_PANES,
  split: true,
  panes: [a, b],
});

describe("showInPane", () => {
  it("한 화면에 문서를 열고 그 화면에 포커스를 준다", () => {
    const s = showInPane(split({ kind: "script" }, { kind: "stats" }), 1, { kind: "doc", id: "a" });
    expect(s.panes[1]).toEqual({ kind: "doc", id: "a" });
    expect(s.focus).toBe(1);
  });

  it("다른 화면이 이미 열고 있는 것을 고르면 두 화면을 서로 바꾼다", () => {
    const s = showInPane(split({ kind: "script" }, { kind: "doc", id: "a" }), 0, { kind: "doc", id: "a" });
    expect(s.panes).toEqual([{ kind: "doc", id: "a" }, { kind: "script" }]);
  });

  it("원고를 두 화면에 동시에 열 수 없다", () => {
    const s = showInPane(split({ kind: "script" }, { kind: "stats" }), 1, { kind: "script" });
    expect(s.panes).toEqual([{ kind: "stats" }, { kind: "script" }]);
  });
});

describe("setSplit / closePane / swapPanes", () => {
  it("나누기를 켜면 원고 곁에 통계가 열린다", () => {
    const s = setSplit(INITIAL_PANES, true);
    expect(s.split).toBe(true);
    expect(s.panes).toEqual([{ kind: "script" }, { kind: "stats" }]);
    expect(s.focus).toBe(0);
  });

  it("원고가 아닌 문서를 보다가 나누면 화면 2에 원고가 열린다", () => {
    const s = setSplit({ ...INITIAL_PANES, panes: [{ kind: "doc", id: "m" }, { kind: "stats" }] }, true);
    expect(s.panes[1]).toEqual({ kind: "script" });
  });

  it("나누기를 끄면 포커스가 있던 화면의 내용이 남는다", () => {
    const s = setSplit({ ...split({ kind: "script" }, { kind: "doc", id: "s" }), focus: 1 }, false);
    expect(s.split).toBe(false);
    expect(s.panes[0]).toEqual({ kind: "doc", id: "s" });
    expect(s.focus).toBe(0);
  });

  it("왼쪽 화면을 닫으면 오른쪽 내용이 화면 1이 된다", () => {
    const s = closePane(split({ kind: "script" }, { kind: "doc", id: "s" }), 0);
    expect(s.split).toBe(false);
    expect(s.panes[0]).toEqual({ kind: "doc", id: "s" });
  });

  it("두 화면을 서로 바꾼다", () => {
    const s = swapPanes(split({ kind: "script" }, { kind: "stats" }));
    expect(s.panes).toEqual([{ kind: "stats" }, { kind: "script" }]);
  });
});

describe("openBesideScript", () => {
  const board = { kind: "doc", id: "board" } as const;

  it("나누지 않은 상태: 원고는 그대로 두고 오른쪽에 연다", () => {
    const s = openBesideScript(INITIAL_PANES, board);
    expect(s.split).toBe(true);
    expect(s.panes).toEqual([{ kind: "script" }, board]);
    expect(s.focus).toBe(1);
  });

  it("원고가 오른쪽에 있으면 왼쪽에 연다", () => {
    const s = openBesideScript(split({ kind: "stats" }, { kind: "script" }), board);
    expect(s.panes).toEqual([board, { kind: "script" }]);
  });

  it("이미 열려 있으면 포커스만 옮긴다", () => {
    const s = openBesideScript(split({ kind: "script" }, board), board);
    expect(s.panes).toEqual([{ kind: "script" }, board]);
    expect(s.focus).toBe(1);
  });

  it("원고가 안 보이는 상태: 원고를 화면 1에 되살리고 곁에 연다", () => {
    const s = openBesideScript({ ...INITIAL_PANES, panes: [{ kind: "doc", id: "memo" }, { kind: "stats" }] }, board);
    expect(s.split).toBe(true);
    expect(s.panes).toEqual([{ kind: "script" }, board]);
  });
});

describe("revealScript (구조 보드에서 씬을 눌렀을 때)", () => {
  const board = { kind: "doc", id: "board" } as const;

  it("원고가 이미 보이면 그 화면에 포커스를 준다", () => {
    const s = revealScript({ ...split({ kind: "script" }, board), focus: 1 });
    expect(s.panes).toEqual([{ kind: "script" }, board]);
    expect(s.focus).toBe(0);
  });

  it("나누지 않은 상태에서 구조 보드만 보이면 그 화면에 원고를 연다", () => {
    const s = revealScript({ ...INITIAL_PANES, panes: [board, { kind: "stats" }] });
    expect(s.panes[0]).toEqual({ kind: "script" });
  });

  it("두 화면 모두 원고가 아니면 포커스가 없는 쪽에 원고를 연다", () => {
    const s = revealScript({ ...split(board, { kind: "stats" }), focus: 0 });
    expect(s.panes).toEqual([board, { kind: "script" }]);
    expect(scriptPane(s)).toBe(1);
  });

  it("3막 구조 보드는 덮어쓰지 않고 통계 화면에 원고를 연다", () => {
    const isBoard = (t: { kind: string }) => t.kind === "doc";
    const s = revealScript({ ...split({ kind: "stats" }, board), focus: 0 }, isBoard);
    expect(s.panes).toEqual([{ kind: "script" }, board]);
  });
});

describe("normalizePanes", () => {
  const valid = { docIds: new Set(["a", "b"]), revisionIds: new Set(["r1"]), mainScriptId: "main" };

  it("사라진 문서나 수정고는 원고로 바꾼다", () => {
    const s = normalizePanes(split({ kind: "doc", id: "gone" }, { kind: "revision", id: "gone" }), valid);
    expect(s.panes[0]).toEqual({ kind: "script" });
    // 둘 다 원고가 되면 화면 2는 통계로 바뀐다
    expect(s.panes[1]).toEqual({ kind: "stats" });
  });

  it("원고 문서 id는 원고 화면으로 정리한다", () => {
    const s = normalizePanes(split({ kind: "doc", id: "main" }, { kind: "doc", id: "a" }), valid);
    expect(s.panes).toEqual([{ kind: "script" }, { kind: "doc", id: "a" }]);
  });

  it("문제가 없으면 같은 객체를 돌려준다", () => {
    const s = split({ kind: "script" }, { kind: "doc", id: "a" });
    expect(normalizePanes(s, valid)).toBe(s);
  });
});

describe("저장과 불러오기", () => {
  it("저장한 값을 그대로 불러온다", () => {
    const s: PaneState = { split: true, panes: [{ kind: "script" }, { kind: "doc", id: "x" }], focus: 1, ratio: 0.4 };
    expect(parsePanes(serializePanes(s))).toEqual(s);
  });

  it("망가진 값은 처음 상태로 돌아간다", () => {
    expect(parsePanes("{nope")).toEqual(INITIAL_PANES);
    expect(parsePanes(null)).toEqual(INITIAL_PANES);
    expect(parsePanes('{"panes":[{"kind":"zzz"}]}').panes).toEqual(INITIAL_PANES.panes);
  });

  it("너비 비율은 범위 안으로 맞춘다", () => {
    expect(clampRatio(0.05)).toBe(0.25);
    expect(clampRatio(0.99)).toBe(0.75);
    expect(clampRatio(NaN)).toBe(0.5);
  });
});
