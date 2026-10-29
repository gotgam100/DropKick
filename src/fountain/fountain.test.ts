import { describe, expect, it } from "vitest";
import { fromFountain, toFountain, type ScriptDocument } from "./fountain";
import { readFileSync } from "node:fs";

const doc: ScriptDocument = {
  titlePage: "Title: 드롭킥\nAuthor: baekmac",
  lines: [
    { style: "transition", text: "FADE IN:" },
    { style: "scene", text: "내부. 체육관 - 밤" },
    { style: "action", text: "형광등이 깜빡인다." },
    { style: "action", text: "민재가 링 위에 서 있다." },
    { style: "character", text: "민재" },
    { style: "parenthetical", text: "(숨을 고르며)" },
    { style: "dialogue", text: "딱 한 번만 더." },
    { style: "character", text: "수아 (V.O.)" },
    { style: "dialogue", text: "들어가도 돼요?" },
    { style: "transition", text: "CUT TO:" },
    { style: "scene", text: "S#10. 외부. 골목 - 밤" },
    { style: "scene", text: "INT. LOCKER ROOM - NIGHT" },
    { style: "action", text: "INT. 처럼 시작하는 액션" },
    { style: "action", text: "" },
    { style: "action", text: "빈 줄 다음 액션" },
  ],
};

describe("Fountain 저장", () => {
  it("스타일을 Fountain 기호로 표시하고 문단을 빈 줄로 나눈다", () => {
    expect(toFountain(doc)).toBe(
      [
        "Title: 드롭킥",
        "Author: baekmac",
        "",
        "> FADE IN:",
        "",
        ".내부. 체육관 - 밤 #1#",
        "",
        "형광등이 깜빡인다.",
        "민재가 링 위에 서 있다.",
        "",
        "@민재",
        "(숨을 고르며)",
        "딱 한 번만 더.",
        "",
        "@수아 (V.O.)",
        "들어가도 돼요?",
        "",
        "> CUT TO:",
        "",
        ".S#10. 외부. 골목 - 밤 #10#",
        "",
        ".INT. LOCKER ROOM - NIGHT #11#",
        "",
        "!INT. 처럼 시작하는 액션",
        "  ",
        "빈 줄 다음 액션",
        "",
      ].join("\n"),
    );
  });
});

describe("Fountain 열기", () => {
  it("DropKick이 저장한 파일은 그대로 다시 열린다", () => {
    expect(fromFountain(toFountain(doc))).toEqual(doc);
  });

  it("예시 원고도 그대로 다시 열린다", () => {
    const sample = fromFountain(readFileSync(new URL("../../samples/short-5p.fountain", import.meta.url), "utf8"));
    expect(fromFountain(toFountain(sample))).toEqual(sample);
  });

  it("다른 프로그램에서 만든 영문 Fountain을 읽는다", () => {
    const source = [
      "Title: Big Fish",
      "Credit: written by",
      "",
      "INT. BEDROOM - NIGHT",
      "",
      "Edward sits up in bed.",
      "",
      "EDWARD",
      "(whispering)",
      "Are you awake?",
      "",
      "WILL (O.S.)",
      "No.",
      "",
      "CUT TO:",
      "",
      "EXT. RIVER - DAY",
    ].join("\r\n");
    expect(fromFountain(source)).toEqual({
      titlePage: "Title: Big Fish\nCredit: written by",
      lines: [
        { style: "scene", text: "INT. BEDROOM - NIGHT" },
        { style: "action", text: "Edward sits up in bed." },
        { style: "character", text: "EDWARD" },
        { style: "parenthetical", text: "(whispering)" },
        { style: "dialogue", text: "Are you awake?" },
        { style: "character", text: "WILL (O.S.)" },
        { style: "dialogue", text: "No." },
        { style: "transition", text: "CUT TO:" },
        { style: "scene", text: "EXT. RIVER - DAY" },
      ],
    });
  });

  it("손으로 쓴 한글 Fountain: S#으로 시작하면 씬헤딩", () => {
    const result = fromFountain("S#3. 내부. 집 - 낮\n\n@엄마\n밥 먹어.\n");
    expect(result.lines).toEqual([
      { style: "scene", text: "S#3. 내부. 집 - 낮" },
      { style: "character", text: "엄마" },
      { style: "dialogue", text: "밥 먹어." },
    ]);
  });

  it("빈 줄로 나뉜 액션 문단은 빈 액션 줄로 구분을 지킨다", () => {
    const result = fromFountain("첫 문단.\n이어지는 줄.\n\n둘째 문단.\n");
    expect(result.lines).toEqual([
      { style: "action", text: "첫 문단." },
      { style: "action", text: "이어지는 줄." },
      { style: "action", text: "" },
      { style: "action", text: "둘째 문단." },
    ]);
    expect(fromFountain(toFountain(result))).toEqual(result);
  });

  it("빈 씬헤딩과 빈 전환도 스타일이 유지된다", () => {
    const doc = {
      titlePage: null,
      lines: [
        { style: "scene" as const, text: "" },
        { style: "action" as const, text: "액션" },
        { style: "transition" as const, text: "" },
      ],
    };
    expect(fromFountain(toFountain(doc))).toEqual(doc);
  });

  it("서브 헤더: ..기호로 저장 및 불러오기 양방향 유지", () => {
    const doc = {
      titlePage: null,
      lines: [
        { style: "scene" as const, text: "내부. 집 - 낮" },
        { style: "action" as const, text: "거실을 지나간다." },
        { style: "subheader" as const, text: "복도" },
        { style: "action" as const, text: "불이 꺼져 있다." },
      ],
    };
    const fountain = toFountain(doc);
    expect(fountain).toContain("..복도");
    expect(fromFountain(fountain)).toEqual(doc);
  });

  it("빈 파일은 빈 액션 한 줄", () => {
    expect(fromFountain("").lines).toEqual([{ style: "action", text: "" }]);
  });
});
