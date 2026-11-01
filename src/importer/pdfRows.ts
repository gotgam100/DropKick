/**
 * PDF에서 글자와 그 위치를 뽑아 줄(Row)들로 만든다. (pdf.js 사용)
 * pdf.js 모듈은 앱에서는 importDocument.ts가, 시험에서는 시험 코드가 넘겨 준다.
 */
import type { Row, Seg } from "./types";

type PdfItem = { str: string; transform: number[]; width: number; height: number; fontName?: string };
type PdfJs = {
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
};
type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    getTextContent: () => Promise<{ items: (PdfItem | { type: string })[] }>;
  }>;
  destroy?: () => Promise<void>;
};

/** 같은 줄에서 이만큼(글자 크기의 배수) 떨어지면 다른 덩어리로 본다 */
const SEGMENT_GAP_EM = 1.8;
/** 위아래가 이 정도(글자 크기의 배수) 이내면 같은 줄이다 */
const SAME_LINE_EM = 0.45;

export async function extractPdfRows(data: Uint8Array, pdfjs: PdfJs): Promise<Row[]> {
  const doc = await pdfjs.getDocument({ data }).promise;
  const rows: Row[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items = content.items.filter((i): i is PdfItem => "str" in i && i.str.trim() !== "")
        // 기울어진 글(워터마크)은 본문이 아니다
        .filter((i) => Math.abs(i.transform[1]) < 0.02 * (Math.abs(i.transform[3]) || 10) && Math.abs(i.transform[2]) < 0.02 * (Math.abs(i.transform[0]) || 10)).map((i) => ({
        text: i.str.replace(/\u0000/g, " "),
        x: i.transform[4],
        top: viewport.height - i.transform[5],
        size: Math.abs(i.transform[3]) || i.height || 10,
        width: i.width,
        font: i.fontName,
      }));
      // 위에서 아래로, 같은 줄이면 왼쪽에서 오른쪽으로
      items.sort((a, b) => a.top - b.top || a.x - b.x);
      const lines: (typeof items)[] = [];
      for (const item of items) {
        const line = lines[lines.length - 1];
        if (line && Math.abs(item.top - line[0].top) <= item.size * SAME_LINE_EM) line.push(item);
        else lines.push([item]);
      }
      for (const line of lines) {
        line.sort((a, b) => a.x - b.x);
        const segs: Seg[] = [];
        const fontChars: Map<string, number>[] = [];
        let end = -Infinity;
        for (const item of line) {
          const last = segs[segs.length - 1];
          if (last && item.x - end < item.size * SEGMENT_GAP_EM) {
            // 같은 덩어리: 사이가 벌어졌으면 띄어쓰기
            const gap = item.x - end;
            last.text += (gap > item.size * 0.2 ? " " : "") + item.text;
          } else {
            segs.push({ x: Math.round(item.x * 10) / 10, text: item.text, font: item.font, size: item.size });
            fontChars.push(new Map());
          }
          end = item.x + item.width;
          segs[segs.length - 1].right = end;
          const chars = fontChars[fontChars.length - 1];
          if (item.font) chars.set(item.font, (chars.get(item.font) ?? 0) + item.text.trim().length);
        }
        // 덩어리의 글꼴은 가장 많이 쓰인 글꼴 (따옴표 하나만 다른 글꼴이어도 휘둘리지 않게)
        segs.forEach((seg, i) => {
          const best = [...fontChars[i].entries()].sort((a, b) => b[1] - a[1])[0];
          if (best) seg.font = best[0];
        });
        rows.push({
          page: p,
          y: line[0].top,
          segs,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
        });
      }
    }
  } finally {
    await doc.destroy?.();
  }
  return rows;
}
