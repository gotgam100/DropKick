import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type StateCommand } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import {
  characterNames,
  createScriptState,
  cycleLineStyle,
  insertScriptNewline,
  sceneNumbersField,
  scriptLines,
  setStyle,
  type ScriptLine,
} from "./lineStyles";

const sample: ScriptLine[] = [
  { style: "scene", text: "S#1. 내부. 체육관 - 밤" },
  { style: "action", text: "민재가 링 위에 서 있다." },
  { style: "character", text: "민재" },
  { style: "dialogue", text: "딱 한 번만 더." },
];

function run(state: EditorState, command: StateCommand): EditorState {
  let next = state;
  command({ state, dispatch: (tr) => (next = tr.state) });
  return next;
}

function at(state: EditorState, pos: number): EditorState {
  return state.update({ selection: EditorSelection.cursor(pos) }).state;
}

function styles(state: EditorState) {
  return scriptLines(state).map((l) => l.style);
}

describe("Enter", () => {
  it("인물 줄 끝에서 Enter → 다음 줄은 대사", () => {
    let s = createScriptState(sample);
    s = at(s, s.doc.line(3).to);
    s = run(s, insertScriptNewline);
    expect(styles(s)).toEqual(["scene", "action", "character", "dialogue", "dialogue"]);
    expect(s.doc.line(4).text).toBe("");
  });

  it("씬헤딩 끝 → 액션, 대사 끝 → 액션", () => {
    let s = createScriptState(sample);
    s = run(at(s, s.doc.line(1).to), insertScriptNewline);
    expect(styles(s)[1]).toBe("action");
    s = run(at(s, s.doc.length), insertScriptNewline);
    expect(styles(s).slice(-1)[0]).toBe("action");
  });

  it("줄 중간에서 Enter → 같은 스타일로 나뉨", () => {
    let s = createScriptState(sample);
    s = run(at(s, s.doc.line(2).from + 3), insertScriptNewline);
    expect(styles(s)).toEqual(["scene", "action", "action", "character", "dialogue"]);
  });
});

describe("글 수정에 따른 스타일 유지", () => {
  it("줄 전체를 지우면 아래 줄 스타일이 올라온다", () => {
    let s = createScriptState(sample);
    const line2 = s.doc.line(2);
    s = s.update({ changes: { from: line2.from, to: s.doc.line(3).from } }).state;
    expect(scriptLines(s)).toEqual([sample[0], sample[2], sample[3]]);
  });

  it("줄 맨 앞에서 지우기(줄 합치기) → 위 줄 스타일 유지", () => {
    let s = createScriptState(sample);
    const from = s.doc.line(3).from;
    s = s.update({ changes: { from: from - 1, to: from } }).state;
    expect(styles(s)).toEqual(["scene", "action", "dialogue"]);
    expect(s.doc.line(2).text).toBe("민재가 링 위에 서 있다.민재");
  });

  it("여러 줄 붙여넣기 → 가운데 줄은 액션", () => {
    let s = createScriptState(sample);
    const pos = s.doc.line(4).to;
    s = s.update({ changes: { from: pos, insert: "\n가\n나\n다" } }).state;
    expect(styles(s)).toEqual([
      "scene",
      "action",
      "character",
      "dialogue",
      "action",
      "action",
      "dialogue",
    ]);
  });

  it("글자만 바꾸면 스타일 그대로", () => {
    let s = createScriptState(sample);
    s = s.update({ changes: { from: s.doc.line(3).from, insert: "김" } }).state;
    expect(styles(s)).toEqual(sample.map((l) => l.style));
  });
});

describe("스타일 지정", () => {
  it("⌘3: 현재 줄을 인물로", () => {
    let s = createScriptState(sample);
    s = run(at(s, s.doc.line(2).from + 1), setStyle("character"));
    expect(styles(s)[1]).toBe("character");
  });

  it("Tab: 빈 줄에서 다음 스타일로 순환", () => {
    let s = createScriptState([...sample, { style: "action", text: "" }]);
    s = run(at(s, s.doc.length), cycleLineStyle(1));
    expect(styles(s).slice(-1)[0]).toBe("character");
    s = run(s, cycleLineStyle(-1));
    expect(styles(s).slice(-1)[0]).toBe("action");
  });

  it("Tab: 글자 중간에서는 스타일을 바꾸지 않는다", () => {
    let s = createScriptState(sample);
    s = run(at(s, s.doc.line(2).from + 2), cycleLineStyle(1));
    expect(styles(s)[1]).toBe("action");
  });
});

describe("되돌리기", () => {
  const withHistory = (lines: ScriptLine[]) => createScriptState(lines, [history()]);

  it("스타일만 바꾼 것을 ⌘Z로 되돌리고 ⇧⌘Z로 다시 실행", () => {
    let s = withHistory(sample);
    s = run(at(s, s.doc.line(2).from), setStyle("scene"));
    expect(styles(s)[1]).toBe("scene");
    s = run(s, undo);
    expect(styles(s)[1]).toBe("action");
    s = run(s, redo);
    expect(styles(s)[1]).toBe("scene");
  });

  it("지운 줄을 되살리면 그 줄의 스타일도 돌아온다", () => {
    let s = withHistory(sample);
    s = s.update({
      changes: { from: s.doc.line(3).from, to: s.doc.line(4).from },
    }).state;
    expect(styles(s)).toEqual(["scene", "action", "dialogue"]);
    s = run(s, undo);
    expect(scriptLines(s)).toEqual(sample);
  });

  it("Enter를 되돌리면 원래대로", () => {
    let s = withHistory(sample);
    s = run(at(s, s.doc.line(3).to), insertScriptNewline);
    s = run(s, undo);
    expect(scriptLines(s)).toEqual(sample);
    s = run(s, redo);
    expect(styles(s)).toEqual(["scene", "action", "character", "dialogue", "dialogue"]);
  });
});

describe("씬 번호", () => {
  const numbers = (s: EditorState) =>
    [...s.field(sceneNumbersField).values()].map((v) => `${v.number}${v.manual ? "*" : ""}`);

  it("씬헤딩마다 1, 2, 3 자동 번호", () => {
    const s = createScriptState([
      { style: "scene", text: "내부. 체육관 - 밤" },
      { style: "action", text: "..." },
      { style: "scene", text: "외부. 골목 - 밤" },
      { style: "scene", text: "내부. 집 - 낮" },
    ]);
    expect(numbers(s)).toEqual(["1", "2", "3"]);
  });

  it("직접 쓴 번호가 있으면 그 다음부터 이어서", () => {
    const s = createScriptState([
      { style: "scene", text: "내부. 체육관 - 밤" },
      { style: "scene", text: "S#10. 외부. 골목 - 밤" },
      { style: "scene", text: "내부. 집 - 낮" },
    ]);
    expect(numbers(s)).toEqual(["1", "10*", "11"]);
  });

  it("중간에 씬을 넣으면 뒤 번호가 다시 매겨진다", () => {
    let s = createScriptState([
      { style: "scene", text: "내부. 체육관 - 밤" },
      { style: "action", text: "민재가 서 있다." },
      { style: "scene", text: "외부. 골목 - 밤" },
    ]);
    s = run(at(s, s.doc.line(2).from), setStyle("scene"));
    expect(numbers(s)).toEqual(["1", "2", "3"]);
  });
});

describe("인물 이름", () => {
  it("인물 스타일 줄에서 괄호를 뗀 이름을 모은다", () => {
    const s = createScriptState([
      { style: "character", text: "민재" },
      { style: "dialogue", text: "안녕." },
      { style: "character", text: "수아 (V.O.)" },
      { style: "character", text: "민재 (계속)" },
      { style: "action", text: "민재" },
    ]);
    expect(characterNames(s)).toEqual(["민재", "수아"]);
  });
});
