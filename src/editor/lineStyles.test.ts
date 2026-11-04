import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState, type StateCommand } from "@codemirror/state";
import { history, redo, undo } from "@codemirror/commands";
import { outlineMarkerAt, outlineStyleFor } from "./scriptView";
import {
  characterNames,
  createScriptState,
  cycleLineStyle,
  insertScriptNewline,
  renameCharacter,
  sceneNumbersField,
  sceneBackspaceToAction,
  scriptLines,
  setStyle,
  type ScriptLine,
} from "./lineStyles";
import type { LineStyle } from "./styles";

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

describe("한글 입력 중 Enter로 줄바꿈이 두 번 들어올 때", () => {
  it("글 뒤의 줄바꿈 둘을 하나로 줄이고, 인물 줄 다음은 대사가 된다", () => {
    let state = createScriptState([
      { style: "scene", text: "실내" },
      { style: "character", text: "민재" },
    ]);
    const end = state.doc.length;
    state = state.update({
      changes: { from: end, insert: "\n\n" },
      selection: EditorSelection.cursor(end + 2),
      userEvent: "input.type.compose",
    }).state;
    expect(state.doc.toString()).toBe("실내\n민재\n");
    expect(styles(state)).toEqual(["scene", "character", "dialogue"]);
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("붙여넣기로 들어온 빈 줄은 그대로 둔다", () => {
    let state = createScriptState([{ style: "action", text: "가" }]);
    state = state.update({ changes: { from: 1, insert: "\n\n" }, userEvent: "input.paste" }).state;
    expect(state.doc.toString()).toBe("가\n\n");
  });
});

describe("괄호지문", () => {
  it("글이 있는 줄을 괄호지문으로 바꾸면 괄호로 감싼다", () => {
    let s = createScriptState([{ style: "dialogue", text: "등 돌린 채" }]);
    s = run(at(s, 0), setStyle("parenthetical"));
    expect(scriptLines(s)).toEqual([{ style: "parenthetical", text: "(등 돌린 채)" }]);
  });

  it("이미 괄호가 있으면 그대로 두고, 한쪽만 있으면 모자란 쪽만 채운다", () => {
    let s = createScriptState([
      { style: "dialogue", text: "(웃으며)" },
      { style: "dialogue", text: "(웃으며" },
    ]);
    s = run(at(s, 0), setStyle("parenthetical"));
    s = run(at(s, s.doc.line(2).from), setStyle("parenthetical"));
    expect(scriptLines(s).map((l) => l.text)).toEqual(["(웃으며)", "(웃으며)"]);
  });

  it("빈 줄은 ()로 만들고 커서를 괄호 안에 둔다", () => {
    let s = createScriptState([{ style: "action", text: "" }]);
    s = run(s, setStyle("parenthetical"));
    expect(s.doc.toString()).toBe("()");
    expect(s.selection.main.head).toBe(1);
  });

  it("Tab으로 괄호지문이 될 때도 감싸고, 줄 끝 커서가 유지되어 이어서 Tab을 누를 수 있다", () => {
    let s = createScriptState([{ style: "dialogue", text: "응." }]);
    s = run(at(s, s.doc.length), cycleLineStyle(1));
    expect(scriptLines(s)[0]).toEqual({ style: "parenthetical", text: "(응.)" });
    expect(s.selection.main.head).toBe(s.doc.length);
  });

  it("바뀐 줄을 되돌리면 글과 스타일이 함께 돌아온다", () => {
    let s = createScriptState([{ style: "dialogue", text: "응." }], [history()]);
    s = run(at(s, 0), setStyle("parenthetical"));
    s = run(s, undo);
    expect(scriptLines(s)[0]).toEqual({ style: "dialogue", text: "응." });
  });
});

describe("Enter", () => {
  it("인물 줄 끝에서 Enter → 다음 줄은 대사", () => {
    let s = createScriptState(sample);
    s = at(s, s.doc.line(3).to);
    s = run(s, insertScriptNewline);
    expect(styles(s)).toEqual(["scene", "action", "character", "dialogue", "dialogue"]);
    expect(s.doc.line(4).text).toBe("");
  });

  it("인물 줄에서는 공백이 뒤에 있거나 이름 끝에서도 다음 줄은 대사", () => {
    const custom = [
      { style: "character" as const, text: "은비 " },
    ];
    let s = createScriptState(custom);
    s = at(s, 2); // '은비' 뒤, 공백 앞
    s = run(s, insertScriptNewline);
    expect(styles(s)).toEqual(["character", "dialogue"]);
  });

  it("인물 스타일 줄에서 IME나 일반 줄바꿈이 일어나도 다음 줄은 대사가 된다", () => {
    let s = createScriptState([{ style: "character", text: "민재" }]);
    // setLineStyleEffect 없이 일반 텍스트 변경으로 \n이 들어온 경우 (IME 커밋 또는 브라우저 입력)
    s = s.update({ changes: { from: s.doc.line(1).to, insert: "\n" } }).state;
    expect(styles(s)).toEqual(["character", "dialogue"]);
  });

  it("씬헤딩, 서브헤더, 전환 줄에서 일반 줄바꿈이 일어나도 다음 줄은 액션이 된다", () => {
    let s1 = createScriptState([{ style: "scene", text: "내부. 카페 - 낮" }]);
    s1 = s1.update({ changes: { from: s1.doc.line(1).to, insert: "\n" } }).state;
    expect(styles(s1)).toEqual(["scene", "action"]);

    let s2 = createScriptState([{ style: "subheader", text: "카운터 앞" }]);
    s2 = s2.update({ changes: { from: s2.doc.line(1).to, insert: "\n" } }).state;
    expect(styles(s2)).toEqual(["subheader", "action"]);

    let s3 = createScriptState([{ style: "transition", text: "FADE OUT." }]);
    s3 = s3.update({ changes: { from: s3.doc.line(1).to, insert: "\n" } }).state;
    expect(styles(s3)).toEqual(["transition", "action"]);
  });

  it("씬헤딩 끝 → 액션, 서브 헤더 → 액션, 전환 → 액션, 대사 끝 → 액션", () => {
    let s = createScriptState(sample);
    s = run(at(s, s.doc.line(1).to), insertScriptNewline);
    expect(styles(s)[1]).toBe("action");

    // 서브 헤더에서 Enter → 액션
    let s2 = createScriptState([{ style: "subheader", text: "복도" }]);
    s2 = run(at(s2, s2.doc.length), insertScriptNewline);
    expect(styles(s2)).toEqual(["subheader", "action"]);

    // 전환에서 Enter → 액션
    let s3 = createScriptState([{ style: "transition", text: "CUT TO:" }]);
    s3 = run(at(s3, s3.doc.length), insertScriptNewline);
    expect(styles(s3)).toEqual(["transition", "action"]);

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

  it("⌘6: 현재 줄을 서브 헤더로", () => {
    let s = createScriptState(sample);
    s = run(at(s, s.doc.line(2).from + 1), setStyle("subheader"));
    expect(styles(s)[1]).toBe("subheader");
  });

  it("Tab: 빈 줄에서 다음 스타일로 순환", () => {
    let s = createScriptState([...sample, { style: "action", text: "" }]);
    s = run(at(s, s.doc.length), cycleLineStyle(1));
    expect(styles(s).slice(-1)[0]).toBe("character");
    s = run(s, cycleLineStyle(-1));
    expect(styles(s).slice(-1)[0]).toBe("action");
  });

  it("Tab: 글이 있는 대사 줄 끝에서도 순환하고, 순서는 대사 다음 괄호지문", () => {
    let s = createScriptState(sample);
    s = run(at(s, s.doc.length), cycleLineStyle(1));
    expect(styles(s)[3]).toBe("parenthetical");
    s = run(s, cycleLineStyle(1));
    expect(styles(s)[3]).toBe("subheader");
  });

  it("Tab: 아무것도 안 쓴 괄호지문 ()는 커서가 괄호 안에 있어도 다음 스타일로 넘어가고 괄호는 지운다", () => {
    let s = createScriptState([...sample, { style: "parenthetical", text: "()" }]);
    s = run(at(s, s.doc.length - 1), cycleLineStyle(1));
    expect(styles(s).slice(-1)[0]).toBe("subheader");
    expect(scriptLines(s).slice(-1)[0].text).toBe("");
  });

  it("Tab: 괄호 안에 글을 쓰고 닫는 괄호 바로 앞에서 누르면 다음 스타일로 넘어간다", () => {
    let s = createScriptState([...sample, { style: "parenthetical", text: "(작게)" }]);
    s = run(at(s, s.doc.length - 1), cycleLineStyle(1));
    expect(styles(s).slice(-1)[0]).toBe("subheader");
    // 괄호지문을 벗어나면 바깥 괄호는 지운다
    expect(scriptLines(s).slice(-1)[0].text).toBe("작게");
    // 이어서 Tab을 계속 누를 수 있다
    s = run(s, cycleLineStyle(1));
    expect(styles(s).slice(-1)[0]).toBe("transition");
  });

  it("괄호지문에서 다른 요소로 바꾸면(단축키 포함) 괄호를 지운다", () => {
    let s = createScriptState([{ style: "parenthetical", text: "(숨을 고르며)" }]);
    s = run(at(s, 0), setStyle("dialogue"));
    expect(scriptLines(s)).toEqual([{ style: "dialogue", text: "숨을 고르며" }]);
  });

  it("Tab: 괄호 안 글자 중간에서는 그대로 둔다", () => {
    let s = createScriptState([...sample, { style: "parenthetical", text: "(작게)" }]);
    s = run(at(s, s.doc.length - 2), cycleLineStyle(1));
    expect(styles(s).slice(-1)[0]).toBe("parenthetical");
  });

  it("다음 스타일(메뉴): 커서가 글자 중간에 있어도 넘어간다", () => {
    let s = createScriptState(sample);
    s = run(at(s, s.doc.line(2).from + 2), cycleLineStyle(1, true));
    expect(styles(s)[1]).toBe("character");
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

describe("인물 이름 일괄 바꾸기", () => {
  const script: ScriptLine[] = [
    { style: "scene", text: "내부. 체육관 - 밤" },
    { style: "action", text: "민재가 링 위에 서 있다. 민재는 웃는다." },
    { style: "character", text: "민재" },
    { style: "dialogue", text: "민재, 그게 내 이름이야." },
    { style: "character", text: "민재 (V.O.)" },
    { style: "dialogue", text: "다시." },
    { style: "character", text: "민재석" },
    { style: "dialogue", text: "나는 다른 사람." },
  ];

  it("인물 줄의 이름만 바꾸고 (V.O.)는 남긴다", () => {
    let s = createScriptState(script, [history()]);
    const result = renameCharacter(s, "민재", "준호", false);
    expect([result.characterLines, result.textHits]).toEqual([2, 0]);
    s = s.update({ changes: result.changes }).state;
    expect(scriptLines(s).filter((l) => l.style === "character").map((l) => l.text)).toEqual(["준호", "준호 (V.O.)", "민재석"]);
    expect(scriptLines(s)[1].text).toBe("민재가 링 위에 서 있다. 민재는 웃는다.");
  });

  it("지문·대사 속 이름도 함께 바꿀 수 있고, 한 번에 되돌릴 수 있다", () => {
    let s = createScriptState(script, [history()]);
    const result = renameCharacter(s, "민재", "준호", true);
    expect([result.characterLines, result.textHits]).toEqual([2, 3]);
    s = s.update({ changes: result.changes, userEvent: "rename" }).state;
    expect(scriptLines(s)[1].text).toBe("준호가 링 위에 서 있다. 준호는 웃는다.");
    expect(scriptLines(s)[3].text).toBe("준호, 그게 내 이름이야.");
    s = run(s, undo);
    expect(scriptLines(s)).toEqual(script);
  });

  it("다른 인물 이름 안의 같은 글자(민재석)는 바꾸지 않는다", () => {
    const s = createScriptState([
      { style: "character", text: "민재" },
      { style: "dialogue", text: "민재석 형, 민재가 왔어요." },
    ]);
    const result = renameCharacter(s, "민재", "준호", true, ["민재", "민재석"]);
    const next = s.update({ changes: result.changes }).state;
    expect(scriptLines(next)[1].text).toBe("민재석 형, 준호가 왔어요.");
  });

  it("씬헤딩, 서브헤더, 괄호지문 속 이름도 바꾼다", () => {
    const s = createScriptState([
      { style: "scene", text: "내부. 민재의 방 - 밤" },
      { style: "subheader", text: "민재의 책상" },
      { style: "character", text: "민재" },
      { style: "parenthetical", text: "(민재는 웃으며)" },
      { style: "dialogue", text: "응." },
      { style: "transition", text: "민재 컷 투" },
    ]);
    const result = renameCharacter(s, "민재", "준호", true);
    expect([result.characterLines, result.textHits]).toEqual([1, 3]);
    const next = s.update({ changes: result.changes }).state;
    expect(scriptLines(next).map((l) => l.text)).toEqual([
      "내부. 준호의 방 - 밤",
      "준호의 책상",
      "준호",
      "(준호는 웃으며)",
      "응.",
      "민재 컷 투",
    ]);
  });

  it("영문 이름은 대소문자를 가리지 않는다", () => {
    const s = createScriptState([
      { style: "character", text: "Will" },
      { style: "dialogue", text: "will you?" },
    ]);
    const result = renameCharacter(s, "WILL", "Edward", true);
    expect([result.characterLines, result.textHits]).toEqual([1, 1]);
  });
});

describe("막·장·요약 줄", () => {
  const styles = (s: EditorState) => scriptLines(s).map((l) => l.style);
  const withOutline: ScriptLine[] = [
    { style: "act", text: "1막" },
    { style: "scene", text: "내부. 사무실 - 낮" },
    { style: "synopsis", text: "민재가 등장한다." },
    { style: "action", text: "문이 열린다." },
  ];

  it("# 는 막, ## 는 장, 씬헤딩이나 요약 바로 아래의 = 는 요약이 된다", () => {
    const s = createScriptState(withOutline);
    expect(outlineStyleFor(s, 4, "#")).toBe("act");
    expect(outlineStyleFor(s, 4, "##")).toBe("chapter");
    expect(outlineStyleFor(s, 3, "=")).toBe("synopsis"); // 씬헤딩 아래
    expect(outlineStyleFor(s, 4, "=")).toBe("synopsis"); // 요약 아래
  });

  it("그 밖의 자리·기호는 바뀌지 않는다", () => {
    const s = createScriptState(withOutline);
    expect(outlineStyleFor(s, 1, "=")).toBeNull(); // 첫 줄
    expect(outlineStyleFor(s, 2, "=")).toBeNull(); // 막 아래
    expect(outlineStyleFor(s, 5, "=")).toBeNull(); // 액션 아래
    expect(outlineStyleFor(s, 4, "###")).toBeNull();
    expect(outlineStyleFor(s, 4, "#a")).toBeNull();
    expect(outlineStyleFor(s, 4, "")).toBeNull();
  });

  it("Enter: 막·장·요약 줄 끝에서 새 줄은 액션", () => {
    let s = createScriptState([{ style: "act", text: "1막" }]);
    s = run(at(s, s.doc.length), insertScriptNewline);
    expect(styles(s)).toEqual(["act", "action"]);
    s = createScriptState([{ style: "chapter", text: "시퀀스 A" }]);
    s = run(at(s, s.doc.length), insertScriptNewline);
    expect(styles(s)).toEqual(["chapter", "action"]);

    s = createScriptState([{ style: "scene", text: "내부. 방" }, { style: "synopsis", text: "요약" }]);
    s = run(at(s, s.doc.length), insertScriptNewline);
    expect(styles(s)).toEqual(["scene", "synopsis", "action"]);
  });

  it("Enter: 요약 줄 중간에서는 같은 요약 줄로 나뉜다", () => {
    let s = createScriptState([{ style: "scene", text: "내부. 방" }, { style: "synopsis", text: "앞뒤" }]);
    s = run(at(s, s.doc.line(2).from + 1), insertScriptNewline);
    expect(styles(s)).toEqual(["scene", "synopsis", "synopsis"]);
    expect(scriptLines(s).map((l) => l.text)).toEqual(["내부. 방", "앞", "뒤"]);
  });

  it("Tab: 막·장·요약 줄에서는 액션에서 시작한 것처럼 다음 스타일(인물)로 넘어간다", () => {
    let s = createScriptState([{ style: "scene", text: "내부. 방" }, { style: "synopsis", text: "" }]);
    s = run(at(s, s.doc.length), cycleLineStyle(1));
    expect(styles(s)).toEqual(["scene", "character"]);
  });

  it("씬 번호는 막·장·요약 줄을 건너뛰고 씬헤딩만 센다", () => {
    const s = createScriptState(withOutline);
    expect([...s.field(sceneNumbersField).values()].map((n) => `${n.line}:${n.number}`)).toEqual(["2:1"]);
  });

  it("커서 줄이 정확히 `## `이면 입력기와 상관없이 장으로 알아본다", () => {
    const at3 = (text: string, lines: ScriptLine[] = [{ style: "action", text }]) => {
      const st = createScriptState(lines);
      return st.update({ selection: EditorSelection.cursor(st.doc.line(st.doc.lines).to) }).state;
    };
    expect(outlineMarkerAt(at3("# "))).toMatchObject({ style: "act" });
    expect(outlineMarkerAt(at3("## "))).toMatchObject({ style: "chapter", from: 0, to: 3 });
    expect(outlineMarkerAt(at3("### "))).toBeNull();
    expect(outlineMarkerAt(at3("## 글"))).toBeNull();
    expect(outlineMarkerAt(at3("##"))).toBeNull();
    // 요약은 씬헤딩 아래에서만
    expect(outlineMarkerAt(at3("", [{ style: "scene", text: "A" }, { style: "action", text: "= " }]))).toMatchObject({ style: "synopsis" });
    expect(outlineMarkerAt(at3("= "))).toBeNull();
  });

  it("띄어쓰기 키를 막 눌렀을 때는 `##`만 있어도 장으로 알아본다 (입력기가 띄어쓰기를 글자로 안 넣는 경우)", () => {
    const state = (text: string) => {
      const st = createScriptState([{ style: "action", text }]);
      return st.update({ selection: EditorSelection.cursor(st.doc.length) }).state;
    };
    expect(outlineMarkerAt(state("##"), true)).toMatchObject({ style: "chapter", from: 0, to: 2 });
    expect(outlineMarkerAt(state("#"), true)).toMatchObject({ style: "act" });
    expect(outlineMarkerAt(state("##"))).toBeNull(); // 띄어쓰기를 안 눌렀으면 그대로
    expect(outlineMarkerAt(state("### "), true)).toBeNull();
    expect(outlineMarkerAt(state("#a"), true)).toBeNull();
  });
});

describe("씬헤딩 맨 앞에서 Backspace", () => {
  it("앞 줄과 합치지 않고 액션으로 바꾼다", () => {
    let s = createScriptState([
      { style: "action", text: "앞 줄" },
      { style: "scene", text: "내부. 거실 - 낮" },
    ]);
    s = run(at(s, s.doc.line(2).from), sceneBackspaceToAction);
    expect(scriptLines(s)).toEqual([
      { style: "action", text: "앞 줄" },
      { style: "action", text: "내부. 거실 - 낮" },
    ]);
  });

  it("줄 중간이거나 씬헤딩이 아니면 손대지 않는다", () => {
    let s = createScriptState([{ style: "scene", text: "내부. 거실 - 낮" }]);
    expect(sceneBackspaceToAction({ state: at(s, 3), dispatch: () => {} })).toBe(false);
    s = createScriptState([{ style: "action", text: "글" }]);
    expect(sceneBackspaceToAction({ state: at(s, 0), dispatch: () => {} })).toBe(false);
  });
});

describe("줄 맨 앞에서 Enter", () => {
  const cases: [LineStyle | "act" | "chapter", string][] = [
    ["scene", "내부. 거실 - 낮"],
    ["action", "글"],
    ["character", "민재"],
    ["parenthetical", "(웃으며)"],
    ["dialogue", "글"],
    ["subheader", "플래시백"],
    ["transition", "CUT TO:"],
    ["act", "1막"],
    ["chapter", "시퀀스 A"],
  ];
  it.each(cases)("%s: 글이 아래로 밀려도 원래 요소를 지킨다", (style, text) => {
    let s = createScriptState([{ style: style as ScriptLine["style"], text }]);
    s = run(at(s, 0), insertScriptNewline);
    // 씬헤딩만 위 빈 줄이 액션이 된다.
    expect(scriptLines(s)).toEqual([
      { style: style === "scene" ? "action" : style, text: "" },
      { style, text },
    ]);
  });

  it("글 끝이나 빈 줄에서는 이전처럼 다음 요소로 넘어간다", () => {
    let s = createScriptState([{ style: "scene", text: "내부. 거실 - 낮" }]);
    s = run(at(s, s.doc.length), insertScriptNewline);
    expect(scriptLines(s)[1].style).toBe("action");
    s = createScriptState([{ style: "character", text: "민재" }]);
    s = run(at(s, s.doc.length), insertScriptNewline);
    expect(scriptLines(s)[1].style).toBe("dialogue");
  });
});
