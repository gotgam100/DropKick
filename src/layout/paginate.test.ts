import { describe, expect, it } from "vitest";
import type { ScriptLine } from "../editor/lineStyles";
import { textColumns, wrapText } from "./metrics";
import { PAGE, paginate } from "./paginate";

describe("글자 폭", () => {
  it("영문 1칸, 한글 11pt ÷ 7.2pt ≈ 1.53칸", () => {
    expect(textColumns("ABC")).toBe(3);
    expect(textColumns("가나다")).toBeCloseTo(3 * (11 / 7.2));
    expect(textColumns("é…")).toBe(2);
  });

  it("어절 단위로 줄을 나눈다", () => {
    // 대사 폭 35칸 = 한글 22자
    const text = "가".repeat(10) + " " + "나".repeat(11) + " " + "다".repeat(10);
    expect(wrapText(text, 35)).toEqual(["가".repeat(10) + " " + "나".repeat(11), "다".repeat(10)]);
  });

  it("단어 뒤 띄어쓰기 한 칸까지 들어가야 그 줄에 둔다 (화면과 같은 규칙)", () => {
    // "AAAAA BBBB"는 딱 10칸이지만 뒤에 띄어쓰기가 오므로 BBBB는 다음 줄로
    expect(wrapText("AAAAA BBBB C", 10)).toEqual(["AAAAA", "BBBB C"]);
    // 문단 마지막 단어는 뒤에 띄어쓰기가 없으니 딱 맞으면 들어간다
    expect(wrapText("AAAAA BBBB", 10)).toEqual(["AAAAA BBBB"]);
  });

  it("너무 긴 어절은 글자 단위로 자른다", () => {
    expect(wrapText("가".repeat(30), 35)).toEqual(["가".repeat(22), "가".repeat(8)]);
  });
});

const action = (text: string): ScriptLine => ({ style: "action", text });
const repeat = (n: number, make: (i: number) => ScriptLine[]) =>
  Array.from({ length: n }, (_, i) => make(i)).flat();

function rowsOf(lines: ScriptLine[]) {
  return paginate(lines).pages.map((p) => p.lines.map((l) => `${l.row}:${l.style}:${l.text}`));
}

describe("페이지 나누기", () => {
  it("빈 줄 규칙: 이어지는 액션은 붙이고, 씬헤딩 앞은 한 줄 띄운다", () => {
    const rows = rowsOf([
      { style: "scene", text: "int. 체육관 - 밤" },
      action("하나"),
      action("둘"),
      { style: "character", text: "minjae" },
      { style: "dialogue", text: "대사" },
      { style: "transition", text: "cut to:" },
    ]);
    expect(rows[0]).toEqual([
      "0:scene:INT. 체육관 - 밤",
      "2:action:하나",
      "3:action:둘",
      "5:character:MINJAE",
      "6:dialogue:대사",
      "8:transition:CUT TO:",
    ]);
  });

  // 이어지는 액션 n줄 = 페이지의 0 ~ n-1번째 줄을 정확히 채운다.
  const fill = (n: number) => repeat(n, (i) => [action(`채움 ${i}`)]);
  // 한 페이지 줄 수 (줄 간격 설정에 따라 바뀐다)
  const N = PAGE.linesPerPage;

  it("한 페이지 줄 수를 넘으면 다음 페이지, 페이지 맨 위 빈 줄은 없앤다", () => {
    const { pages } = paginate([...fill(N), { style: "transition", text: "CUT TO:" }]);
    expect(pages.length).toBe(2);
    expect(pages[0].lines.at(-1)?.row).toBe(N - 1);
    expect(pages[1].lines[0]).toMatchObject({ row: 0, style: "transition" });
  });

  it("씬헤딩은 페이지 끝에 혼자 남지 않는다", () => {
    // 씬헤딩은 끝에서 두 번째 줄에 들어가지만, 다음 인물 이름이 넘친다.
    const { pages } = paginate([
      ...fill(N - 3),
      { style: "scene", text: "외부. 골목 - 밤" },
      { style: "character", text: "수아" },
      { style: "dialogue", text: "비." },
    ]);
    expect(pages[0].lines.at(-1)?.text).toBe(`채움 ${N - 4}`);
    expect(pages[1].lines[0]).toMatchObject({ row: 0, style: "scene" });
  });

  it("긴 대사는 문장 끝에서 나누고 (MORE) / (CONT'D)를 붙인다", () => {
    const sentence = "이건 정말 긴 대사의 한 문장입니다.";
    const speech: ScriptLine[] = [
      { style: "character", text: "민재" },
      ...repeat(8, () => [{ style: "dialogue" as const, text: sentence }]),
    ];
    const { pages } = paginate([...fill(N - 6), ...speech]);
    const p1 = pages[0].lines;
    const p2 = pages[1].lines;
    expect(p1.slice(-5).map((l) => `${l.row}:${l.style}`)).toEqual([
      `${N - 5}:character`,
      `${N - 4}:dialogue`,
      `${N - 3}:dialogue`,
      `${N - 2}:dialogue`,
      `${N - 1}:more`,
    ]);
    expect(p1.at(-1)?.text).toBe("(MORE)");
    expect(p2[0]).toMatchObject({ row: 0, style: "character", text: "민재 (CONT'D)" });
    expect(p2.filter((l) => l.style === "dialogue")).toHaveLength(5);
  });

  it("대사가 1줄만 남게 되면 나누지 않고 통째로 넘긴다", () => {
    const sentence = "이건 정말 긴 대사의 한 문장입니다.";
    const speech: ScriptLine[] = [
      { style: "character", text: "은비" },
      ...repeat(4, () => [{ style: "dialogue" as const, text: sentence }]),
    ];
    // 이름 + 대사 1줄 + (MORE)까지만 들어가는 자리
    const { pages } = paginate([...fill(N - 4), ...speech]);
    expect(pages[0].lines).toHaveLength(N - 4);
    expect(pages[1].lines[0]).toMatchObject({ row: 0, style: "character", text: "은비" });
  });

  it("인물 이름만 페이지 끝에 남지 않는다", () => {
    const { pages } = paginate([
      ...fill(N - 2),
      { style: "character", text: "수아" },
      { style: "dialogue", text: "짧은 대사." },
    ]);
    expect(pages[0].lines).toHaveLength(N - 2);
    expect(pages[1].lines[0]).toMatchObject({ row: 0, style: "character", text: "수아" });
  });

  it("원고 줄마다 시작 페이지를 알려 준다", () => {
    const lines = repeat(N + 6, (i) => [action(`액션 ${i}`)]);
    const { pageOfLine, pages } = paginate(lines);
    expect(pages.length).toBe(2);
    expect(pageOfLine[0]).toBe(1);
    expect(pageOfLine[N - 1]).toBe(1);
    expect(pageOfLine[N]).toBe(2);
  });

  it("여러 줄짜리 액션 문단은 중간에서 나누지 않고 통째로 넘긴다", () => {
    const long = action("긴 액션 문단. ".repeat(20)); // 여러 줄로 감기는 한 문단
    const { pages, breaks } = paginate([...fill(N - 3), long]);
    expect(pages[0].lines).toHaveLength(N - 3);
    expect(pages[1].lines.every((l) => l.source === N - 2)).toBe(true);
    expect(breaks[0]).toMatchObject({ page: 2, beforeLine: N - 2, usedRows: N - 3, more: false });
  });

  it("대사는 대사 줄과 줄 사이에서만 나누고, 경계 정보에 (MORE)/(CONT'D)를 담는다", () => {
    const longLine = "아주 긴 대사가 이어집니다. ".repeat(4); // 한 대사 줄이 여러 줄로 감긴다
    const speech: ScriptLine[] = [
      { style: "character", text: "민재" },
      { style: "dialogue", text: longLine },
      { style: "dialogue", text: longLine },
      { style: "dialogue", text: longLine },
    ];
    const { pages, breaks } = paginate([...fill(N - 9), ...speech]);
    const p1 = pages[0].lines;
    // 앞 페이지의 마지막 대사 줄은 통째로 들어가 있어야 한다.
    const lastSource = p1[p1.length - 2].source;
    expect(pages[1].lines.some((l) => l.source === lastSource)).toBe(false);
    expect(p1.at(-1)?.text).toBe("(MORE)");
    expect(breaks[0]).toMatchObject({ page: 2, more: true, contd: "민재 (CONT'D)", usedRows: p1.at(-1)!.row + 1 });
  });

  it("줄 간격 1.3배: 한 페이지 41줄", () => {
    expect(N).toBe(41);
  });
});
