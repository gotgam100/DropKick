import { describe, expect, it } from "vitest";
import { PAGE } from "../layout/paginate";
import { coverLines, sampleBody, watermarkMarks } from "./previewLayout";
import { EMPTY_TITLE_PAGE } from "./titlePage";

const fields = { ...EMPTY_TITLE_PAGE, title: "드롭킥", author: "홍길동", draftDate: "1고", contact: "010-0000-0000\nme@example.com" };

describe("표지 미리보기 배치", () => {
  it("제목은 쪽 위 1/3 지점에 3pt 키운 굵은 글씨로, 작가는 그 아래 가운데, 날짜와 연락처는 맨 아래 오른쪽 정렬", () => {
    const lines = coverLines(fields, new Set());
    const row = Math.round(PAGE.linesPerPage / 3);
    expect(lines[0]).toMatchObject({ text: "드롭킥", row, align: "center", bold: true, scale: 15 / 12 });
    expect(lines[1]).toMatchObject({ text: "홍길동", row: row + 2, align: "center", bold: false });
    const bottom = lines.slice(2);
    expect(bottom.map((l) => l.text)).toEqual(["1고", "010-0000-0000", "me@example.com"]);
    expect(bottom.map((l) => l.row)).toEqual([PAGE.linesPerPage - 3, PAGE.linesPerPage - 2, PAGE.linesPerPage - 1]);
    expect(bottom.every((l) => l.align === "end" && l.column === PAGE.bodyColumns)).toBe(true);
  });

  it("원작은 제목과 작가 사이에 놓인다", () => {
    const lines = coverLines({ ...fields, source: "단편소설 「외장하드」" }, new Set());
    expect(lines.slice(0, 3).map((l) => l.text)).toEqual(["드롭킥", "단편소설 「외장하드」", "홍길동"]);
    // 부제·원작은 제목 바로 아래 한 줄만 띄우고 놓인다
    expect(lines[1].row).toBe(lines[0].row + 2);
    // 부제·원작과 작가 사이는 빈 줄 두 줄
    expect(lines[2].row).toBe(lines[1].row + 3);
  });

  it("끈 항목과 빈 항목은 자리를 차지하지 않는다", () => {
    const lines = coverLines(fields, new Set(["author", "contact"]));
    expect(lines.map((l) => l.text)).toEqual(["드롭킥", "1고"]);
  });

  it("모두 끄면 아무것도 없다", () => {
    expect(coverLines(fields, new Set(["title", "author", "draftDate", "contact"]))).toEqual([]);
  });
});

describe("워터마크 미리보기 배치", () => {
  it("글이 비어 있으면 찍지 않는다", () => {
    expect(watermarkMarks("   ").marks).toEqual([]);
  });

  it("쪽 전체를 격자로 덮고, 긴 글은 글자를 줄인다", () => {
    const short = watermarkMarks("홍길동 전용");
    const long = watermarkMarks("홍길동 전용 · 외부 유출 금지 · 무단 복제와 배포를 금합니다");
    expect(short.marks.length).toBeGreaterThan(4);
    expect(long.marks[0].size).toBeLessThan(short.marks[0].size);
  });
});

describe("본문 예시 쪽", () => {
  it("기본은 막·장·요약 없이 씬헤딩(번호 포함), 액션, 인물, 대사만 보인다", () => {
    const texts = sampleBody().map((l) => l.text);
    expect(texts[0]).toBe("1 실내. 사무실 - 낮");
    expect(texts.some((t) => t.includes("1막") || t.includes("시퀀스") || t.includes("요약"))).toBe(false);
  });

  it("막·장을 넣으면 맨 위에 굵게, 요약을 넣으면 회색으로 보인다", () => {
    const body = sampleBody({ sections: true, synopsis: true });
    expect(body[0]).toMatchObject({ text: "1막: 코끼리 우리", bold: true, row: 0 });
    expect(body[1]).toMatchObject({ text: "시퀀스 A: 조련사의 하루", bold: true });
    const synopsis = body.find((l) => l.gray);
    expect(synopsis?.text).toContain("사무실의 대화");
  });
});
