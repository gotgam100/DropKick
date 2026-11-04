import { describe, expect, it } from "vitest";
import { wrapText } from "./metrics";
import { alignOf, applyFormat, hasInline, inlineMarks, isCenteredText, isRightText, plainText, rowSpans, stripMarks } from "./inline";
import { paginate } from "./paginate";

describe("글자 꾸밈과 가운데 정렬", () => {
  it("굵게·기울임·굵은 기울임·밑줄 기호를 찾는다", () => {
    expect(plainText("**굵게** *기울임* ***둘다*** _밑줄_")).toBe("굵게 기울임 둘다 밑줄");
    const m = inlineMarks("**가** *나* ***다*** _라_");
    const at = (c: string) => "**가** *나* ***다*** _라_".indexOf(c);
    expect(m.bold[at("가")] && !m.italic[at("가")]).toBe(true);
    expect(m.italic[at("나")] && !m.bold[at("나")]).toBe(true);
    expect(m.bold[at("다")] && m.italic[at("다")]).toBe(true);
    expect(m.underline[at("라")]).toBe(true);
  });

  it("짝이 없는 별표·밑줄은 보통 글자처럼 그대로 보인다", () => {
    expect(plainText("3 * 4 = 12")).toBe("3 * 4 = 12");
    expect(plainText("**굵")).toBe("**굵");
    expect(plainText("별점 ***")).toBe("별점 ***");
    expect(plainText("min_jae@mail.com")).toBe("min_jae@mail.com");
    expect(hasInline("그냥 글")).toBe(false);
    expect(hasInline("*")).toBe(true);
  });

  it("밑줄 _ 은 영문·숫자 단어 안에서는 꾸밈이 되지 않는다 (한글 조사는 붙어도 된다)", () => {
    expect(plainText("file_name_v2.txt")).toBe("file_name_v2.txt");
    expect(plainText("_밑줄_이다")).toBe("밑줄이다");
    expect(inlineMarks("_밑줄_이다").underline[1]).toBe(true);
  });

  it("\\* \\_ 는 짝이 맞아도 글자 그대로 보이고, \\ 는 숨는다", () => {
    expect(plainText("\\*별\\* \\_밑\\_")).toBe("*별* _밑_");
    expect(plainText("경로 C:\\Users")).toBe("경로 C:\\Users");
    expect(plainText("**굵게** \\*")).toBe("굵게 *");
    expect(plainText(">\\*가운데\\*<", "center")).toBe("*가운데*");
  });

  it("꾸밈을 쓰지 않는 줄(stripMarks)도 짝 맞는 기호만 빼고 글자 그대로의 기호는 남긴다", () => {
    expect(stripMarks("**강조** 거실")).toBe("강조 거실");
    expect(stripMarks("민재_2")).toBe("민재_2");
    expect(stripMarks("별 *")).toBe("별 *");
  });

  it("오른쪽 정렬: >글 은 오른쪽에 붙고 > 는 보이지 않는다", () => {
    expect(isRightText(">끝")).toBe(true);
    expect(isRightText(">끝<")).toBe(false);
    expect(alignOf("  >끝")).toBe("right");
    expect(plainText(">끝", "right")).toBe("끝");
    const { pages } = paginate([{ style: "action", text: ">끝" }]);
    const l = pages[0].lines[0];
    expect(l.text).toBe("끝");
    expect(l.column).toBeGreaterThan(55);
  });

  it("안에 다른 꾸밈이 들어가도 된다", () => {
    expect(plainText("**굵게 _밑줄_ 굵게**")).toBe("굵게 밑줄 굵게");
  });

  it("가운데 정렬은 >로 시작해 <로 끝나는 줄", () => {
    expect(isCenteredText(">끝<")).toBe(true);
    expect(isCenteredText("> CUT TO:")).toBe(false);
    expect(plainText(">끝<", true)).toBe("끝");
    expect(plainText(">**끝**<", true)).toBe("끝");
  });

  it("줄바꿈된 줄에서도 꾸밈이 이어진다", () => {
    const raw = "가나다 **라마바 사아자** 차카";
    const rows = wrapText(raw, 12);
    expect(rows.length).toBeGreaterThan(1);
    const spans = rowSpans(raw, rows);
    const text = spans.map((r) => r.map((s) => s.text).join("")).join(" ");
    expect(text.replace(/\s+/g, "")).toBe("가나다라마바사아자차카");
    const boldText = spans.flat().filter((s) => s.bold).map((s) => s.text).join("").replace(/\s+/g, "");
    expect(boldText).toBe("라마바사아자");
  });

  it("쪽 계산: 기호를 뺀 글로 줄바꿈하고, 가운데 정렬 줄은 가운데에 놓는다", () => {
    const { pages } = paginate([
      { style: "action", text: "일반" },
      { style: "action", text: ">끝<" },
      { style: "action", text: "**굵게**" },
    ]);
    const [a, b, c] = pages[0].lines;
    expect(a.spans).toBeUndefined();
    expect(b.text).toBe("끝");
    expect(b.spans?.map((s) => s.text).join("")).toBe("끝");
    expect(b.column).toBeGreaterThan(20);
    expect(c.spans?.[0]).toMatchObject({ text: "굵게", bold: true });
    expect(c.column).toBe(0);
  });
});

describe("액션 들여쓰기", () => {
  it("들여 쓴 줄은 안쪽에서 시작하고 줄바꿈 폭이 줄어든다", () => {
    const { pages } = paginate([
      { style: "action", text: "    Scott --" },
      { style: "action", text: "일반" },
    ]);
    expect(pages[0].lines[0].text).toBe("Scott --");
    expect(pages[0].lines[0].column).toBe(4);
    expect(pages[0].lines[1].column).toBe(0);
  });

  it("긴 들여쓴 글은 모든 줄이 같은 자리에서 시작한다", () => {
    const { pages } = paginate([{ style: "action", text: "    " + "가나다 ".repeat(30) }]);
    const lines = pages[0].lines;
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.column === 4)).toBe(true);
  });

  it("공백뿐인 줄은 그대로 빈 줄", () => {
    const { pages } = paginate([{ style: "action", text: "    " }]);
    expect(pages[0].lines[0].column).toBe(0);
  });
});

describe("꾸밈 켜고 끄기 (applyFormat)", () => {
  it("굵게·기울임·밑줄을 한 글에 모두 겹쳐 쓴다", () => {
    let t = "민재가 웃는다";
    const b = applyFormat(t, 0, 2, "bold")!;
    expect(b.text).toBe("**민재**가 웃는다");
    const i = applyFormat(b.text, b.from, b.to, "italic")!;
    expect(i.text).toBe("***민재***가 웃는다");
    const u = applyFormat(i.text, i.from, i.to, "underline")!;
    expect(u.text).toBe("_***민재***_가 웃는다");
    const m = inlineMarks(u.text);
    const k = u.text.indexOf("민");
    expect(m.bold[k] && m.italic[k] && m.underline[k]).toBe(true);
    expect(plainText(u.text)).toBe("민재가 웃는다");
    t = u.text;
  });

  it("겹친 꾸밈에서 하나만 끈다", () => {
    const a = applyFormat("_***민재***_가", 2, 4, "bold")!;
    expect(plainText(a.text)).toBe("민재가");
    const m = inlineMarks(a.text);
    const k = a.text.indexOf("민");
    expect(!m.bold[k] && m.italic[k] && m.underline[k]).toBe(true);
  });

  it("커서만 꾸민 글 안에 있어도 끌 수 있고, 밖이면 null", () => {
    const off = applyFormat("**굵게** 글", 3, 3, "bold")!;
    expect(off.text).toBe("굵게 글");
    expect(applyFormat("그냥 글", 2, 2, "bold")).toBeNull();
  });

  it("글 일부만 꾸미고, 글자 그대로의 기호는 지키며, 정렬 기호는 지킨다", () => {
    expect(applyFormat("가나다라", 1, 3, "bold")!.text).toBe("가**나다**라");
    // 그대로 쓰면 *가 짝을 이뤄 모양이 바뀌므로 \\ 를 붙여 글자로 남긴다
    expect(applyFormat("**굵 글", 4, 5, "italic")!.text).toBe("\\*\\*굵 *글*");
    expect(plainText(applyFormat("**굵 글", 4, 5, "italic")!.text)).toBe("**굵 글");
    // 다시 읽어도 모양이 같으면 \\ 없이 그대로 둔다
    expect(applyFormat("별점 *** 좋다", 7, 9, "bold")!.text).toBe("별점 *** **좋다**");
    expect(applyFormat("min_jae 온다", 8, 10, "underline")!.text).toBe("min_jae _온다_");
    expect(applyFormat(">끝<", 1, 2, "bold")!.text).toBe(">**끝**<");
    expect(applyFormat(">끝", 1, 2, "underline")!.text).toBe(">_끝_");
  });
});
