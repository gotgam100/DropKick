import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fromFountain } from "../fountain/fountain";
import { paginate } from "../layout/paginate";
import { FONT_PATHS, buildPdf, type FontFiles } from "./buildPdf";

const root = new URL("../../", import.meta.url);
const fonts = Object.fromEntries(
  Object.entries(FONT_PATHS).map(([k, p]) => [k, readFileSync(new URL(`public/${p}`, root))]),
) as unknown as FontFiles;

describe("PDF 내보내기", () => {
  it("단편 원고: 표지 + 본문 페이지 수가 화면 계산과 같다", async () => {
    const doc = fromFountain(readFileSync(new URL("samples/short-5p.fountain", root), "utf8"));
    const bytes = await buildPdf(doc, fonts);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1 + paginate(doc.lines).pages.length);
    expect(pdf.getTitle()).toBe("드롭킥");
    const { width, height } = pdf.getPage(0).getSize();
    expect([width, height]).toEqual([612, 792]);
    // 확인용 파일 저장 (DROPKICK_PDF_OUT=폴더 로 실행할 때만)
    const out = process.env.DROPKICK_PDF_OUT;
    if (out) writeFileSync(`${out}/short-5p.pdf`, bytes);
  });

  it("장편 원고 100페이지도 만들고, 글꼴은 쓴 글자만 담아 크기가 작다", async () => {
    const doc = fromFountain(readFileSync(new URL("samples/long-100p.fountain", root), "utf8"));
    const bytes = await buildPdf(doc, fonts);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1 + 100);
    expect(bytes.length).toBeLessThan(3_000_000);
    const out = process.env.DROPKICK_PDF_OUT;
    if (out) writeFileSync(`${out}/long-100p.pdf`, bytes);
  }, 30_000);
});
