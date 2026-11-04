import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromFountain, toFountain } from "../fountain/fountain";
import type { ScriptLine } from "../editor/lineStyles";
import { ELEMENTS, outlineLineRows, paginate, previousPrinted } from "./paginate";

const load = (name: string) => readFileSync(new URL(`../../samples/${name}`, import.meta.url), "utf8");

describe("테스트용 한글 원고", () => {
  it("단편 원고는 약 5페이지", () => {
    const doc = fromFountain(load("short-5p.fountain"));
    const { pages } = paginate(doc.lines);
    expect(pages.length).toBeGreaterThanOrEqual(4);
    expect(pages.length).toBeLessThanOrEqual(6);
  });

  it("장편 원고는 약 100페이지이고, 계산이 빠르다", () => {
    const doc = fromFountain(load("long-100p.fountain"));
    const start = performance.now();
    const { pages } = paginate(doc.lines);
    const elapsed = performance.now() - start;
    expect(pages.length).toBeGreaterThanOrEqual(95);
    expect(pages.length).toBeLessThanOrEqual(105);
    expect(elapsed).toBeLessThan(200);
    // 대사가 페이지를 넘어가는 경우가 실제로 들어 있어야 한다.
    expect(pages.some((p) => p.lines.some((l) => l.text === "(MORE)"))).toBe(true);
  });

  it("두 원고 모두 저장 → 열기 후 내용이 같다", () => {
    for (const name of ["short-5p.fountain", "long-100p.fountain"]) {
      const doc = fromFountain(load(name));
      expect(fromFountain(toFountain(doc))).toEqual(doc);
    }
  });

  it("막·장·요약 줄을 아무 데나 끼워도 인쇄되는 쪽 나눔은 그대로이고, 줄 수 합계가 맞는다", () => {
    const base = fromFountain(load("long-100p.fountain")).lines;
    const expected = paginate(base);
    // 정해진 규칙으로 흩뿌린다 (매번 같은 결과)
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const kinds = ["act", "chapter", "synopsis"] as const;
    const mixed: ScriptLine[] = [];
    for (const line of base) {
      if (next() < 0.08) {
        const style = kinds[Math.floor(next() * 3)];
        const text = "가나다 ".repeat(Math.floor(next() * 40)).trim();
        mixed.push({ style, text });
      }
      mixed.push(line);
    }
    const extra = mixed.reduce((sum, l, i) => sum + (["act", "chapter", "synopsis"].includes(l.style) ? outlineLineRows(mixed, i) : 0), 0);
    const got = paginate(mixed);
    expect(got.pages.length).toBe(expected.pages.length);
    expect(got.pages.map((p) => p.lines.map((l) => `${l.row}:${l.style}:${l.text}`))).toEqual(
      expected.pages.map((p) => p.lines.map((l) => `${l.row}:${l.style}:${l.text}`)),
    );
    // 쪽 맨 위 줄 바로 앞에 막·장·요약이 있으면 화면은 그 줄 위 빈 줄을 남긴다. 그만큼도 센다.
    let keptGaps = 0;
    for (const p of got.pages) {
      const top = p.lines.find((l) => l.source > 0)?.source;
      if (top === undefined || top === 1 || !["act", "chapter", "synopsis"].includes(mixed[top - 2].style)) continue;
      const style = mixed[top - 1].style as keyof typeof ELEMENTS;
      const continued = style === "action" && previousPrinted(mixed, top - 1)?.style === "action";
      keptGaps += continued ? 0 : ELEMENTS[style].before;
    }
    // 페이지마다 센 화면 줄 수를 모두 더하면 끼워 넣은 줄 수와 같다
    const counted = got.breaks.reduce((sum, b) => sum + b.outlineRows, 0) + got.lastPageOutlineRows;
    expect(counted).toBe(extra + keptGaps);
    // 쪽 맨 위 줄 표시는 막·장·요약 줄에 붙지 않는다
    for (const n of got.pageTopLines) expect(["act", "chapter", "synopsis"]).not.toContain(mixed[n - 1].style);
  });
});
