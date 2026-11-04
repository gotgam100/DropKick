import { EditorSelection, EditorState, Prec, type Extension, type Range, StateEffect, StateField} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type Command,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { loadSettings } from "../settings/settings";
import { scriptClipboard } from "./clipboard";
import {
  characterNames,
  cycleLineStyle,
  insertScriptNewline,
  lineStylesField,
  sceneHeadingTexts,
  sceneNumbersField,
  setLineStyleEffect,
  sceneBackspaceToAction,
  setStyle,
  styleAtLine,
} from "./lineStyles";
import { headingProblem, knownPlaces, knownTimes, parseHeading } from "../analysis/places";
import { DEFAULT_STYLE, LINE_STYLES, isOutlineStyle, styleLabel, type DocStyle, type OutlineStyle } from "./styles";
import { ELEMENTS, OUTLINE_WIDTH } from "../layout/paginate";
import { textColumns } from "../layout/metrics";
import { fountainAffixes } from "../fountain/fountain";
import { actionIndent, alignOf, applyFormat, hasInline, inlineMarks, supportsInline, type Align, type FormatKind } from "../layout/inline";

// 줄 장식은 (스타일, 앞 줄과 이어지는지, 현재 줄인지) 조합마다 한 번만 만든다.
const lineDecorationCache = new Map<string, Decoration>();

function lineDecoration(style: DocStyle, continued: boolean, current: boolean): Decoration {
  const key = `${style}|${continued}|${current}`;
  let deco = lineDecorationCache.get(key);
  if (!deco) {
    let cls = `sl sl-${style}`;
    if (continued) cls += " sl-continued";
    if (current) cls += " sl-current";
    deco = Decoration.line({
      class: cls,
      attributes: current ? { "data-style": styleLabel(style) } : undefined,
    });
    lineDecorationCache.set(key, deco);
  }
  return deco;
}

// 단어 중간에서 줄이 바뀌지 않게 하는 표시. 브라우저는 "7,800"이나 따옴표 뒤에서도
// 줄을 끊는데, 페이지 계산은 띄어쓰기에서만 끊으므로 화면도 그렇게 맞춘다.
// (줄보다 긴 단어는 표시하지 않아 글자 단위로 끊긴다. 페이지 계산도 같다.)
// 빈 원고의 안내 글. CodeMirror의 placeholder는 글을 쓰는 순간 화면 요소가 지워져서,
// 한글을 처음 칠 때 조합이 끊겼다. (ㅅㅣ) 그래서 요소 없이 CSS 글자로만 보여 준다.
const emptyDocLine = Decoration.line({ class: "cm-doc-empty" });
const noWrapMark = Decoration.mark({ class: "cm-nowrap" });
const WORD = /\S+/g;
const headingWarnMark = Decoration.mark({ class: "cm-heading-warn" });
const centerLine = Decoration.line({ class: "sl-center" });
const rightLine = Decoration.line({ class: "sl-right" });
const markerMark = Decoration.replace({});
const fountainMarkerMark = Decoration.mark({ class: "cm-inline-mark" });

/** Fountain 보기: 켜면 원고 화면은 그대로 두고, 줄마다 Fountain 기호(. @ > # 등)와 꾸밈 기호를 겹쳐 보여 준다. */
export const setFountainModeEffect = StateEffect.define<boolean>();
export const fountainModeField = StateField.define<boolean>({
  create: () => false,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFountainModeEffect)) return e.value;
    return value;
  },
});

class FountainAffixWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: FountainAffixWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-fountain-affix";
    span.textContent = this.text;
    return span;
  }
  ignoreEvent() {
    return true;
  }
}
const inlineMarkCache = new Map<string, Decoration>();
function inlineMark(bold: boolean, italic: boolean, underline: boolean): Decoration {
  const key = `${bold}${italic}${underline}`;
  let deco = inlineMarkCache.get(key);
  if (!deco) {
    deco = Decoration.mark({ class: `${bold ? "cm-em-b " : ""}${italic ? "cm-em-i " : ""}${underline ? "cm-em-u" : ""}`.trim() });
    inlineMarkCache.set(key, deco);
  }
  return deco;
}

// 앞 줄과 같은 스타일이 이어질 때 문단 사이 빈 줄 없이 붙여 쓰는 스타일
const CONTINUOUS_STYLES = new Set<DocStyle>(["action"]);

// 씬헤딩 좌우 여백에 붙는 자동 씬 번호 (할리우드 촬영고 표준)
class SceneNumberWidget extends WidgetType {
  constructor(readonly number: number) {
    super();
  }
  eq(other: SceneNumberWidget) {
    return other.number === this.number;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-scene-number";

    const left = document.createElement("span");
    left.className = "cm-scene-num-left";
    left.textContent = `${this.number}`;

    const right = document.createElement("span");
    right.className = "cm-scene-num-right";
    right.textContent = `${this.number}`;

    span.appendChild(left);
    span.appendChild(right);
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

// 화면에 보이는 줄에만 스타일 장식을 붙인다. (100페이지 원고에서도 가볍게)
const styleDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.startState.field(fountainModeField) !== update.state.field(fountainModeField) ||
        update.startState.field(lineStylesField) !== update.state.field(lineStylesField) ||
        update.startState.field(sceneNumbersField) !== update.state.field(sceneNumbersField)
      ) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const { state } = view;
      const styles = state.field(lineStylesField);
      const scenes = state.field(sceneNumbersField);
      const fountain = state.field(fountainModeField);
      const marker = fountain ? fountainMarkerMark : markerMark;
      const currentLine = state.doc.lineAt(state.selection.main.head).number;
      const ranges: Range<Decoration>[] = [];
      let lastLine = 0;
      // 처음 그릴 때처럼 보이는 범위가 아직 없으면 문서 전체를 본다. (빈 원고에도 첫 줄 장식이 붙도록)
      const visible = view.visibleRanges.length > 0 ? view.visibleRanges : [{ from: 0, to: state.doc.length }];
      for (const { from, to } of visible) {
        let pos = from;
        while (pos <= to) {
          const line = state.doc.lineAt(pos);
          if (line.number > lastLine) {
            const style = styles[line.number - 1];
            // 앞 줄이 같은 스타일이면 이어 붙인다. 막·장·요약 줄은 인쇄되지 않으니 건너뛰고 본다.
            let above = line.number - 2;
            while (above >= 0 && isOutlineStyle(styles[above])) above--;
            // 요약 줄은 바로 앞 줄이 요약일 때만 이어 붙인다 (요약은 인쇄되지 않아 건너뛰지 않는다)
            const continued =
              style === "synopsis"
                ? styles[line.number - 2] === "synopsis"
                : style === "chapter"
                  ? styles[line.number - 2] === "act"
                  : CONTINUOUS_STYLES.has(style) && styles[above] === style;
            const current = line.number === currentLine && view.hasFocus;
            ranges.push(lineDecoration(style, continued, current).range(line.from));
            if (state.doc.length === 0) ranges.push(emptyDocLine.range(line.from));

            const width = isOutlineStyle(style) ? OUTLINE_WIDTH : ELEMENTS[style].width;
            for (const match of line.text.matchAll(WORD)) {
              if (match[0].length > 1 && textColumns(match[0]) <= width) {
                const from = line.from + (match.index ?? 0);
                ranges.push(noWrapMark.range(from, from + match[0].length));
              }
            }

            // 들여 쓴 액션: 들여쓴 만큼 줄 전체를 안쪽으로 (줄이 바뀌어도 같은 자리에서 시작한다. PDF와 같다)
            if (style === "action") {
              const indent = actionIndent(line.text);
              if (indent > 0) {
                ranges.push(Decoration.line({ attributes: { style: `padding-left:${indent * 0.1}in;text-indent:-${indent * 0.1}in` } }).range(line.from));
              }
            }

            // 씬헤딩이 "실내. 장소명 - 시간대" 모양이 아니면 물결 밑줄로 알린다. (쓰는 줄은 알리지 않는다)
            if (style === "scene" && line.number !== currentLine && line.text.length > 0) {
              const problem = headingProblem(line.text);
              if (problem) {
                ranges.push(Decoration.line({ attributes: { title: problem } }).range(line.from));
                ranges.push(headingWarnMark.range(line.from, line.to));
              }
            }

            // 글자 꾸밈(**굵게** *기울임* _밑줄_)과 가운데 정렬(>글<): 기호는 흐리게, 글은 꾸밈을 입힌다.
            if (supportsInline(style) && hasInline(line.text)) {
              const align = style === "action" ? alignOf(line.text) : "left";
              if (align === "center") ranges.push(centerLine.range(line.from));
              if (align === "right") ranges.push(rightLine.range(line.from));
              const marks = inlineMarks(line.text, align);
              let start = 0;
              const kind = (i: number) => (marks.marker[i] ? "m" : `${marks.bold[i]}${marks.italic[i]}${marks.underline[i]}`);
              for (let i = 1; i <= line.text.length; i++) {
                if (i < line.text.length && kind(i) === kind(start)) continue;
                const k = kind(start);
                if (k === "m") ranges.push(marker.range(line.from + start, line.from + i));
                else if (k !== "falsefalsefalse")
                  ranges.push(inlineMark(marks.bold[start], marks.italic[start], marks.underline[start]).range(line.from + start, line.from + i));
                start = i;
              }
            } else if (!supportsInline(style) && hasInline(line.text)) {
              // 꾸밈을 쓰지 않는 줄: 짝 맞는 꾸밈 기호와 \ 표시만 숨긴다. (줄 스타일을 바꿔도 기호가 튀어나오지 않는다)
              // 짝 없는 * _ 는 글자라서 그대로 보인다. 인쇄(stripMarks)와 같은 규칙이다.
              const marks = inlineMarks(line.text);
              for (let i = 0; i < line.text.length; i++) {
                if (marks.marker[i]) ranges.push(marker.range(line.from + i, line.from + i + 1));
              }
            }

            const scene = scenes.get(line.number);
            if (fountain) {
              const { prefix, suffix } = fountainAffixes({ style, text: line.text }, scene?.number ?? 0);
              if (prefix) ranges.push(Decoration.widget({ widget: new FountainAffixWidget(prefix), side: -1 }).range(line.from));
              if (suffix) ranges.push(Decoration.widget({ widget: new FountainAffixWidget(suffix), side: 1 }).range(line.to));
            } else if (scene && !scene.manual) {
              ranges.push(
                Decoration.widget({ widget: new SceneNumberWidget(scene.number), side: -1 }).range(
                  line.from,
                ),
              );
            }
            lastLine = line.number;
          }
          pos = line.to + 1;
        }
      }
      return Decoration.set(ranges, true);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** 아무것도 안 쓴 막·장·요약 줄인가 */
function isEmptyOutlineLine(state: EditorState, lineNumber: number): boolean {
  return isOutlineStyle(styleAtLine(state, lineNumber)) && state.doc.line(lineNumber).text === "";
}

/** 빈 막·장·요약 줄을 처음 모양(액션)으로 되돌린다. 줄은 그대로 있고 막 표시만 사라진다. */
function exitOutline(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  view.dispatch({
    effects: setLineStyleEffect.of({ pos: line.from, style: DEFAULT_STYLE }),
    userEvent: "input.style",
  });
  return true;
}

/** Enter·Backspace: 빈 막·장·요약 줄에서는 줄을 나누거나 합치지 않고 액션으로 돌아간다. */
const exitEmptyOutline = (view: EditorView): boolean => {
  const { state } = view;
  if (!state.selection.main.empty) return false;
  const line = state.doc.lineAt(state.selection.main.head);
  return isEmptyOutlineLine(state, line.number) ? exitOutline(view) : false;
};

/**
 * 줄 맨 앞에서 `# `(막), `## `(장), `= `(씬 요약)을 치면 그 줄이 막·장·요약 줄이 된다.
 * 기호는 글에서 사라지고 줄 스타일만 바뀐다. (⌘Z로 `#`가 있는 글로 돌아간다)
 * `#`만 쳤을 때는 `##`를 쓰는 중일 수 있어서 띄어쓰기를 누르는 순간에 바뀐다.
 * 요약은 씬헤딩이나 다른 요약 줄 바로 아래에서만 만들어진다.
 */
export function outlineStyleFor(state: EditorState, lineNumber: number, typed: string): OutlineStyle | null {
  if (typed === "#") return "act";
  if (typed === "##") return "chapter";
  if (typed === "=" && lineNumber > 1) {
    const above = styleAtLine(state, lineNumber - 1);
    if (above === "scene" || above === "synopsis") return "synopsis";
  }
  return null;
}

const outlineInput = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== " " || from !== to || view.state.selection.ranges.length > 1) return false;
  const line = view.state.doc.lineAt(from);
  // 아무것도 안 쓴 막·장·요약 줄에서 띄어쓰기를 한 번 더 치면 처음 모양(액션)으로 돌아간다.
  if (isEmptyOutlineLine(view.state, line.number)) return exitOutline(view);
  const style = outlineStyleFor(view.state, line.number, view.state.sliceDoc(line.from, from));
  if (!style) return false;
  view.dispatch({
    changes: { from: line.from, to: from },
    selection: EditorSelection.cursor(line.from),
    effects: setLineStyleEffect.of({ pos: line.from, style }),
    userEvent: "input.type",
  });
  return true;
});

/**
 * 커서 줄이 정확히 `# `, `## `, `= `뿐이면 바꿀 스타일과 지울 범위를 알려 준다. (아니면 null)
 * 입력기에 따라 글이 들어오는 모양이 달라서, 위 inputHandler 말고도 글이 다 들어온 뒤의 모양으로 다시 잡는다.
 */
export function outlineMarkerAt(
  state: EditorState,
  /** 띄어쓰기 글자가 없어도(띄어쓰기 키를 막 눌렀을 때) `#`·`##`·`=`뿐이면 알아본다 */
  spaceOptional = false,
): { style: OutlineStyle; from: number; to: number } | null {
  const sel = state.selection.main;
  if (!sel.empty || state.selection.ranges.length > 1) return null;
  const line = state.doc.lineAt(sel.head);
  // 입력기·웹뷰에 따라 띄어쓰기가 보통 공백이 아닌 글자(줄 안 바뀌는 공백 등)로 들어올 수 있어서 \s로 본다.
  const pattern = spaceOptional ? /^(?:#{1,2}|=)\s?$/ : /^(?:#{1,2}|=)\s$/;
  if (!pattern.test(line.text) || sel.head !== line.to) return null;
  const style = outlineStyleFor(state, line.number, line.text.trimEnd());
  return style ? { style, from: line.from, to: line.to } : null;
}

/**
 * 한글 입력기는 `##` 뒤 첫 띄어쓰기를 글자로 넣지 않고 조합만 끝낼 때가 있다.
 * 띄어쓰기로 보이는 입력(키 누름·뗌, beforeinput, 조합 끝)이 있으면, 글이 자리 잡은 뒤에 같은 규칙으로 본다.
 */
function convertOutlineMarker(view: EditorView, tries = 10) {
  if (view.composing && tries > 0) return void setTimeout(() => convertOutlineMarker(view, tries - 1), 40);
  const marker = outlineMarkerAt(view.state, true);
  if (!marker) return;
  view.dispatch({
    changes: { from: marker.from, to: marker.to },
    selection: EditorSelection.cursor(marker.from),
    effects: setLineStyleEffect.of({ pos: marker.from, style: marker.style }),
    userEvent: "input.type",
  });
}

const looksLikeSpace = (e: Event) => {
  const k = e as KeyboardEvent & InputEvent & CompositionEvent;
  return k.code === "Space" || k.key === " " || k.data === " " || (typeof k.data === "string" && /\s$/.test(k.data));
};

const outlineSpaceKey = EditorView.domEventHandlers({
  keydown: (e, view) => (looksLikeSpace(e) && !e.metaKey && !e.ctrlKey && !e.altKey ? (setTimeout(() => convertOutlineMarker(view), 30), false) : false),
  keyup: (e, view) => (looksLikeSpace(e) ? (setTimeout(() => convertOutlineMarker(view), 10), false) : false),
  beforeinput: (e, view) => (looksLikeSpace(e) ? (setTimeout(() => convertOutlineMarker(view), 30), false) : false),
  compositionend: (e, view) => (looksLikeSpace(e) ? (setTimeout(() => convertOutlineMarker(view), 10), false) : false),
});

const outlineWatcher = ViewPlugin.fromClass(
  class {
    private waiting = false;

    update(update: ViewUpdate) {
      if (!update.docChanged || this.waiting) return;
      // 붙여넣기·끌어다 놓기·자동 완성·되돌리기로 들어온 글은 그대로 둔다.
      const skip = ["undo", "redo", "input.paste", "input.drop", "input.complete", "delete"];
      if (update.transactions.some((tr) => skip.some((e) => tr.isUserEvent(e)))) return;
      this.waiting = true;
      const view = update.view;
      // 갱신이 끝난 뒤(한글 조합이 끝난 뒤)에 본다.
      const check = (tries: number) => {
        if (view.composing && tries > 0) return void setTimeout(() => check(tries - 1), 40);
        this.waiting = false;
        const marker = outlineMarkerAt(view.state);
        if (!marker) return;
        view.dispatch({
          changes: { from: marker.from, to: marker.to },
          selection: EditorSelection.cursor(marker.from),
          effects: setLineStyleEffect.of({ pos: marker.from, style: marker.style }),
          userEvent: "input.type",
        });
      };
      setTimeout(() => check(10), 0);
    }
  },
);

/** 선택한 글을 marker로 감싸거나(이미 감싸져 있으면 벗기고), 선택이 없으면 기호 한 쌍을 넣는다. */
/** 굵게·기울임·밑줄을 켜거나 끈다. 셋은 한꺼번에 겹쳐 쓸 수 있다. */
function toggleFormat(kind: FormatKind): Command {
  const marker = kind === "bold" ? "**" : kind === "italic" ? "*" : "_";
  return (view) => {
    const { state } = view;
    // 글자 꾸밈은 액션·대사·괄호지문에서만 쓴다.
    const styles = state.field(lineStylesField);
    if (!state.selection.ranges.every((r) => supportsInline(styles[state.doc.lineAt(r.from).number - 1]))) return false;
    const tr = state.changeByRange((range) => {
      const line = state.doc.lineAt(range.from);
      if (range.to > line.to) return { range }; // 여러 줄에 걸친 선택은 줄마다 따로 골라 주세요
      {
        const done = applyFormat(line.text, range.from - line.from, range.to - line.from, kind);
        if (done) {
          return {
            changes: { from: line.from, to: line.to, insert: done.text },
            range: EditorSelection.range(line.from + done.from, line.from + done.to),
          };
        }
      }
      // 커서만 있고 꾸민 글 밖이면, 기호 한 쌍을 넣고 그 사이에서 이어 쓴다. (쓴 글이 바로 꾸며진다)
      return {
        changes: { from: range.from, insert: marker + marker },
        range: EditorSelection.cursor(range.from + marker.length),
      };
    });
    view.dispatch(tr, { scrollIntoView: true, userEvent: "input" });
    return true;
  };
}

/** 선택한 액션 줄들을 네 칸 들여 쓴다. */
const indentLines: Command = (view) => {
  const { state } = view;
  const styles = state.field(lineStylesField);
  const changes: { from: number; insert: string }[] = [];
  const seen = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (seen.has(n) || styles[n - 1] !== "action") continue;
      seen.add(n);
      const line = state.doc.line(n);
      if (line.text.trim() !== "") changes.push({ from: line.from, insert: "    " });
    }
  }
  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent: "input" });
  return true;
};

/** 선택한 액션 줄들의 들여쓰기를 네 칸 줄인다. */
const outdentLines: Command = (view) => {
  const { state } = view;
  const styles = state.field(lineStylesField);
  const changes: { from: number; to: number }[] = [];
  const seen = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (seen.has(n) || styles[n - 1] !== "action") continue;
      seen.add(n);
      const line = state.doc.line(n);
      const m = /^(?: {1,4}|\t)/.exec(line.text);
      if (m) changes.push({ from: line.from, to: line.from + m[0].length });
    }
  }
  if (changes.length === 0) return false;
  view.dispatch({ changes, userEvent: "input" });
  return true;
};

/** 고른 액션 줄들(커서만 있으면 그 줄)의 정렬을 바꾼다. 왼쪽은 보통 줄, 가운데는 >글<, 오른쪽은 >글 */
function setAlign(align: Align): Command {
  return (view) => {
    const { state } = view;
    const styles = state.field(lineStylesField);
    const changes: { from: number; to: number; insert: string }[] = [];
    const seen = new Set<number>();
    for (const r of state.selection.ranges) {
      for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
        if (seen.has(n) || styles[n - 1] !== "action") continue;
        seen.add(n);
        const line = state.doc.line(n);
        if (line.text.trim() === "") continue;
        const current = alignOf(line.text);
        if (current === align) continue;
        let body = line.text.trim();
        if (current === "center") body = body.slice(1, -1).trim();
        else if (current === "right") body = body.slice(1).trim();
        const insert = align === "center" ? `>${body}<` : align === "right" ? `>${body}` : body;
        changes.push({ from: line.from, to: line.to, insert });
      }
    }
    if (changes.length === 0) return false;
    view.dispatch({ changes, userEvent: "input" });
    return true;
  };
}

/** ⌘E: 가운데 정렬을 켜고 끈다. */
const toggleCenter: Command = (view) => {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  return setAlign(alignOf(line.text) === "center" ? "left" : "center")(view);
};

const styleKeymap = keymap.of([
  { key: "Mod-b", run: toggleFormat("bold") },
  { key: "Mod-i", run: toggleFormat("italic") },
  { key: "Mod-u", run: toggleFormat("underline") },
  { key: "Mod-e", run: toggleCenter },
  { key: "Mod-]", run: indentLines },
  { key: "Mod-[", run: outdentLines },
  { key: "Enter", run: exitEmptyOutline },
  { key: "Backspace", run: exitEmptyOutline },
  { key: "Backspace", run: sceneBackspaceToAction },
  { key: "Enter", run: insertScriptNewline },
  { key: "Tab", run: cycleLineStyle(1), shift: cycleLineStyle(-1) },
]);

/** 우클릭 메뉴 "글자 모양"이 보내는 일(dropkick:text-format)을 원고에서 처리한다. */
const TEXT_FORMATS: Record<string, Command> = {
  bold: toggleFormat("bold"),
  italic: toggleFormat("italic"),
  underline: toggleFormat("underline"),
  left: setAlign("left"),
  center: setAlign("center"),
  right: setAlign("right"),
  indent: indentLines,
  outdent: outdentLines,
};

/** 우클릭 "글자 모양"에서 어떤 항목을 쓸 수 있는지. 글자 꾸밈은 액션·대사·괄호지문, 정렬·들여쓰기는 액션에서만 된다. */
export function formatAvailability(view: EditorView): { inline: boolean; block: boolean } {
  const { state } = view;
  const styles = state.field(lineStylesField);
  const lines = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) lines.add(n);
  }
  const list = [...lines].map((n) => styles[n - 1]);
  return {
    inline: list.length > 0 && list.every((st) => supportsInline(st)),
    block: list.some((st) => st === "action"),
  };
}

const textFormatListener = ViewPlugin.fromClass(
  class {
    private readonly onFormat: (e: Event) => void;
    constructor(private readonly view: EditorView) {
      this.onFormat = (e) => {
        const run = TEXT_FORMATS[(e as CustomEvent<string>).detail];
        if (!run) return;
        run(this.view);
        this.view.focus();
      };
      window.addEventListener("dropkick:text-format", this.onFormat);
    }
    destroy() {
      window.removeEventListener("dropkick:text-format", this.onFormat);
    }
  },
);

// 스타일 단축키(⌘+숫자/키): 기본은 ⌘1~⌘7이고, 설정에서 바꾼 값을 실시간 반영한다.
const dynamicShortcutHandler = EditorView.domEventHandlers({
  keydown(e, view) {
    if (e.metaKey || e.ctrlKey) {
      const shortcuts = loadSettings().styleShortcuts;
      if (shortcuts) {
        for (const style of LINE_STYLES) {
          const key = shortcuts[style];
          if (key && e.key.toLowerCase() === key.toLowerCase()) {
            e.preventDefault();
            setStyle(style)(view);
            return true;
          }
        }
      }
    }
    return false;
  },
});

// 인물 스타일 줄에서 앞서 나온 이름을 자동 완성한다.
function characterCompletions(context: CompletionContext) {
  if (!loadSettings().characterAutocomplete) return null;
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  if (styleAtLine(state, line.number) !== "character") return null;
  const typed = state.sliceDoc(line.from, pos);
  if (!typed.trim() && !context.explicit) return null;
  const names = characterNames(state, line.number);
  if (names.length === 0) return null;
  return {
    from: line.from,
    to: line.to,
    options: names.map((name) => ({
      label: name,
      type: "character",
      apply: (view: EditorView, _completion: unknown, from: number, _to: number) => {
        const line = view.state.doc.lineAt(from);
        view.dispatch({
          changes: [{ from: line.from, to: line.to, insert: name + "\n" }],
          selection: EditorSelection.cursor(line.from + name.length + 1),
          effects: setLineStyleEffect.of({ pos: line.from + name.length + 1, style: "dialogue" }),
          scrollIntoView: true,
          userEvent: "input.complete",
        });
      },
    })),
    validFor: /^[^\n]*$/,
  };
}

// 씬헤딩 줄에서 앞서 쓴 장소(와 시간대)를 자동 완성한다.
// "내부."나 "외부."는 따지지 않고, 그 뒤에 이어지는 장소 이름으로 찾는다.
function sceneCompletions(context: CompletionContext) {
  if (!loadSettings().sceneAutocomplete) return null;
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  if (styleAtLine(state, line.number) !== "scene") return null;
  const typed = state.sliceDoc(line.from, pos);
  if (!typed.trim()) return null;
  const headings = sceneHeadingTexts(state, line.number);
  const parts = parseHeading(typed);

  let from: number;
  let names: string[];
  if (parts.time !== null) {
    // "-"만 쓰고 띄어쓰기를 하기 전에는 아직 아무것도 제안하지 않는다.
    if (parts.time === "" && !/[-–—]\s$/.test(typed)) return null;
    // 장소 뒤 " - "를 쓴 다음이면 시간대를 제안한다.
    from = pos - parts.time.length;
    names = knownTimes(headings, parts.place);
  } else {
    // 내부·외부 다음부터 쓰는 중인 장소 이름을 제안한다.
    from = pos - parts.place.length;
    names = knownPlaces(headings);
  }
  const typedPart = state.sliceDoc(from, pos);
  names = names.filter((n) => n !== typedPart);
  if (names.length === 0) return null;
  return {
    from,
    to: pos,
    // 자주 쓴 것이 위에 오도록 순서대로 점수를 준다. (안 주면 가나다순으로 섞인다)
    options: names.map((name, i) => ({ label: name, type: "scene", boost: -i })),
    validFor: /^[^\n]*$/,
  };
}

// lineStylesField는 createScriptState()가 넣어 준다.
export function scriptEditing(): Extension {
  return [
    fountainModeField,
    styleDecorations,
    scriptClipboard(),
    dynamicShortcutHandler,
    outlineInput,
    outlineWatcher,
    outlineSpaceKey,
    // 자동 완성 창이 열려 있을 때는 Enter가 이름 선택에 쓰이도록, 스타일 키는 그보다 낮게 둔다.
    Prec.high(styleKeymap),
    textFormatListener,
    autocompletion({
      override: [characterCompletions, sceneCompletions],
      icons: false,
      defaultKeymap: true,
    }),
  ];
}
