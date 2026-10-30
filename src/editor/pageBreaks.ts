/**
 * 화면을 PDF와 같은 "한 장씩 나뉜 종이"로 보여 준다.
 *
 * 페이지 계산(paginate) 결과로 페이지가 바뀌는 줄 앞에 경계 위젯을 넣는다. 위젯은
 *   앞 페이지의 (MORE) → 앞 페이지 남은 공간과 아래 여백 → 종이 사이 틈
 *   → 새 페이지 위 여백과 페이지 번호 → 새 페이지 맨 위 "이름 (CONT'D)"
 * 를 그린다. 화면의 한 줄 높이가 PDF의 한 줄과 같은 비율이므로, 한 장에 들어가는
 * 내용이 PDF와 똑같다.
 */
import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { paginate, type PageBreak, type Pagination } from "../layout/paginate";
import { lineStylesField, scriptLines } from "./lineStyles";

type PageInfo = {
  /** 페이지 계산 전체 결과 (분석 화면에서 다시 쓴다) */
  pagination: Pagination;
  pageOfLine: number[];
  total: number;
  breaks: PageBreak[];
  lastPageRows: number;
};

const setPagination = StateEffect.define<PageInfo>();

/** 앞 페이지에 쓰인 줄 수만큼 빼고 남은 높이 (본문 나머지 + 아래 여백 1인치) */
function remainingHeight(usedRows: number) {
  return `calc(10in - var(--line) * ${usedRows})`;
}

/** 화면에서 한 줄의 높이 (App.css의 --line과 같은 값) */
const LINE_PX = 20.796875;
const INCH_PX = 96;

/**
 * 위젯이 차지할 높이(px)를 미리 알려 준다.
 * 아직 화면에 그려 본 적 없는 위젯은 CodeMirror가 높이를 "한 줄쯤"으로 짐작하는데,
 * 페이지 경계 하나는 한 장(약 1000px)이라 짐작이 크게 틀려, 글이 길어질수록 위치 계산이 어긋나기 때문이다.
 */
function remainingPx(usedRows: number) {
  return 10 * INCH_PX - LINE_PX * usedRows;
}

function row(className: string, text: string) {
  const el = document.createElement("div");
  el.className = `pb-row ${className}`;
  el.textContent = text;
  return el;
}

class PageBreakWidget extends WidgetType {
  constructor(
    readonly info: PageBreak,
    readonly total: number,
  ) {
    super();
  }
  eq(other: PageBreakWidget) {
    const a = this.info;
    const b = other.info;
    return (
      a.page === b.page &&
      a.usedRows === b.usedRows &&
      a.more === b.more &&
      a.contd === b.contd &&
      this.total === other.total
    );
  }
  get estimatedHeight() {
    // 앞 페이지 남은 공간 + 종이 사이 틈(32px) + 새 페이지 위 여백(1in) + (MORE)·(CONT'D) 줄
    const rows = (this.info.more ? 1 : 0) + (this.info.contd ? 1 : 0);
    return remainingPx(this.info.usedRows) + 32 + INCH_PX + rows * LINE_PX;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-page-break";
    el.setAttribute("aria-label", `${this.info.page}페이지 시작`);
    if (this.info.more) el.appendChild(row("pb-more", "(MORE)"));

    const bottom = document.createElement("div");
    bottom.className = "pb-bottom";
    bottom.style.height = remainingHeight(this.info.usedRows);
    const number = document.createElement("span");
    number.className = "pb-number-bottom";
    number.textContent = `${this.info.page - 1}/${this.total}`;
    bottom.appendChild(number);
    el.appendChild(bottom);

    const gap = document.createElement("div");
    gap.className = "pb-gap";
    el.appendChild(gap);

    const top = document.createElement("div");
    top.className = "pb-top";
    el.appendChild(top);

    if (this.info.contd) el.appendChild(row("pb-contd", this.info.contd));
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

/** 마지막 페이지를 종이 한 장 높이까지 채운다. */
class PageEndWidget extends WidgetType {
  constructor(
    readonly usedRows: number,
    readonly total: number,
  ) {
    super();
  }
  eq(other: PageEndWidget) {
    return other.usedRows === this.usedRows && other.total === this.total;
  }
  get estimatedHeight() {
    return remainingPx(this.usedRows);
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-page-end";
    el.style.height = remainingHeight(this.usedRows);
    const number = document.createElement("span");
    number.className = "pb-number-bottom";
    number.textContent = `${this.total}/${this.total}`;
    el.appendChild(number);
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

// 페이지 맨 위 줄은 앞 빈 줄을 없앤다. (실제 페이지와 같게)
const pageTopLine = Decoration.line({ class: "sl-page-top" });

function compute(state: EditorState): PageInfo {
  const pagination = paginate(scriptLines(state));
  const { pages, pageOfLine, breaks, lastPageRows } = pagination;
  return { pagination, pageOfLine, total: pages.length, breaks, lastPageRows };
}

function buildDecorations(state: EditorState, info: PageInfo): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const brk of info.breaks) {
    if (brk.beforeLine < 1 || brk.beforeLine > state.doc.lines) continue;
    const from = state.doc.line(brk.beforeLine).from;
    ranges.push(
      Decoration.widget({ widget: new PageBreakWidget(brk, info.total), block: true, side: -1 }).range(from),
      pageTopLine.range(from),
    );
  }
  ranges.push(
    Decoration.widget({ widget: new PageEndWidget(info.lastPageRows, info.total), block: true, side: 1 }).range(
      state.doc.length,
    ),
  );
  return Decoration.set(ranges, true);
}

type PaginationState = PageInfo & { decorations: DecorationSet };

/** 페이지 경계와 페이지 수. 줄바꿈이나 수정 시 즉각 계산하여 화면 떨림을 방지한다. */
export const paginationField = StateField.define<PaginationState>({
  create(state) {
    const info = compute(state);
    return { ...info, decorations: buildDecorations(state, info) };
  },
  update(value, tr) {
    const stylesChanged =
      tr.startState.field(lineStylesField, false) !== tr.state.field(lineStylesField, false);
    if (tr.docChanged || stylesChanged) {
      const info = compute(tr.state);
      return { ...info, decorations: buildDecorations(tr.state, info) };
    }
    for (const effect of tr.effects) {
      if (effect.is(setPagination)) {
        return { ...effect.value, decorations: buildDecorations(tr.state, effect.value) };
      }
    }
    return value;
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});

export function pageBreaks() {
  return [paginationField];
}

/** 커서가 있는 줄의 페이지 번호 */
export function currentPage(state: EditorState): number {
  const { pageOfLine } = state.field(paginationField);
  const line = state.doc.lineAt(state.selection.main.head).number;
  return pageOfLine[Math.min(line, pageOfLine.length) - 1] ?? 1;
}

export function totalPages(state: EditorState): number {
  return state.field(paginationField).total;
}
