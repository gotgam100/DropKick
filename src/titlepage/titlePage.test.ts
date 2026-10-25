import { describe, expect, it } from "vitest";
import { fromFountain, toFountain } from "../fountain/fountain";
import { readTitlePage, writeTitlePage } from "./titlePage";

describe("표지", () => {
  it("표지 항목을 읽고, 여러 줄 연락처를 들여쓰기로 쓴다", () => {
    const text = writeTitlePage(
      { title: "드롭킥", credit: "각본", author: "홍길동", source: "", draftDate: "2026-10-25", contact: "010-0000-0000\nme@example.com" },
      null,
    );
    expect(text).toBe(
      ["Title: 드롭킥", "Credit: 각본", "Author: 홍길동", "Draft date: 2026-10-25", "Contact:", "    010-0000-0000", "    me@example.com"].join("\n"),
    );
    expect(readTitlePage(text)).toEqual({
      title: "드롭킥",
      credit: "각본",
      author: "홍길동",
      source: "",
      draftDate: "2026-10-25",
      contact: "010-0000-0000\nme@example.com",
    });
  });

  it("모르는 항목(Notes 등)은 지우지 않고 남긴다", () => {
    const text = writeTitlePage(readTitlePage("Title: A\nNotes: 비밀 메모\nAuthors: B"), "Title: A\nNotes: 비밀 메모\nAuthors: B");
    expect(text).toBe("Title: A\nAuthor: B\nNotes: 비밀 메모");
  });

  it("모두 비우면 표지가 없어진다", () => {
    expect(writeTitlePage(readTitlePage(null), null)).toBeNull();
  });

  it("원고 파일로 저장했다 열어도 표지가 그대로", () => {
    const titlePage = writeTitlePage(
      { title: "드롭킥", credit: "", author: "홍길동", source: "", draftDate: "", contact: "서울\n010" },
      null,
    );
    const doc = { titlePage, lines: [{ style: "scene" as const, text: "내부. 집 - 낮" }] };
    const back = fromFountain(toFountain(doc));
    expect(readTitlePage(back.titlePage)).toEqual(readTitlePage(titlePage));
    expect(back.lines).toEqual(doc.lines);
  });
});
