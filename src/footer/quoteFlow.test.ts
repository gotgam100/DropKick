import { describe, expect, it } from "vitest";
import {
  createQuoteDeck,
  CUSTOM_WEIGHT,
  customQuoteLines,
  limitCustomQuotes,
  MAX_PART_CHARS,
  quoteLabel,
  quotePool,
  randomDelay,
  splitQuote,
} from "./quoteFlow";
import { QUOTES } from "./quotes";

describe("명대사 목록", () => {
  it("100개이고 모두 대사와 작품명이 있다", () => {
    expect(QUOTES).toHaveLength(100);
    for (const q of QUOTES) {
      expect(q.text.trim()).not.toBe("");
      expect(q.work?.trim()).toBeTruthy();
      expect(q.year).toBeGreaterThanOrEqual(1950);
      expect(q.who?.trim()).toBeTruthy();
    }
  });
});

describe("푸터 명대사: 나누기", () => {
  it("짧은 문장은 그대로 둔다", () => {
    expect(splitQuote("나 다시 돌아갈래!")).toEqual(["나 다시 돌아갈래!"]);
  });

  it("긴 문장은 가운데 근처에서 한 번만 나눠 ...로 잇는다", () => {
    const text = "작가는 등장인물을 심판하는 판사가 아니라, 그들의 고통을 대신 말해주는 변호인이 되어야 한다.";
    const [head, tail, ...rest] = splitQuote(text);
    expect(rest).toEqual([]);
    expect(head.endsWith("...")).toBe(true);
    expect(tail.startsWith("...")).toBe(true);
  });

  it("두 조각으로도 안 들어가는 아주 긴 대사는 뒤를 ...로 줄인다", () => {
    const parts = splitQuote(QUOTES.find((q) => q.text.length > MAX_PART_CHARS * 2)!.text);
    expect(parts).toHaveLength(2);
    expect(parts[1].endsWith("...")).toBe(true);
    for (const part of parts) expect([...part].length).toBeLessThanOrEqual(MAX_PART_CHARS + 6);
  });

  it("모든 명대사가 두 조각 안에 들어간다", () => {
    for (const q of QUOTES) expect(splitQuote(q.text).length).toBeLessThanOrEqual(2);
  });
});

describe("푸터 명대사: 보여 주는 글", () => {
  it('"대사" <작품명>(연도), 인물명(배우) 순서로, 출처는 마지막 조각에만 붙인다', () => {
    const q = { text: "나 다시 돌아갈래!", work: "박하사탕", year: 2000, who: "영호(설경구)" };
    expect(quoteLabel("나 다시 돌아갈래!", q, true)).toBe('"나 다시 돌아갈래!" <박하사탕>(2000), 영호(설경구)');
    expect(quoteLabel("앞부분...", q, false)).toBe('"앞부분..."');
  });

  it("인물이 없으면 그 부분은 뺀다", () => {
    expect(quoteLabel("할 말", { text: "할 말", work: "작품", year: 1999 }, true)).toBe('"할 말" <작품>(1999)');
  });

  it("나만의 명대사는 적은 그대로 보인다", () => {
    expect(quoteLabel("내가 쓴 말", { text: "내가 쓴 말", custom: true }, true)).toBe("내가 쓴 말");
  });
});

describe("푸터 명대사: 나만의 명대사", () => {
  it("두 줄까지, 줄마다 100자까지만 받고 빈 줄은 뺀다", () => {
    expect(customQuoteLines("하나\n\n둘\n셋")).toEqual(["하나", "둘"]);
    expect(customQuoteLines("가".repeat(150))[0]).toHaveLength(100);
    expect(limitCustomQuotes("하나\n둘\n셋")).toBe("하나\n둘");
  });

  it("기본 명대사에 섞이고, 한 바퀴에 여러 번 나온다", () => {
    const pool = quotePool("내 대사");
    expect(pool).toHaveLength(QUOTES.length + CUSTOM_WEIGHT);
    expect(pool.filter((q) => q.custom)).toHaveLength(CUSTOM_WEIGHT);
    expect(quotePool("")).toHaveLength(QUOTES.length);
  });
});

describe("푸터 명대사: 순서와 시간", () => {
  it("한 바퀴를 돌 동안 같은 명대사가 겹치지 않는다", () => {
    const next = createQuoteDeck(QUOTES);
    const seen = new Set(Array.from({ length: QUOTES.length }, () => next().text));
    expect(seen.size).toBe(QUOTES.length);
  });

  it("바퀴가 바뀔 때 방금 본 명대사가 바로 또 나오지 않는다", () => {
    for (let trial = 0; trial < 50; trial++) {
      const next = createQuoteDeck(QUOTES.slice(0, 3));
      let prev = next();
      for (let i = 0; i < 20; i++) {
        const now = next();
        expect(now.text).not.toBe(prev.text);
        prev = now;
      }
    }
  });

  it("나만의 명대사처럼 같은 글이 여러 번 들어 있어도 연달아 나오지 않는다", () => {
    for (let trial = 0; trial < 300; trial++) {
      const next = createQuoteDeck(quotePool("내 대사\n두 번째 대사"));
      let prev = next().text;
      for (let i = 0; i < QUOTES.length * 3; i++) {
        const now = next().text;
        expect(now).not.toBe(prev);
        prev = now;
      }
    }
  });

  it("쉬는 시간은 범위 안에서 무작위로 정한다", () => {
    expect(randomDelay([1000, 3000], () => 0)).toBe(1000);
    expect(randomDelay([1000, 3000], () => 0.5)).toBe(2000);
    expect(randomDelay([1000, 3000], () => 1)).toBe(3000);
  });
});
