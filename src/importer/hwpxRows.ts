/**
 * 한글(.hwpx)에서 문단과 들여쓰기를 뽑아 줄(Row)들로 만든다.
 * .hwpx는 zip 파일이고, 글은 Contents/section0.xml…, 문단 모양과 스타일은 Contents/header.xml에 들어 있다.
 */
import { unzipSync, strFromU8 } from "fflate";
import type { LineStyle } from "../editor/styles";
import { decode, styleHint } from "./docxRows";
import { CENTER_X, RIGHT_X, type Row, type Seg } from "./types";

type ParaShape = { left: number; align: string };
type Header = { shapes: Map<string, ParaShape>; styles: Map<string, LineStyle | undefined> };

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

/** header.xml에서 문단 모양(왼쪽 들여쓰기, 정렬)과 스타일 이름을 읽는다. 한글 단위 100 = 1pt */
function readHeader(xml: string): Header {
  const shapes = new Map<string, ParaShape>();
  for (const m of xml.matchAll(/<hh:paraPr\b([^>]*)>([\s\S]*?)<\/hh:paraPr>/g)) {
    const id = attr(m[1], "id");
    if (id === undefined) continue;
    const left = /<hc:left\s+value="(-?\d+)"/.exec(m[2])?.[1];
    const align = /<hh:align\b[^>]*\bhorizontal="(\w+)"/.exec(m[2])?.[1] ?? "";
    shapes.set(id, { left: left ? Math.max(0, Number(left) / 100) : 0, align });
  }
  const styles = new Map<string, LineStyle | undefined>();
  for (const m of xml.matchAll(/<hh:style\b[^>]*>/g)) {
    const id = attr(m[0], "id");
    const name = attr(m[0], "name");
    if (id !== undefined) styles.set(id, styleHint(name ? decode(name) : undefined));
  }
  return { shapes, styles };
}

function paragraphSegs(xml: string, header: Header): Seg[] {
  const open = /^<hp:p\b[^>]*>/.exec(xml)?.[0] ?? "";
  const shape = header.shapes.get(attr(open, "paraPrIDRef") ?? "");
  const hint = header.styles.get(attr(open, "styleIDRef") ?? "");
  let x = shape?.left ?? 0;
  if (shape?.align === "CENTER") x = CENTER_X;
  else if (shape?.align === "RIGHT") x = RIGHT_X;

  // 글, 탭, 줄바꿈을 차례로 읽는다 (<hp:t> 안에 탭이 섞여 있기도 하다)
  const parts: string[] = [""];
  let inText = false;
  for (const m of xml.slice(open.length).matchAll(/<hp:tab\b[^>]*>|<hp:lineBreak\b[^>]*>|<hp:t\b[^>]*>|<\/hp:t>|([^<]+)/g)) {
    const token = m[0];
    if (m[1] !== undefined) {
      if (inText) parts[parts.length - 1] += decode(m[1]);
    } else if (token.startsWith("<hp:tab")) parts.push("");
    else if (token.startsWith("<hp:lineBreak")) parts[parts.length - 1] += "\n";
    else if (token === "</hp:t>") inText = false;
    else inText = !token.endsWith("/>");
  }
  const segs: Seg[] = [];
  const useHint = hint && parts.filter((p) => p.trim()).length === 1;
  parts.forEach((part, i) => {
    for (const piece of part.split("\n")) {
      const text = piece.replace(/\s+/g, " ").trim();
      if (!text) continue;
      // 이름 + 대사 뒤에 탭으로 들여 쓴 글은 줄을 바꿔 이어 쓴 대사다
      if (segs.length >= 2) segs[segs.length - 1].text += ` ${text}`;
      else segs.push({ x: x + (i > 0 ? 200 * i : 0), text, ...(useHint && i === 0 ? { hint } : {}) });
    }
  });
  return segs;
}

export function extractHwpxRows(data: Uint8Array): Row[] {
  const files = unzipSync(data, { filter: (f) => f.name === "Contents/header.xml" || /^Contents\/section\d+\.xml$/.test(f.name) });
  const sections = Object.keys(files)
    .filter((name) => name.startsWith("Contents/section"))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
  if (sections.length === 0) throw new Error("한글 문서 안에서 글을 찾지 못했습니다.");
  const header: Header = files["Contents/header.xml"] ? readHeader(strFromU8(files["Contents/header.xml"])) : { shapes: new Map(), styles: new Map() };

  const rows: Row[] = [];
  // 표는 문단 안(<hp:p><hp:run><hp:tbl>)에 들어 있으니, 표를 품은 문단은 건너뛰고 표를 먼저 읽는다
  const block = /<hp:tbl\b[\s\S]*?<\/hp:tbl>|<hp:p\b(?:(?!<hp:tbl\b)[\s\S])*?<\/hp:p>/g;
  for (const name of sections) {
    for (const m of strFromU8(files[name]).matchAll(block)) {
      if (m[0].startsWith("<hp:tbl")) {
        // 표: 줄마다 칸 글을 차례로 (인물 | 대사 같은 두 칸 표)
        for (const tr of m[0].match(/<hp:tr\b[\s\S]*?<\/hp:tr>/g) ?? []) {
          const cells = (tr.match(/<hp:tc\b[\s\S]*?<\/hp:tc>/g) ?? []).map((tc) =>
            (tc.match(/<hp:p\b[\s\S]*?<\/hp:p>/g) ?? []).flatMap((p) => paragraphSegs(p, header).map((s) => s.text)).join(" "),
          );
          const segs: Seg[] = cells.map((text, i) => ({ x: i * 200, text })).filter((s) => s.text);
          if (segs.length) rows.push({ page: 1, y: rows.length, segs, paragraph: true });
        }
      } else {
        const segs = paragraphSegs(m[0], header);
        if (segs.length) rows.push({ page: 1, y: rows.length, segs, paragraph: true });
      }
    }
  }
  return rows;
}
