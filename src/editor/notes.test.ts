import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { noteAt, notesField, notesOf, parseNotes, restoreNotes, setNotesEffect, type ScriptNote } from "./notes";

const make = (doc: string, notes: ScriptNote[]) => {
  const state = EditorState.create({ doc, extensions: [notesField] });
  return state.update({ effects: setNotesEffect.of(notes) }).state;
};
const note = (id: string, from: number, to: number, text = "메모"): ScriptNote => ({ id, from, to, quote: "", text });

describe("메모 위치 따라가기", () => {
  const doc = "내부. 집 - 낮\n유리창이 흔들린다.";

  it("앞에서 글을 쓰면 메모 위치도 뒤로 밀린다", () => {
    let state = make(doc, [note("a", 10, 13)]);
    state = state.update({ changes: { from: 0, insert: "XX" } }).state;
    expect(notesOf(state)).toEqual([{ id: "a", from: 12, to: 15, quote: "유리창", text: "메모" }]);
  });

  it("메모가 붙은 글을 모두 지우면 메모도 사라진다", () => {
    let state = make(doc, [note("a", 10, 13)]);
    state = state.update({ changes: { from: 10, to: 13 } }).state;
    expect(notesOf(state)).toEqual([]);
  });

  it("메모 바로 뒤에 이어 써도 밑줄이 늘어나지 않는다", () => {
    let state = make(doc, [note("a", 10, 13)]);
    state = state.update({ changes: { from: 13, insert: "가" } }).state;
    expect(notesOf(state)[0]).toMatchObject({ from: 10, to: 13 });
  });

  it("누른 위치의 메모를 찾는다", () => {
    const state = make(doc, [note("a", 10, 13)]);
    expect(noteAt(state, 11)?.id).toBe("a");
    expect(noteAt(state, 13)).toBeNull();
  });
});

describe("저장한 메모 맞추기", () => {
  it("위치의 글이 같으면 그대로 둔다", () => {
    const n = { id: "a", from: 2, to: 4, quote: "cd", text: "t" };
    expect(restoreNotes("abcde", [n])).toEqual([n]);
  });

  it("글이 밀렸으면 같은 글을 가까운 곳에서 찾는다", () => {
    const n = { id: "a", from: 3, to: 5, quote: "cd", text: "t" };
    expect(restoreNotes("xxabcde cd", [n])[0]).toMatchObject({ from: 4, to: 6 });
  });

  it("글이 없어졌으면 버린다", () => {
    expect(restoreNotes("zzz", [{ id: "a", from: 0, to: 2, quote: "cd", text: "t" }])).toEqual([]);
  });

  it("망가진 저장값은 걸러 낸다", () => {
    expect(parseNotes([{ id: "a", from: 1, to: 3, quote: "q", text: "t" }, { id: "a" }, null, { id: "b", from: 5, to: 2, quote: "", text: "" }])).toHaveLength(1);
    expect(parseNotes("zzz")).toEqual([]);
  });
});
