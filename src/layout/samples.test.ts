import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fromFountain, toFountain } from "../fountain/fountain";
import { paginate } from "./paginate";

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
});
