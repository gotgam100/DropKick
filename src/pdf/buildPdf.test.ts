import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFNumber } from "pdf-lib";
import { fromFountain } from "../fountain/fountain";
import { paginate } from "../layout/paginate";
import { buildExtraSection } from "../export/extras";
import { createDefaultStructureBoard, serializeStructureBoard } from "../structure/structureModel";
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

  it("막·장·씬 요약 줄은 PDF에 들어가지 않아 페이지 수가 그대로다", async () => {
    const doc = fromFountain(readFileSync(new URL("samples/short-5p.fountain", root), "utf8"));
    const withOutline = {
      ...doc,
      lines: doc.lines.flatMap((l) =>
        l.style === "scene"
          ? [{ style: "act" as const, text: "막 이름 ".repeat(30) }, l, { style: "synopsis" as const, text: "요약 ".repeat(50) }]
          : [l],
      ),
    };
    const a = await PDFDocument.load(await buildPdf(doc, fonts));
    const b = await PDFDocument.load(await buildPdf(withOutline, fonts));
    expect(b.getPageCount()).toBe(a.getPageCount());
  });

  it("막·장·요약을 넣기로 하면 PDF에 들어가서 줄이 늘어난다", async () => {
    const doc = fromFountain(readFileSync(new URL("samples/short-5p.fountain", root), "utf8"));
    const lines = doc.lines.flatMap((l) =>
      l.style === "scene"
        ? [{ style: "act" as const, text: "막 이름" }, l, { style: "synopsis" as const, text: "요약 ".repeat(200) }]
        : [l],
    );
    const without = paginate(lines).pages.length;
    const withPrint = paginate(lines, undefined, 1, { sections: true, synopsis: true }).pages.length;
    expect(withPrint).toBeGreaterThan(without);
    const pdf = await PDFDocument.load(await buildPdf({ ...doc, lines, printOutline: { sections: true, synopsis: true } }, fonts));
    expect(pdf.getPageCount()).toBe(1 + withPrint);
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

  it("부록: 원고 없이 문서와 3막 구조 표만 담을 수 있다", async () => {
    const longText = Array.from({ length: 120 }, (_, i) => `- 항목 ${i} 아주 긴 설명이 이어집니다 ${"가나다 ".repeat(20)}`).join("\n");
    const board = createDefaultStructureBoard();
    board.beats[1].synopsis = "요약 ".repeat(400);
    const extras = [
      buildExtraSection("character", "민재", `# 민재\n\n${longText}`),
      buildExtraSection("structure", "구조", serializeStructureBoard(board)),
    ];
    const bytes = await buildPdf(null, fonts, extras);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(3);
    // 원고도 함께 담으면 그만큼 페이지가 늘어난다
    const doc = fromFountain(readFileSync(new URL("samples/short-5p.fountain", root), "utf8"));
    const both = await PDFDocument.load(await buildPdf(doc, fonts, extras));
    expect(both.getPageCount()).toBe(pdf.getPageCount() + 1 + paginate(doc.lines).pages.length);
  });

  /** 한 쪽에 불투명도 0.1(ca)인 그래픽 설정이 있는지 */
  const hasTenPercent = (pdf: PDFDocument, index: number) => {
    const states = pdf.getPage(index).node.Resources()?.lookup(PDFName.of("ExtGState"));
    if (!(states instanceof PDFDict)) return false;
    return states.values().some((v) => {
      const dict = pdf.context.lookup(v);
      const ca = dict instanceof PDFDict ? dict.lookup(PDFName.of("ca")) : undefined;
      return ca instanceof PDFNumber && Math.abs(ca.asNumber() - 0.1) < 1e-9;
    });
  };

  it("워터마크: 모든 쪽(표지 포함)에 기울어진 글이 불투명도 10%로 반복해서 찍힌다", async () => {
    const doc = fromFountain(readFileSync(new URL("samples/short-5p.fountain", root), "utf8"));
    const plain = await buildPdf(doc, fonts);
    const marked = await buildPdf(doc, fonts, [], { watermark: "홍길동 전용 외부 유출 금지" });
    const pdf = await PDFDocument.load(marked);
    const plainPdf = await PDFDocument.load(plain);
    expect(pdf.getPageCount()).toBe(plainPdf.getPageCount());
    for (let i = 0; i < pdf.getPageCount(); i++) {
      expect(hasTenPercent(pdf, i)).toBe(true);
      expect(hasTenPercent(plainPdf, i)).toBe(false);
    }
    expect(marked.length).toBeGreaterThan(plain.length);
    const out = process.env.DROPKICK_PDF_OUT;
    if (out) writeFileSync(`${out}/watermark.pdf`, marked);
  });

  it("워터마크가 비어 있으면 찍지 않는다", async () => {
    const doc = fromFountain(readFileSync(new URL("samples/short-5p.fountain", root), "utf8"));
    const bytes = await buildPdf(doc, fonts, [], { watermark: "   " });
    const pdf = await PDFDocument.load(bytes);
    for (let i = 0; i < pdf.getPageCount(); i++) expect(hasTenPercent(pdf, i)).toBe(false);
  });

  it("글자 꾸밈과 가운데 정렬이 있어도 쪽 수가 화면 계산과 같다", async () => {
    const doc = {
      titlePage: null,
      lines: [
        { style: "scene" as const, text: "내부. 방 - 낮" },
        { style: "action" as const, text: "**굵게** *기울임* _밑줄_ 일반 글자가 이어진다. ".repeat(6) },
        { style: "action" as const, text: ">끝<" },
      ],
    };
    const pdf = await PDFDocument.load(await buildPdf(doc, fonts));
    expect(pdf.getPageCount()).toBe(paginate(doc.lines).pages.length);
  });
});
