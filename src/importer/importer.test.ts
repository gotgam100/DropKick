import { describe, expect, it } from "vitest";
import { buildDocx } from "../docx/buildDocx";
import { classifyRows, parseSceneHeading } from "./classify";
import { extractDocxRows, styleHint } from "./docxRows";
import { extractHwpxRows } from "./hwpxRows";
import { documentKind, importDocumentBytes } from "./importDocument";
import { zipSync, strToU8 } from "fflate";
import type { Row } from "./types";

// PDF에서 읽은 줄을 흉내 낸다: 액션 108, 인물 266, 괄호지문 223, 대사 180 (DropKick PDF와 같은 자리)
let y = 80;
function pdfRow(x: number, text: string, extra: Partial<Row["segs"][0]> = {}, gap = 15.6): Row {
  y += gap;
  return {
    page: 1,
    y,
    pageWidth: 612,
    pageHeight: 792,
    segs: [{ x, text, font: "body", size: 11, right: x + text.length * 11, ...extra }],
  };
}

/** 씬헤딩 줄: 왼쪽에 번호가 붙은 글, 오른쪽 끝에 같은 번호 */
function sceneRow(text: string, number: string, gap = 15.6): Row {
  const row = pdfRow(90, text, { font: "bold" }, gap);
  row.segs.push({ x: 532, text: number, font: "bold", size: 11, right: 540 });
  return row;
}

function sampleRows(): Row[] {
  y = 80;
  return [
    sceneRow("1 실내. 미숙의 집 - 낮", "1"),
    pdfRow(108, "집안 곳곳을 뒤지고 있는 미숙. 서랍을 뒤지고 가방을 털고 책상 옆 잡동사니를", { right: 500 }, 31),
    pdfRow(108, "헤집는다. 그러다가 책상 밑에서 먼지 쌓인 상자를 발견하고 한참을 들여다보다가 천천히", { right: 500 }),
    pdfRow(108, "상자를 연다. 안에는 오래된 사진과 편지 몇 장이 들어 있다. 미숙은 사진을 하나씩 넘겨 보며", { right: 500 }),
    pdfRow(108, "한숨을 쉰다. 아무래도 여기에는 없는 모양이다. 서랍 맨 아래 칸까지 모두 뒤져 보지만", { right: 500 }),
    pdfRow(108, "끝내 찾지 못한다."),
    pdfRow(266, "미숙", {}, 31),
    pdfRow(223, "(중얼)"),
    pdfRow(180, "하아... 없다. 뭐지."),
    pdfRow(266, "이감독", {}, 31),
    pdfRow(180, "백업 다 됐어? 아직 안 됐어? 외장하드 언제 받으러 갈까 내일 오전에 가도 되지", { right: 500 }),
    pdfRow(180, "그렇지?"),
    pdfRow(108, "전화를 끊는다.", {}, 31),
    pdfRow(108, "미숙이 한숨을 쉰다."),
    pdfRow(108, "어둠 속의 미숙", { font: "bold" }, 31),
    pdfRow(475, "FADE OUT.", {}, 31),
    sceneRow("2 실외. 골목 - 밤", "2", 31),
    pdfRow(108, "고양이가 지나간다.", {}, 31),
    pdfRow(266, "달리", {}, 31),
    pdfRow(180, "츄르 줘."),
    pdfRow(266, "미숙", {}, 31),
    pdfRow(180, "알았어."),
    pdfRow(266, "달리", {}, 31),
    pdfRow(180, "전갱이로."),
  ];
}

describe("씬헤딩 알아보기", () => {
  it("번호·실내외·시간 표기를 DropKick 형식으로 바꾼다", () => {
    expect(parseSceneHeading("1. 미숙의 집 (낮, 실내)")).toBe("실내. 미숙의 집 - 낮");
    expect(parseSceneHeading("S#3. 내부. 카페 - 밤")).toBe("내부. 카페 - 밤");
    expect(parseSceneHeading("INT. OFFICE - DAY")).toBe("INT. OFFICE - DAY");
    for (const raw of ["#1 교실", "S#1. 교실", "SC#1 교실", "SC#1. 교실", "1. 교실", "12) 교실"]) expect(parseSceneHeading(raw)).toBe("교실");
    expect(parseSceneHeading("3. 그는 문을 열었다.")).toBeNull();
    expect(parseSceneHeading("12. 옥상 - 새벽")).toBe("옥상 - 새벽");
  });

  it("보통 문장은 씬헤딩이 아니다", () => {
    expect(parseSceneHeading("미숙이 한숨을 쉰다.")).toBeNull();
    expect(parseSceneHeading("낮")).toBeNull();
  });
});

describe("PDF 줄을 스타일로 나누기 (위치로 판단)", () => {
  const result = classifyRows(sampleRows());
  const styles = result.lines.map((l) => l.style);

  it("씬헤딩의 앞뒤 번호를 떼고 씬 2개를 찾는다", () => {
    expect(result.report.scenes).toBe(2);
    expect(result.lines[0]).toEqual({ style: "scene", text: "실내. 미숙의 집 - 낮" });
  });

  it("인물 위치를 스스로 알아내 인물·괄호지문·대사로 나눈다", () => {
    expect(styles.slice(2, 6)).toEqual(["character", "parenthetical", "dialogue", "character"]);
    expect(result.report.characters.sort()).toEqual(["달리", "미숙", "이감독"]);
    expect(result.lines.find((l) => l.style === "parenthetical")?.text).toBe("(중얼)");
  });

  it("줄이 끝까지 찬 문장은 이어 붙이고, 짧게 끊은 줄은 따로 둔다", () => {
    expect(result.lines[1].text).toBe("집안 곳곳을 뒤지고 있는 미숙. 서랍을 뒤지고 가방을 털고 책상 옆 잡동사니를 헤집는다. 그러다가 책상 밑에서 먼지 쌓인 상자를 발견하고 한참을 들여다보다가 천천히 상자를 연다. 안에는 오래된 사진과 편지 몇 장이 들어 있다. 미숙은 사진을 하나씩 넘겨 보며 한숨을 쉰다. 아무래도 여기에는 없는 모양이다. 서랍 맨 아래 칸까지 모두 뒤져 보지만 끝내 찾지 못한다.");
    const dialogue = result.lines.find((l) => l.text.startsWith("백업"));
    expect(dialogue?.text.endsWith("그렇지?")).toBe(true);
    expect(result.lines.find((l) => l.text === "전화를 끊는다.")).toBeDefined();
    expect(result.lines.find((l) => l.text === "미숙이 한숨을 쉰다.")).toBeDefined();
  });

  it("다른 글꼴의 짧은 줄은 서브헤더, 오른쪽 끝 글은 전환", () => {
    expect(result.lines.find((l) => l.text === "어둠 속의 미숙")?.style).toBe("subheader");
    expect(result.lines.find((l) => l.text === "FADE OUT.")?.style).toBe("transition");
  });

  it("쪽 번호와 되풀이되는 머리말은 걷어 낸다", () => {
    const rows: Row[] = [];
    for (let page = 1; page <= 4; page++) {
      rows.push({ page, y: 20, pageWidth: 612, pageHeight: 792, segs: [{ x: 250, text: `${page}/4`, font: "body", size: 10 }] });
      rows.push({ page, y: 30, pageWidth: 612, pageHeight: 792, segs: [{ x: 108, text: "초고 — 비공개", font: "body", size: 10 }] });
      rows.push({ page, y: 100, pageWidth: 612, pageHeight: 792, segs: [{ x: 90, text: `${page}. 카페 - 낮`, font: "b", size: 11 }] });
      rows.push({ page, y: 130, pageWidth: 612, pageHeight: 792, segs: [{ x: 108, text: "누군가 들어온다.", font: "body", size: 11 }] });
    }
    const out = classifyRows(rows);
    expect(out.lines.some((l) => l.text.includes("비공개"))).toBe(false);
    expect(out.lines.some((l) => /\d\/4/.test(l.text))).toBe(false);
    expect(out.report.scenes).toBe(4);
  });

  it("글이 없는 문서는 빈 결과", () => {
    expect(classifyRows([]).lines).toEqual([]);
  });
});

describe("분석 전 질문", () => {
  // 첫 쪽이 제목뿐이고, 다른 글꼴의 짧은 줄이 있는 문서
  function withCover(): Row[] {
    const cover: Row = { page: 1, y: 300, pageWidth: 612, pageHeight: 792, segs: [{ x: 220, text: "잃어버린 외장하드", font: "title", size: 24 }] };
    return [cover, ...sampleRows().map((r) => ({ ...r, page: 2 }))];
  }

  it("표지로 보이는 쪽과 서브헤더 후보는 물어본다", () => {
    const first = classifyRows(withCover());
    expect(first.questions.map((q) => q.id).sort()).toEqual(["cover", "subheader"]);
    const cover = first.questions.find((q) => q.id === "cover");
    expect(cover && cover.id === "cover" && cover.title).toBe("잃어버린 외장하드");
  });

  it("답을 주면 그대로 반영하고 다시 묻지 않는다", () => {
    const answered = classifyRows(withCover(), { cover: { isCover: true, title: "내 시나리오" }, lineStyles: { "어둠 속의 미숙": "action" }, characterX: 266.4 });
    expect(answered.questions).toEqual([]);
    expect(answered.title).toBe("내 시나리오");
    expect(answered.lines.find((l) => l.text === "어둠 속의 미숙")?.style).toBe("action");

    const notCover = classifyRows(withCover(), { cover: { isCover: false, title: "" } });
    expect(notCover.title).toBeNull();
    expect(notCover.lines.some((l) => l.text.includes("잃어버린 외장하드"))).toBe(true);
  });

  it("인물 위치가 분명하면 인물은 묻지 않는다", () => {
    expect(classifyRows(sampleRows()).questions.some((q) => q.id === "character")).toBe(false);
  });

  it("인물 위치가 헷갈리는 문서는 후보를 보여 주며 묻고, 고른 위치를 따른다", () => {
    // 두 안쪽 위치가 모두 짧고 되풀이되는 글 (이름 | 호칭)
    const rows: Row[] = [];
    let yy = 100;
    const add = (x: number, text: string) => rows.push({ page: 1, y: (yy += 31), pageWidth: 612, pageHeight: 792, segs: [{ x, text, font: "body", size: 11, right: x + 40 }] });
    rows.push({ page: 1, y: 90, pageWidth: 612, pageHeight: 792, segs: [{ x: 108, text: "1. 카페 - 낮", font: "b", size: 11, right: 200 }] });
    for (let i = 0; i < 4; i++) {
      add(250, "민재");
      add(180, "응");
      add(250, "수아");
      add(180, "네");
      add(108, "문이 열린다.");
    }
    const out = classifyRows(rows);
    const q = out.questions.find((x) => x.id === "character");
    expect(q && q.id === "character" && q.options.length).toBeGreaterThanOrEqual(2);
    const chosen = classifyRows(rows, { characterX: 250 });
    expect(chosen.questions.some((x) => x.id === "character")).toBe(false);
    expect(chosen.report.characters.sort()).toEqual(["민재", "수아"]);
  });
});

describe("Word 가져오기", () => {
  it("DropKick이 내보낸 Word를 다시 읽으면 스타일이 거의 그대로 돌아온다", async () => {
    const lines = [
      { style: "scene" as const, text: "내부. 회의실 - 낮" },
      { style: "action" as const, text: "민재가 의자에 앉아 있다." },
      { style: "character" as const, text: "민재" },
      { style: "parenthetical" as const, text: "(한숨 쉬며)" },
      { style: "dialogue" as const, text: "정말 그렇게 될까?" },
      { style: "character" as const, text: "수아" },
      { style: "dialogue" as const, text: "될 거야." },
      { style: "character" as const, text: "민재" },
      { style: "dialogue" as const, text: "그래." },
      { style: "transition" as const, text: "CUT TO:" },
    ];
    const bytes = await buildDocx({ titlePage: null, lines });
    expect(extractDocxRows(bytes).length).toBeGreaterThan(5);
    const out = (await importDocumentBytes("docx", bytes))!;
    expect(out.lines.map((l) => l.style)).toEqual(lines.map((l) => l.style));
    expect(out.lines.map((l) => l.text)).toEqual(lines.map((l) => l.text));
  });

  it("Word 문단 스타일 이름이 줄 스타일을 알려 준다", () => {
    expect(styleHint("Character")).toBe("character");
    expect(styleHint("Scene Heading")).toBe("scene");
    expect(styleHint("대사")).toBe("dialogue");
    expect(styleHint("Normal")).toBeUndefined();
  });
});

describe("이름 옆에 대사가 붙고 액션도 대사와 같은 위치에서 시작하는 문서", () => {
  const row = (page: number, y: number, ...segs: [number, string][]): Row => ({
    page,
    y,
    pageWidth: 612,
    pageHeight: 792,
    segs: segs.map(([x, text]) => ({ x, text, font: "body" })),
  });
  const rows = (): Row[] => [
    row(2, 65, [57, "1.\u0000대학가\u0000거리\u0000-\u0000오후\u0000"]),
    row(2, 103, [129, "계단을 올라온다."]),
    row(2, 120, [129, "누군가 앞을 막아선다."]),
    row(2, 155, [57, "사내"], [129, "가위, 바위, 보!"]),
    row(2, 172, [129, "한 번 더 외친다."]),
    row(2, 207, [57, "준우"], [129, "뭐야?"]),
    row(2, 242, [129, "준우가 주먹을 내민다."]),
    row(2, 277, [57, "사내"], [129, "하나 더."]),
    row(2, 312, [57, "준우"], [129, "그만해!"]),
    row(3, 65, [129, "직장인들이 모여 있다."]),
    row(3, 100, [57, "사내"], [129, "보!"]),
  ];

  it("번호만 붙은 씬헤딩을 찾고, 간격이 벌어진 줄은 액션으로 본다", () => {
    const result = classifyRows(rows());
    expect(result.lines[0]).toEqual({ style: "scene", text: "대학가 거리 - 오후" });
    expect(result.lines.find((l) => l.text === "준우가 주먹을 내민다.")?.style).toBe("action");
    expect(result.lines.find((l) => l.text.includes("직장인들"))?.style).toBe("action");
    expect(result.report.review).toEqual([]);
  });

  it("이어지는 대사 줄은 앞 대사에 붙는다", () => {
    const result = classifyRows(rows());
    const i = result.lines.findIndex((l) => l.style === "character" && l.text === "사내");
    expect(result.lines[i + 1].style).toBe("dialogue");
    expect(result.lines[i + 1].text).toContain("한 번 더 외친다.");
  });
});

describe("괄호로 감싼 인물 이름", () => {
  const row = (y: number, ...segs: [number, string][]): Row => ({
    page: 2,
    y,
    pageWidth: 612,
    pageHeight: 792,
    segs: segs.map(([x, text]) => ({ x, text, font: "body" })),
  });

  it("(길동)처럼 이름만 괄호로 감싸도 인물로 본다", () => {
    const result = classifyRows([
      row(65, [57, "1. 교실"]),
      row(103, [129, "길동이 창밖을 본다."]),
      row(138, [57, "(길동)"], [129, "나는 갈 수 있을까."]),
      row(173, [57, "민수"], [129, "가자."]),
      row(208, [57, "(길동)"], [129, "그래."]),
      row(243, [57, "민수"], [129, "빨리."]),
    ]);
    const names = result.lines.filter((l) => l.style === "character").map((l) => l.text);
    expect(names).toEqual(["길동", "민수", "길동", "민수"]);
    expect(result.report.characters).toContain("길동");
  });
});

describe("한글(.hwpx) 가져오기", () => {
  const header =
    '<hh:head xmlns:hh="h" xmlns:hc="c"><hh:paraProperties>' +
    '<hh:paraPr id="0"><hh:align horizontal="LEFT"/><hh:margin><hc:left value="0"/></hh:margin></hh:paraPr>' +
    '<hh:paraPr id="1"><hh:align horizontal="LEFT"/><hh:margin><hc:left value="8000"/></hh:margin></hh:paraPr>' +
    '<hh:paraPr id="2"><hh:align horizontal="LEFT"/><hh:margin><hc:left value="14000"/></hh:margin></hh:paraPr>' +
    "</hh:paraProperties></hh:head>";
  const p = (pr: number, text: string) => `<hp:p paraPrIDRef="${pr}" styleIDRef="0"><hp:run><hp:t>${text}</hp:t></hp:run></hp:p>`;
  const section = (body: string) => `<hs:sec xmlns:hp="p" xmlns:hs="s">${body}</hs:sec>`;
  const build = (body: string) => zipSync({ "Contents/header.xml": strToU8(header), "Contents/section0.xml": strToU8(section(body)) });

  it("문단 안에 들어 있는 표도 줄마다 읽는다", () => {
    const table = (a: string, b: string) => `<hp:tr><hp:tc><hp:p paraPrIDRef="0" styleIDRef="0"><hp:run><hp:t>${a}</hp:t></hp:run></hp:p></hp:tc><hp:tc><hp:p paraPrIDRef="0" styleIDRef="0"><hp:run><hp:t>${b}</hp:t></hp:run></hp:p></hp:tc></hp:tr>`;
    const body = p(0, "S#1. 교실 - 낮") + `<hp:p paraPrIDRef="0" styleIDRef="0"><hp:run><hp:tbl>${table("길동", "안녕.")}${table("민수", "응.")}${table("길동", "가자.")}</hp:tbl></hp:run></hp:p>`;
    const out = classifyRows(extractHwpxRows(build(body)));
    expect(out.lines.map((l) => l.text)).toEqual(["교실 - 낮", "길동", "안녕.", "민수", "응.", "길동", "가자."]);
  });

  it("확장자로 종류를 알아본다", () => {
    expect(documentKind("/a/b/시나리오.HWPX")).toBe("hwpx");
  });

  it("문단 들여쓰기로 액션·인물·대사를 나눈다", async () => {
    const body = [p(0, "S#1. 교실 - 낮"), p(0, "길동이 창밖을 본다."), p(1, "길동"), p(2, "나는 갈 수 있을까."), p(1, "민수"), p(2, "가자."), p(1, "길동"), p(2, "그래.")].join("");
    const out = (await importDocumentBytes("hwpx", build(body)))!;
    expect(out.lines.map((l) => l.style)).toEqual(["scene", "action", "character", "dialogue", "character", "dialogue", "character", "dialogue"]);
    expect(out.lines[0].text).toBe("교실 - 낮");
  });
});

describe("Word·한글 문서의 여러 배치", () => {
  const para = (y: number, x: number, text: string, block?: string): Row => ({ page: 1, y, paragraph: true, segs: [{ x, text, ...(block ? { block } : {}) }] });

  it("INS. / INS> 로 시작하는 줄은 서브 헤더", () => {
    const result = classifyRows([para(0, 0, "S#1. 교실"), para(1, 0, "INS> 과거"), para(2, 0, "INS. 편지"), para(3, 0, "길동이 본다.")]);
    expect(result.lines.map((l) => l.style)).toEqual(["scene", "subheader", "subheader", "action"]);
  });

  it("인물과 대사가 같은 문단 스타일에 번갈아 쌓여도 이름이 되풀이되면 인물로 본다", () => {
    const h = "Heading3";
    const result = classifyRows([
      para(0, 0, "SC#1. 교실"),
      para(1, 0, "둘이 마주 앉는다."),
      para(2, 0, "순아", h),
      para(3, 0, "나 용손이야", h),
      para(4, 0, "승화", h),
      para(5, 0, "뭐?", h),
      para(6, 0, "순아", h),
      para(7, 0, "진짜야.", h),
      para(8, 0, "그래서 비늘도 있어.", h),
      para(9, 0, "승화", h),
      para(10, 0, "(웃으며)", h),
      para(11, 0, "믿을게.", h),
    ]);
    expect(result.lines.map((l) => l.style)).toEqual([
      "scene", "action", "character", "dialogue", "character", "dialogue", "character", "dialogue", "dialogue", "character", "parenthetical", "dialogue",
    ]);
  });

  it("이름 위치가 줄마다 달라도(좌우 번갈아) 같은 이름이 줄 앞에 되풀이되면 인물", () => {
    const rows: Row[] = [
      { page: 1, y: 0, paragraph: true, segs: [{ x: 0, text: "S#1. 집" }] },
      { page: 1, y: 1, paragraph: true, segs: [{ x: 36, text: "미숙" }, { x: 436, text: "안녕, 오랜만이야." }] },
      { page: 1, y: 2, paragraph: true, segs: [{ x: 400, text: "감독" }, { x: 800, text: "그래, 잘 지냈어?" }] },
      { page: 1, y: 3, paragraph: true, segs: [{ x: 108, text: "이어서 말한다." }] },
      { page: 1, y: 4, paragraph: true, segs: [{ x: 400, text: "미숙" }, { x: 800, text: "응, 그럼." }] },
      { page: 1, y: 5, paragraph: true, segs: [{ x: 36, text: "감독" }, { x: 436, text: "다행이다." }] },
    ];
    const result = classifyRows(rows);
    expect(result.questions.some((q) => q.id === "character")).toBe(false);
    expect(result.lines.map((l) => l.style)).toEqual(["scene", "character", "dialogue", "character", "dialogue", "character", "dialogue", "character", "dialogue"]);
    expect(result.lines[4].text).toBe("그래, 잘 지냈어? 이어서 말한다.");
  });
});
