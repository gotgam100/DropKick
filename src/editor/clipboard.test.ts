import { describe, expect, it } from "vitest";
import { history, redo, undo } from "@codemirror/commands";
import {
  createScriptState,
  lineStylesField,
  type ScriptLine,
} from "./lineStyles";
import {
  extractSelectedLines,
  createPasteTransaction,
} from "./clipboard";

describe("스크립트 복사 및 붙여넣기 스타일 유지 (clipboard)", () => {
  it("여러 줄의 다양한 스타일을 복사할 때 줄별 스타일이 정확히 추출된다", () => {
    const lines: ScriptLine[] = [
      { style: "scene", text: "내부. 포장마차 - 저녁" },
      { style: "action", text: "창밖으로 버스가 지나간다." },
      { style: "character", text: "민재" },
      { style: "parenthetical", text: "(울먹이며)" },
      { style: "dialogue", text: "그만하자, 이제." },
      { style: "transition", text: "암전." },
    ];
    const state = createScriptState(lines);

    // 전체 선택
    const extracted = extractSelectedLines(
      state.doc,
      state.field(lineStylesField),
      0,
      state.doc.length,
    );

    expect(extracted).not.toBeNull();
    expect(extracted?.styles).toEqual([
      "scene",
      "action",
      "character",
      "parenthetical",
      "dialogue",
      "transition",
    ]);
    expect(extracted?.text).toContain("포장마차");
    expect(extracted?.text).toContain("암전.");
  });

  it("일부 줄(인물 + 괄호지문 + 대사)을 복사해서 붙여넣었을 때 스타일이 완벽히 유지된다", () => {
    const lines: ScriptLine[] = [
      { style: "scene", text: "내부. 포장마차 - 저녁" },
      { style: "character", text: "민재" },
      { style: "parenthetical", text: "(울먹이며)" },
      { style: "dialogue", text: "그만하자." },
      { style: "action", text: "끝." },
      { style: "action", text: "" }, // 붙여넣을 빈 줄
    ];
    let state = createScriptState(lines);

    // 민재 ~ 그만하자. (줄 2부터 줄 4까지) 선택하여 추출
    const line2 = state.doc.line(2);
    const line4 = state.doc.line(4);
    const payload = extractSelectedLines(
      state.doc,
      state.field(lineStylesField),
      line2.from,
      line4.to,
    );
    expect(payload).not.toBeNull();
    expect(payload?.styles).toEqual(["character", "parenthetical", "dialogue"]);

    // 6번째 빈 줄에 붙여넣기
    const line6 = state.doc.line(6);
    const tr = createPasteTransaction(state, payload!, line6.from, line6.to);
    state = tr.state;

    const stylesAfter = state.field(lineStylesField);
    // 원래 줄 1~5 유지, 줄 6, 7, 8에 character, parenthetical, dialogue가 적용됨
    expect(stylesAfter[0]).toBe("scene");
    expect(stylesAfter[1]).toBe("character");
    expect(stylesAfter[2]).toBe("parenthetical");
    expect(stylesAfter[3]).toBe("dialogue");
    expect(stylesAfter[4]).toBe("action");
    expect(stylesAfter[5]).toBe("character");
    expect(stylesAfter[6]).toBe("parenthetical");
    expect(stylesAfter[7]).toBe("dialogue");

    expect(state.doc.line(6).text).toBe("민재");
    expect(state.doc.line(7).text).toBe("(울먹이며)");
    expect(state.doc.line(8).text).toBe("그만하자.");
  });

  it("붙여넣기 후 ⌘Z(실행 취소) 시 이전 텍스트와 스타일이 완벽히 복원된다", () => {
    const lines: ScriptLine[] = [
      { style: "scene", text: "내부. 포장마차 - 저녁" },
      { style: "character", text: "민재" },
      { style: "dialogue", text: "그만하자." },
      { style: "action", text: "기존 액션 줄" },
    ];
    let state = createScriptState(lines, [history()]);

    // 인물 + 대사 복사
    const line2 = state.doc.line(2);
    const line3 = state.doc.line(3);
    const payload = extractSelectedLines(
      state.doc,
      state.field(lineStylesField),
      line2.from,
      line3.to,
    )!;

    // 문서 맨 끝에 새 줄로 붙여넣기
    const tr1 = state.update({
      changes: { from: state.doc.length, insert: "\n" },
      selection: { anchor: state.doc.length + 1 },
    });
    state = tr1.state;

    // 붙여넣기 트랜잭션 실행
    const trPaste = createPasteTransaction(state, payload, state.doc.length, state.doc.length);
    state = trPaste.state;

    // 붙여넣은 결과 확인 (5번째 줄 character, 6번째 줄 dialogue)
    expect(state.field(lineStylesField)[4]).toBe("character");
    expect(state.field(lineStylesField)[5]).toBe("dialogue");

    // 실행 취소 (undo)
    let undoneState = state;
    undo({
      state,
      dispatch: (tr) => {
        undoneState = tr.state;
      },
    });

    // 붙여넣기 전(줄 4개 + 빈 줄 1개) 상태로 되돌아갔는지 확인
    expect(undoneState.doc.lines).toBe(5);
    expect(undoneState.field(lineStylesField)[3]).toBe("action");

    // 다시 실행 (redo)
    let redoneState = undoneState;
    redo({
      state: undoneState,
      dispatch: (tr) => {
        redoneState = tr.state;
      },
    });
    expect(redoneState.field(lineStylesField)[4]).toBe("character");
    expect(redoneState.field(lineStylesField)[5]).toBe("dialogue");
  });

  it("단일 줄 전체(씬헤딩)를 복사해서 빈 줄에 붙여넣을 때 씬헤딩 스타일이 유지된다", () => {
    const lines: ScriptLine[] = [
      { style: "scene", text: "내부. 포장마차 - 저녁" },
      { style: "action", text: "지문 내용" },
      { style: "action", text: "" },
    ];
    let state = createScriptState(lines);

    // 씬헤딩 전체 복사
    const line1 = state.doc.line(1);
    const payload = extractSelectedLines(
      state.doc,
      state.field(lineStylesField),
      line1.from,
      line1.to,
    )!;
    expect(payload.styles).toEqual(["scene"]);

    // 3번째 빈 줄에 붙여넣기
    const line3 = state.doc.line(3);
    const tr = createPasteTransaction(state, payload, line3.from, line3.to);
    state = tr.state;

    expect(state.field(lineStylesField)[2]).toBe("scene");
    expect(state.doc.line(3).text).toBe("내부. 포장마차 - 저녁");
  });

  it("선택 영역의 끝이 다음 줄 시작점에 걸칠 때 빈 줄이 추가되지 않고 정확한 줄 수만 복사된다", () => {
    const lines: ScriptLine[] = [
      { style: "character", text: "민재" },
      { style: "dialogue", text: "대사 내용" },
      { style: "action", text: "액션" },
    ];
    const state = createScriptState(lines);

    // 줄 1 전체(개행문자 포함하여 줄 2의 시작점까지)를 드래그한 경우
    const line1 = state.doc.line(1);
    const line2 = state.doc.line(2);
    const payload = extractSelectedLines(
      state.doc,
      state.field(lineStylesField),
      line1.from,
      line2.from,
    )!;

    // 줄 1개만 복사되어야 함
    expect(payload.styles).toEqual(["character"]);
    expect(payload.text).toBe("민재\n");
  });
});
