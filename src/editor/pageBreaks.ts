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
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { paginate, type PageBreak } from "../layout/paginate";
import { lineStylesField, scriptLines } from "./lineStyles";

type PageInfo = {
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

function row(className: string, text: string) {
  const el = document.createElement("div");
  el.className = `pb-row ${className}`;
  el.textContent = text;
  return el;
}

class PageBreakWidget extends WidgetType {
  constructor(readonly info: PageBreak) {
    super();
  }
  eq(other: PageBreakWidget) {
    const a = this.info;
    const b = other.info;
    return a.page === b.page && a.usedRows === b.usedRows && a.more === b.more && a.contd === b.contd;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-page-break";
    el.setAttribute("aria-label", `${this.info.page}페이지 시작`);
    if (this.info.more) el.appendChild(row("pb-more", "(MORE)"));

    const bottom = document.createElement("div");
    bottom.className = "pb-bottom";
    bottom.style.height = remainingHeight(this.info.usedRows);
    el.appendChild(bottom);

    const gap = document.createElement("div");
    gap.className = "pb-gap";
    el.appendChild(gap);

    const top = document.createElement("div");
    top.className = "pb-top";
    const number = document.createElement("span");
    number.className = "pb-number";
    number.textContent = `${this.info.page}.`;
    top.appendChild(number);
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
  constructor(readonly usedRows: number) {
    super();
  }
  eq(other: PageEndWidget) {
    return other.usedRows === this.usedRows;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-page-end";
    el.style.height = remainingHeight(this.usedRows);
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

// 페이지 맨 위 줄은 앞 빈 줄을 없앤다. (실제 페이지와 같게)
const pageTopLine = Decoration.line({ class: "sl-page-top" });

function compute(state: EditorState): PageInfo {
  const { pages, pageOfLine, breaks, lastPageRows } = paginate(scriptLines(state));
  return { pageOfLine, total: pages.length, breaks, lastPageRows };
}

function buildDecorations(state: EditorState, info: PageInfo): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const brk of info.breaks) {
    if (brk.beforeLine < 1 || brk.beforeLine > state.doc.lines) continue;
    const from = state.doc.line(brk.beforeLine).from;
    ranges.push(
      Decoration.widget({ widget: new PageBreakWidget(brk), block: true, side: -1 }).range(from),
      pageTopLine.range(from),
    );
  }
  ranges.push(
    Decoration.widget({ widget: new PageEndWidget(info.lastPageRows), block: true, side: 1 }).range(
      state.doc.length,
    ),
  );
  return Decoration.set(ranges, true);
}

type PaginationState = PageInfo & { decorations: DecorationSet };

/** 페이지 경계와 페이지 수. 글을 고치면 잠시 뒤(입력이 멈췄을 때) 다시 계산한다. */
export const paginationField = StateField.define<PaginationState>({
  create(state) {
    const info = compute(state);
    return { ...info, decorations: buildDecorations(state, info) };
  },
  update(value, tr) {
    let next = value;
    if (tr.docChanged) next = { ...next, decorations: next.decorations.map(tr.changes) };
    for (const effect of tr.effects) {
      if (effect.is(setPagination)) {
        next = { ...effect.value, decorations: buildDecorations(tr.state, effect.value) };
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field, (v) => v.decorations),
});

const RECOMPUTE_DELAY = 250;

const paginationScheduler = ViewPlugin.fromClass(
  class {
    timer: number | undefined;

    constructor(readonly view: EditorView) {}

    update(update: ViewUpdate) {
      const changed =
        update.docChanged ||
        update.startState.field(lineStylesField) !== update.state.field(lineStylesField);
      // 새 문서를 불러온 경우(setState)에는 create()에서 이미 계산했다.
      if (!changed) return;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        const info = compute(this.view.state);
        this.view.dispatch({ effects: setPagination.of(info) });
      }, RECOMPUTE_DELAY);
    }

    destroy() {
      window.clearTimeout(this.timer);
    }
  },
);

export function pageBreaks() {
  return [paginationField, paginationScheduler];
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
