import { describe, expect, it } from "vitest";
import type { ScriptLine } from "../editor/lineStyles";
import { textColumns, wrapChars, wrapText } from "./metrics";
import { PAGE, outlineGap, outlineRows, paginate, wrapFor } from "./paginate";

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

describe("막·장·요약 줄 (인쇄되지 않는 줄)", () => {
  const scene = (text: string): ScriptLine => ({ style: "scene", text });
  const act = (text: string): ScriptLine => ({ style: "act", text });
  const chapter = (text: string): ScriptLine => ({ style: "chapter", text });
  const synopsis = (text: string): ScriptLine => ({ style: "synopsis", text });

  const base = [scene("내부. 사무실 - 낮"), action("민재가 들어온다."), scene("외부. 거리 - 밤"), action("비가 온다.")];
  const withOutline = [
    act("1막"),
    chapter("시퀀스 A"),
    scene("내부. 사무실 - 낮"),
    synopsis("민재가 처음 등장한다."),
    action("민재가 들어온다."),
    scene("외부. 거리 - 밤"),
    synopsis("비 오는 밤의 거리."),
    synopsis("두 번째 줄 요약."),
    action("비가 온다."),
  ];

  const printed = (lines: ScriptLine[]) =>
    paginate(lines).pages.map((p) => p.lines.map((l) => `${l.row}:${l.style}:${l.text}`));

  it("있어도 인쇄되는 줄의 페이지·줄 위치는 그대로다", () => {
    expect(printed(withOutline)).toEqual(printed(base));
  });

  it("긴 원고에 끼워도 페이지 수와 쪽 나눔이 같다", () => {
    const body = repeat(40, (i) => [scene(`내부. 방${i} - 낮`), action("가나다 ".repeat(30).trim()), action("라마바")]);
    const mixed = body.flatMap((l, i) => (l.style === "scene" && i % 3 === 0 ? [act(`막 ${i}`), l, synopsis("요약 한 줄")] : [l]));
    const a = paginate(body);
    const b = paginate(mixed);
    expect(b.pages.length).toBe(a.pages.length);
    expect(b.pages.map((p) => p.lines.map((l) => l.text))).toEqual(a.pages.map((p) => p.lines.map((l) => l.text)));
  });

  it("막·장·요약 줄은 앞뒤 인쇄되는 줄 사이에 빈 줄을 더하지 않는다", () => {
    const { pages } = paginate([scene("내부. 방 - 낮"), synopsis("요약"), action("지문")]);
    // 씬헤딩 0줄, (요약은 계산 밖), 액션은 앞 빈 줄 1 + 1줄 = 2줄째
    expect(pages[0].lines.map((l) => l.row)).toEqual([0, 2]);
  });

  it("화면에서 막·장·요약 줄 위에는 한 줄씩 띄운다 (첫 줄과 이어지는 요약은 제외, 막 바로 아래의 장은 반 줄)", () => {
    const lines: ScriptLine[] = [act("1막"), chapter("장"), scene("내부. 방 - 낮"), synopsis("a"), synopsis("b"), action("본문")];
    expect([0, 1, 3, 4].map((i) => outlineGap(lines, i))).toEqual([0, 0.5, 1, 0]);
    // 막(첫 줄, 1줄) + 장(막 바로 아래라 반 줄 + 글 1줄) + 요약 a(위 1줄 + 글 1줄) + 요약 b(1줄)
    // + 씬헤딩 위 빈 줄 1줄(앞에 막·장이 있어서 화면은 빈 줄을 남긴다)
    expect(paginate(lines).lastPageOutlineRows).toBe(1 + 1.5 + 2 + 1 + 1);
  });

  it("원고 줄 번호(source)는 막·장·요약 줄을 센 번호 그대로다", () => {
    const { pages } = paginate(withOutline);
    expect(pages[0].lines.map((l) => l.source)).toEqual([3, 5, 6, 9]);
  });

  it("막·장·요약 줄이 속한 페이지는 다음에 인쇄되는 줄의 페이지다 (끝이면 마지막 페이지)", () => {
    const { pageOfLine } = paginate(withOutline);
    expect(pageOfLine).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const long = [
      ...repeat(60, () => [action("한 줄")]),
      act("2막"),
      scene("내부. 방 - 낮"),
      synopsis("요약"),
    ];
    const r = paginate(long);
    const lastPage = r.pages.length;
    expect(lastPage).toBeGreaterThan(1);
    expect(r.pageOfLine[60]).toBe(lastPage);
    expect(r.pageOfLine[r.pageOfLine.length - 1]).toBe(lastPage);
  });

  it("쪽이 바뀌는 곳 바로 앞의 막·장 줄은 새 쪽에 속하고, 새 쪽 첫 줄은 맨 위 줄이다", () => {
    const lines: ScriptLine[] = [...repeat(41, () => [action("한 줄")]), act("2막"), chapter("장"), scene("내부. 방 - 낮"), action("본문")];
    const r = paginate(lines);
    const brk = r.breaks[0];
    expect(brk.beforeLine).toBe(42); // 막 줄부터 새 쪽
    expect(brk.topLine).toBe(44); // 씬헤딩이 새 쪽 첫 인쇄 줄
    expect(r.pageTopLines[0]).toBe(1);
    // 바로 앞에 막·장 줄이 있어서 화면은 이 줄 위 빈 줄을 그대로 둔다 (맨 위 줄 표시를 하지 않는다)
    expect(r.pageTopLines).not.toContain(44);
  });

  it("화면에서 차지하는 줄 수는 페이지마다 센다 (긴 요약은 줄바꿈된 줄 수만큼)", () => {
    const longSynopsis = "가".repeat(60); // 60칸 폭에 한글 60자는 두 줄 이상
    const r = paginate([scene("내부. 방 - 낮"), synopsis(longSynopsis), action("본문")]);
    // 글 줄 수 + 위에 띄운 빈 줄 1줄
    expect(r.lastPageOutlineRows).toBe(wrapText(longSynopsis, 60).length + 1);
    expect(r.lastPageOutlineRows).toBeGreaterThan(2);
  });
});

describe("막·장·요약을 인쇄하기로 했을 때 (PDF·Word 내보내기 설정)", () => {
  const lines: ScriptLine[] = [
    { style: "act", text: "1막" },
    { style: "chapter", text: "시퀀스 A" },
    { style: "scene", text: "내부. 방 - 낮" },
    { style: "synopsis", text: "민재가 등장한다." },
    { style: "action", text: "문이 열린다." },
  ];
  const rows = (p?: { sections?: boolean; synopsis?: boolean }) =>
    paginate(lines, 41, 1, p).pages[0].lines.map((l) => `${l.row}:${l.style}:${l.text}`);

  it("안 켜면 화면과 같다 (막·장·요약은 없다)", () => {
    expect(rows()).toEqual(["0:scene:내부. 방 - 낮", "2:action:문이 열린다."]);
  });

  it("막·장만 켜면 제목이 굵은 글씨로 들어가고 요약은 없다", () => {
    const got = paginate(lines, 41, 1, { sections: true }).pages[0].lines;
    expect(got.map((l) => l.style)).toEqual(["act", "chapter", "scene", "action"]);
    expect(got.filter((l) => l.style === "act" || l.style === "chapter").every((l) => l.bold)).toBe(true);
  });

  it("요약만 켜면 씬헤딩 아래에 요약이 들어간다", () => {
    expect(rows({ synopsis: true })).toEqual([
      "0:scene:내부. 방 - 낮",
      "2:synopsis:민재가 등장한다.",
      "4:action:문이 열린다.",
    ]);
  });

  it("둘 다 켜면 모두 들어가고, 이어진 요약 줄은 붙는다", () => {
    const more: ScriptLine[] = [...lines.slice(0, 4), { style: "synopsis", text: "둘째 줄" }, lines[4]];
    const got = paginate(more, 41, 1, { sections: true, synopsis: true }).pages[0].lines;
    const synopsis = got.filter((l) => l.style === "synopsis");
    expect(synopsis.map((l) => l.row)).toEqual([synopsis[0].row, synopsis[0].row + 1]);
    expect(got[0].style).toBe("act");
  });

  it("막 제목이 페이지 맨 아래에 혼자 남지 않고 다음 씬헤딩과 같은 쪽에 있다", () => {
    // 39줄로 채운 뒤 막 제목: 제목만 들어가고 씬헤딩은 넘치는 자리
    const doc: ScriptLine[] = [
      ...Array.from({ length: 39 }, () => ({ style: "action" as const, text: "한 줄" })),
      { style: "act", text: "2막" },
      { style: "scene", text: "내부. 방 - 낮" },
      { style: "action", text: "본문" },
    ];
    const pages = paginate(doc, 41, 1, { sections: true }).pages;
    const pageOf = (style: string) => pages.find((p) => p.lines.some((l) => l.style === style))!.number;
    expect(pages.length).toBe(2);
    expect(pageOf("act")).toBe(pageOf("scene"));
    expect(pageOf("act")).toBe(2);
  });
});

describe("씬 요약은 글자 단위로 줄을 바꾼다", () => {
  const W = textColumns("가");
  const word = (ch: string, cols: number) => ch.repeat(Math.floor(cols / W));

  it("어절을 지키지 않고 줄 끝까지 채운다", () => {
    const text = `${word("가", 30)} ${word("나", 40)}`;
    // 어절 단위면 둘째 어절이 통째로 다음 줄로 가지만, 글자 단위면 첫 줄을 끝까지 채운다
    expect(wrapText(text, 60)[0]).toBe(word("가", 30));
    const rows = wrapChars(text, 60);
    expect(rows[0].startsWith(`${word("가", 30)} 나`)).toBe(true);
    expect(textColumns(rows[0])).toBeGreaterThan(60 - W);
    expect(rows.every((r) => textColumns(r) <= 60)).toBe(true);
    expect(rows.join("").replace(/\s/g, "")).toBe(text.replace(/\s/g, ""));
  });

  it("줄 끝에 걸린 띄어쓰기는 다음 줄 맨 앞으로 가지 않는다", () => {
    const full = word("가", 60);
    expect(wrapChars(`${full} 나`, 60)).toEqual([full, "나"]);
  });

  it("화면 쪽 계산(outlineRows)도 요약만 글자 단위를 쓴다", () => {
    const text = `${word("가", 20)} ${word("나", 45)} ${word("다", 45)}`;
    expect(outlineRows(text, "act")).toBe(3);
    expect(outlineRows(text, "synopsis")).toBe(2);
  });
});

describe("액션도 글자 단위로 줄 끝까지 채운다", () => {
  it("액션·대사·씬 요약은 글자 단위, 인물·괄호지문 등은 어절 단위", () => {
    expect(wrapFor("action")).toBe(wrapChars);
    expect(wrapFor("synopsis")).toBe(wrapChars);
    expect(wrapFor("dialogue")).toBe(wrapChars);
    for (const s of ["character", "parenthetical", "scene", "transition", "subheader"] as const) expect(wrapFor(s)).toBe(wrapText);
  });

  it("긴 액션 문단은 쪽 계산에서도 줄 끝까지 채운 줄 수가 된다", () => {
    const W = textColumns("가");
    const word = (ch: string, cols: number) => ch.repeat(Math.floor(cols / W));
    const text = `${word("가", 20)} ${word("나", 45)} ${word("다", 45)}`;
    const { pages } = paginate([{ style: "action", text }]);
    const rows = pages[0].lines.filter((l) => l.style === "action");
    expect(rows.length).toBe(2);
  });
});
