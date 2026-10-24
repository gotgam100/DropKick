import { StateEffect, StateField, type EditorState, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { paginate } from "../layout/paginate";
import { lineStylesField, scriptLines } from "./lineStyles";

type PageInfo = { pageOfLine: number[]; total: number };

const setPagination = StateEffect.define<PageInfo>();

class PageBreakWidget extends WidgetType {
  constructor(readonly page: number) {
    super();
  }
  eq(other: PageBreakWidget) {
    return other.page === this.page;
  }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-page-break";
    el.setAttribute("aria-label", `${this.page}페이지 시작`);
    const label = document.createElement("span");
    label.className = "cm-page-number";
    label.textContent = `${this.page}.`;
    el.appendChild(label);
    return el;
  }
  get estimatedHeight() {
    return 40;
  }
  ignoreEvent() {
    return true;
  }
}

// 페이지 맨 위 줄은 앞 빈 줄을 없앤다. (실제 페이지와 같게)
const pageTopLine = Decoration.line({ class: "sl-page-top" });

function compute(state: EditorState): PageInfo {
  const { pages, pageOfLine } = paginate(scriptLines(state));
  return { pageOfLine, total: pages.length };
}

function buildDecorations(state: EditorState, info: PageInfo): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const lines = Math.min(state.doc.lines, info.pageOfLine.length);
  for (let n = 2; n <= lines; n++) {
    const page = info.pageOfLine[n - 1];
    if (page > info.pageOfLine[n - 2]) {
      const from = state.doc.line(n).from;
      ranges.push(
        Decoration.widget({ widget: new PageBreakWidget(page), block: true, side: -1 }).range(from),
        pageTopLine.range(from),
      );
    }
  }
  return Decoration.set(ranges, true);
}

type PaginationState = PageInfo & { decorations: DecorationSet };

/** 페이지 경계선과 페이지 수. 글을 고치면 잠시 뒤(입력이 멈췄을 때) 다시 계산한다. */
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
