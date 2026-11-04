import { describe, expect, it } from "vitest";
import { fromFountain, scriptLinesOf, toFountain, type ScriptDocument } from "./fountain";
import { readFileSync } from "node:fs";
import type { ScriptLine } from "../editor/lineStyles";

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

describe("막·장·씬 요약", () => {
  const doc = (lines: ScriptLine[]) => ({ titlePage: null, lines });

  it("저장: # 막, ## 장, = 요약으로 쓴다", () => {
    const text = toFountain(
      doc([
        { style: "act", text: "1막: 코끼리 우리" },
        { style: "chapter", text: "시퀀스 A" },
        { style: "scene", text: "내부. 우리 - 낮" },
        { style: "synopsis", text: "코끼리가 첫 등장한다." },
        { style: "synopsis", text: "조련사가 놀란다." },
        { style: "action", text: "문이 열린다." },
      ]),
    );
    expect(text).toContain("# 1막: 코끼리 우리\n");
    expect(text).toContain("## 시퀀스 A\n");
    expect(text).toContain("= 코끼리가 첫 등장한다.\n= 조련사가 놀란다.\n");
  });

  it("저장하고 다시 읽어도 같다 (빈 막·장·요약도)", () => {
    const lines: ScriptLine[] = [
      { style: "act", text: "1막" },
      { style: "chapter", text: "" },
      { style: "scene", text: "내부. 우리 - 낮" },
      { style: "synopsis", text: "첫 요약" },
      { style: "synopsis", text: "" },
      { style: "action", text: "문이 열린다." },
      { style: "act", text: "" },
      { style: "scene", text: "외부. 거리 - 밤" },
      { style: "action", text: "비가 온다." },
    ];
    expect(fromFountain(toFountain(doc(lines))).lines).toEqual(lines);
  });

  it("읽기: ###부터와 #3.처럼 붙여 쓴 것은 일반 글(액션)로 둔다", () => {
    const { lines } = fromFountain("### 세 번째\n\n#3. 코끼리 우리\n\n#해시태그\n");
    expect(lines.every((l) => l.style === "action")).toBe(true);
    expect(lines.map((l) => l.text)).toEqual(expect.arrayContaining(["### 세 번째", "#3. 코끼리 우리", "#해시태그"]));
  });

  it("읽기: 씬헤딩이나 요약 바로 뒤의 = 줄만 요약이고, 그 밖은 일반 글로 둔다", () => {
    const { lines } = fromFountain(".내부. 방 - 낮\n\n= 요약\n= 이어서\n\n그냥 지문\n\n= 지문 뒤의 등호 줄\n");
    expect(lines.map((l) => l.style)).toEqual(["scene", "synopsis", "synopsis", "action", "action"]);
    expect(lines[4].text).toBe("= 지문 뒤의 등호 줄");
  });

  it("프로젝트를 다시 열 때(scriptLinesOf) 막·장·요약 줄이 빠지지 않는다", () => {
    const lines: ScriptLine[] = [
      { style: "act", text: "1막" },
      { style: "chapter", text: "시퀀스 A" },
      { style: "scene", text: "내부. 거실 - 밤" },
      { style: "synopsis", text: "민재가 돌아온다." },
      { style: "action", text: "문이 열린다." },
    ];
    expect(scriptLinesOf(toFountain(doc(lines))).lines).toEqual(lines);
  });

  it("읽기: === (쪽 나눔 표시)는 요약이 아니다", () => {
    const { lines } = fromFountain(".내부. 방 - 낮\n\n===\n");
    expect(lines.find((l) => l.text === "===")?.style).toBe("action");
  });
});

describe("가운데 정렬·글자 꾸밈", () => {
  it(">끝<은 액션 줄로 읽고 기호를 남기며, 저장할 때도 ! 없이 그대로 쓴다", () => {
    const doc = fromFountain("그냥 글\n\n>끝<\n\n**굵게** *기울임* _밑줄_\n");
    expect(doc.lines.map((l) => l.text)).toContain(">끝<");
    expect(doc.lines.some((l) => l.text === "**굵게** *기울임* _밑줄_")).toBe(true);
    const out = toFountain({ titlePage: null, lines: [{ style: "action", text: ">끝<" }] });
    expect(out).toBe(">끝<\n");
  });
});

describe("오른쪽 정렬", () => {
  it(">끝(오른쪽 정렬)은 ! 를 붙여 저장하고 다시 읽어도 같은 액션이다", () => {
    const doc: ScriptDocument = { titlePage: null, lines: [{ style: "action", text: ">끝" }] };
    const out = toFountain(doc);
    expect(out).toBe("!>끝\n");
    expect(fromFountain(out).lines).toEqual([{ style: "action", text: ">끝" }]);
  });
});

describe("들여 쓴 액션", () => {
  it("! 뒤에 들여쓰기를 그대로 저장하고, 다시 읽어도 같다", () => {
    const doc: ScriptDocument = {
      titlePage: null,
      lines: [
        { style: "action", text: "쪽지에 적혀 있다." },
        { style: "action", text: "    Scott --" },
      ],
    };
    const text = toFountain(doc);
    expect(text).toContain("!    Scott --");
    expect(fromFountain(text).lines[1].text).toBe("    Scott --");
  });
});
