/**
 * Word(.docx)에서 문단과 들여쓰기를 뽑아 줄(Row)들로 만든다.
 * .docx는 zip 파일이고, 글은 word/document.xml에 들어 있다.
 */
import { unzipSync, strFromU8 } from "fflate";
import type { LineStyle } from "../editor/styles";
import { splitSpaced } from "./spaced";
import { CENTER_X, RIGHT_X, type Row, type Seg } from "./types";

export function decode(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

/** Word 문단 스타일 이름이 줄 스타일을 알려 주면 그것을 쓴다 (Final Draft 등에서 내보낸 문서) */
export function styleHint(name: string | undefined): LineStyle | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase().replace(/[\s_-]/g, "");
  if (/(scene|sceneheading|slugline|씬헤딩|씬|장면)/.test(n) && !/(number|번호)/.test(n)) return "scene";
  if (/(parenthetical|괄호)/.test(n)) return "parenthetical";
  if (/(character|인물|등장인물)/.test(n)) return "character";
  if (/(dialogue|dialog|대사|대화)/.test(n)) return "dialogue";
  if (/(transition|전환)/.test(n)) return "transition";
  if (/(subheader|서브헤더)/.test(n)) return "subheader";
  if (/(^action$|액션|지문)/.test(n)) return "action";
  return undefined;
}

type Para = { segs: Seg[] };

function paragraphSegs(xml: string, centerKeys: Map<string, number> = new Map()): Para | null {
  const style = /<w:pStyle\s+w:val="([^"]*)"/.exec(xml)?.[1];
  const hint = styleHint(style ? decode(style) : undefined);
  const left = /<w:ind\b[^>]*\bw:(?:left|start)="(-?\d+)"/.exec(xml)?.[1];
  const jc = /<w:jc\s+w:val="([^"]*)"/.exec(xml)?.[1];
  let x = left ? Math.max(0, Number(left) / 20) : 0;
  if (jc === "center") {
    // 가운데 맞춤만 쓰는 문서(구글 문서 등): 문단 스타일이 다르면 다른 자리로 본다 (인물 이름 / 대사)
    if (!centerKeys.has(style ?? "")) centerKeys.set(style ?? "", centerKeys.size);
    x = CENTER_X + 20 * centerKeys.get(style ?? "")!;
  }
  else if (jc === "right" || jc === "end") x = RIGHT_X;

  // 글, 탭, 줄바꿈을 차례로 읽는다
  const parts: string[] = [""];
  const token = /<w:t\b[^>]*>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(xml))) {
    if (m[1] !== undefined) parts[parts.length - 1] += decode(m[1]);
    else if (m[0].startsWith("<w:tab")) parts.push("");
    else parts[parts.length - 1] += "\n";
  }
  const segs: Seg[] = [];
  const useHint = hint && parts.filter((p) => p.trim()).length === 1;
  parts.forEach((part, i) => {
    for (const piece of part.split("\n")) {
      const pieces = splitSpaced(piece, x + (i > 0 ? 200 * i : 0));
      for (const one of pieces) {
        segs.push({ ...one, ...(style ? { block: style } : {}), ...(useHint && i === 0 && pieces.length === 1 ? { hint } : {}) });
      }
    }
  });
  return segs.length ? { segs } : null;
}

export function extractDocxRows(data: Uint8Array): Row[] {
  const files = unzipSync(data, { filter: (f) => f.name === "word/document.xml" });
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("Word 문서 안에서 글을 찾지 못했습니다.");
  const xml = strFromU8(doc);
  const rows: Row[] = [];
  const centerKeys = new Map<string, number>();
  const block = /<w:tbl[ >][\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  while ((m = block.exec(xml))) {
    if (m[0].startsWith("<w:tbl")) {
      // 표: 줄마다 칸 글을 차례로 (인물 | 대사 같은 두 칸 표)
      for (const tr of m[0].match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) ?? []) {
        const cells = (tr.match(/<w:tc[ >][\s\S]*?<\/w:tc>/g) ?? []).map((tc) =>
          (tc.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []).map((p) => paragraphSegs(p)).filter((p): p is Para => p !== null).flatMap((p) => p.segs.map((s) => s.text)).join(" "),
        );
        const segs: Seg[] = cells.map((text, i) => ({ x: i * 200, text })).filter((s) => s.text);
        if (segs.length) rows.push({ page: 1, y: rows.length, segs, paragraph: true });
      }
    } else {
      const para = paragraphSegs(m[0], centerKeys);
      if (para) rows.push({ page: 1, y: rows.length, segs: para.segs, paragraph: true });
    }
  }
  return rows;
}
