import {
  EditorSelection,
  type ChangeSpec,
  type Extension,
  EditorState,
  StateEffect,
  StateField,
  type StateCommand,
  type Transaction,
} from "@codemirror/state";
import { invertedEffects } from "@codemirror/commands";
import { toUpperLatin } from "../layout/metrics";
import { numberScenes, type SceneNumber } from "../layout/sceneNumbers";
import {
  DEFAULT_STYLE,
  NEXT_STYLE_ON_ENTER,
  getNextStyleRules,
  characterName,
  cycleStyle,
  type LineStyle,
} from "./styles";

export type ScriptLine = { style: LineStyle; text: string };

// 줄 하나의 스타일을 바꾸는 효과. pos는 바뀐 뒤 문서 기준 위치(그 줄 안 아무 곳).
export const setLineStyleEffect = StateEffect.define<{
  pos: number;
  style: LineStyle;
}>({
  map: (value, mapping) => ({ pos: mapping.mapPos(value.pos), style: value.style }),
});

/**
 * 되돌리기(⌘Z) 지원: 스타일이 바뀌거나 글이 바뀐 줄의 "이전 스타일"을
 * 되돌리기 기록에 함께 남긴다. 그래서 스타일만 바꾼 것도 ⌘Z로 되돌릴 수 있고,
 * 지운 줄을 되살릴 때 그 줄의 스타일도 함께 돌아온다.
 */
const styleHistory = invertedEffects.of((tr) => {
  const before = tr.startState;
  const oldStyles = before.field(lineStylesField, false);
  if (!oldStyles) return [];
  const lines = new Set<number>();

  if (tr.docChanged) {
    tr.changes.iterChangedRanges((fromA, toA) => {
      const first = before.doc.lineAt(fromA).number;
      const last = before.doc.lineAt(toA).number;
      for (let n = first; n <= last; n++) lines.add(n);
    });
  }
  for (const effect of tr.effects) {
    if (!effect.is(setLineStyleEffect)) continue;
    // 효과 위치는 바뀐 뒤 문서 기준이므로 바뀌기 전 위치로 되돌려 찾는다.
    const pos = tr.docChanged ? tr.changes.invertedDesc.mapPos(effect.value.pos) : effect.value.pos;
    if (pos >= 0 && pos <= before.doc.length) lines.add(before.doc.lineAt(pos).number);
  }

  return [...lines].map((n) =>
    setLineStyleEffect.of({ pos: before.doc.line(n).from, style: oldStyles[n - 1] }),
  );
});

/**
 * 줄마다의 스타일 목록. styles[i]는 (i + 1)번째 줄의 스타일이다.
 *
 * 글이 바뀌면 바뀐 구간만 다시 계산한다.
 * - 바뀐 구간의 첫 줄은 원래 첫 줄의 스타일을 유지한다.
 *   (단, 줄 전체를 지워서 다음 줄이 올라온 경우에는 올라온 줄의 스타일)
 * - 바뀐 구간의 마지막 줄은 원래 마지막 줄의 스타일을 유지한다. (줄 나누기)
 * - 붙여넣기로 새로 생긴 가운데 줄들은 기본 스타일(액션)이 된다.
 */
export const lineStylesField = StateField.define<readonly LineStyle[]>({
  create(state) {
    return Array.from({ length: state.doc.lines }, () => DEFAULT_STYLE);
  },
  update(styles, tr) {
    let next = tr.docChanged ? mapStyles(styles, tr) : styles;
    for (const effect of tr.effects) {
      if (!effect.is(setLineStyleEffect)) continue;
      const { pos, style } = effect.value;
      if (pos < 0 || pos > tr.state.doc.length) continue;
      const index = tr.state.doc.lineAt(pos).number - 1;
      if (next[index] === style) continue;
      if (next === styles) next = styles.slice();
      (next as LineStyle[])[index] = style;
    }
    return next;
  },
});

function mapStyles(old: readonly LineStyle[], tr: Transaction): LineStyle[] {
  const oldDoc = tr.startState.doc;
  const newDoc = tr.state.doc;
  const out: LineStyle[] = [];
  let consumed = 0; // 이미 처리한 옛 문서의 마지막 줄 번호

  tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    const a1 = oldDoc.lineAt(fromA);
    const a2 = oldDoc.lineAt(toA);
    const b1 = newDoc.lineAt(fromB).number;
    const b2 = newDoc.lineAt(toB).number;

    for (let n = consumed + 1; n < a1.number; n++) out.push(old[n - 1]);

    // 줄 맨 앞부터 다음 줄 맨 앞까지 지운 경우: 아래 줄이 올라온 것
    const wholeLinesDeleted =
      inserted.length === 0 && fromA === a1.from && toA === a2.from && a2.number > a1.number;
    const firstStyle = wholeLinesDeleted ? old[a2.number - 1] : old[a1.number - 1];

    if (out.length < b1) out.push(firstStyle);
    for (let n = b1 + 1; n <= b2; n++) {
      // 줄바꿈(Enter)할 때는 다음 줄 스타일이 항상 규칙(씬헤딩/서브헤더/전환/대사 → 액션, 인물/괄호 → 대사 등)을 따르도록 보장한다.
      const prev = old[a2.number - 1];
      const isSingleNewline = b2 === b1 + 1;
      const nextStyle = isSingleNewline ? NEXT_STYLE_ON_ENTER[prev] : prev;
      out[n - 1] = n === b2 ? nextStyle : DEFAULT_STYLE;
    }
    out.length = b2;
    consumed = a2.number;
  });

  for (let n = consumed + 1; n <= oldDoc.lines; n++) out.push(old[n - 1]);
  return out;
}

// ---------- 씬 번호 ----------

export type { SceneNumber } from "../layout/sceneNumbers";

/** 첫 씬의 번호를 바꾼다. (스크립트 설정의 "씬 번호 시작") */
export const setSceneStartEffect = StateEffect.define<number>();

/** 첫 씬의 번호. 기본 1 */
export const sceneStartField = StateField.define<number>({
  create: () => 1,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setSceneStartEffect)) return effect.value;
    return value;
  },
});

export function computeSceneNumbers(
  state: EditorState,
  styles: readonly LineStyle[],
): Map<number, SceneNumber> {
  return numberScenes(styles, (n) => state.doc.line(n).text, state.field(sceneStartField, false) ?? 1);
}

export const sceneNumbersField = StateField.define<Map<number, SceneNumber>>({
  create(state) {
    return computeSceneNumbers(state, state.field(lineStylesField));
  },
  update(value, tr) {
    const styles = tr.state.field(lineStylesField);
    const startChanged = tr.effects.some((e) => e.is(setSceneStartEffect));
    if (!startChanged && !tr.docChanged && tr.startState.field(lineStylesField) === styles) return value;
    return computeSceneNumbers(tr.state, styles);
  },
});

// ---------- 읽기 ----------

export function styleAtLine(state: EditorState, lineNumber: number): LineStyle {
  return state.field(lineStylesField)[lineNumber - 1] ?? DEFAULT_STYLE;
}

export function currentStyle(state: EditorState): LineStyle {
  const line = state.doc.lineAt(state.selection.main.head);
  return styleAtLine(state, line.number);
}

export function scriptLines(state: EditorState): ScriptLine[] {
  const styles = state.field(lineStylesField);
  const lines: ScriptLine[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    lines.push({ style: styles[n - 1], text: state.doc.line(n).text });
  }
  return lines;
}

/** 인물 스타일로 지정된 줄에서 이름을 모은다. 등장 순서대로, 중복 없이. */
export function characterNames(state: EditorState, skipLine?: number): string[] {
  const styles = state.field(lineStylesField);
  const names = new Set<string>();
  for (let n = 1; n <= state.doc.lines; n++) {
    if (n === skipLine || styles[n - 1] !== "character") continue;
    const name = characterName(state.doc.line(n).text);
    if (name) names.add(name);
  }
  return [...names];
}

/** 씬헤딩 줄의 글을 원고 순서대로 모두. ("S#3." 같은 손으로 쓴 번호는 뗀다.) */
export function sceneHeadingTexts(state: EditorState, skipLine?: number): string[] {
  const styles = state.field(lineStylesField);
  const out: string[] = [];
  for (let n = 1; n <= state.doc.lines; n++) {
    if (n === skipLine || styles[n - 1] !== "scene") continue;
    const text = state.doc.line(n).text.replace(/^(?:S\s*#|#)\s*\d+\.?\s*/i, "").trim();
    if (text) out.push(text);
  }
  return out;
}

/**
 * 한글 입력 중에 Enter를 누르면 줄바꿈이 두 번(\n\n) 한꺼번에 들어올 수 있다.
 * 직접 친 글에서 한 번에 줄바꿈이 둘 들어오는 일은 없으므로 하나로 줄인다.
 * (붙여넣기·끌어다 놓기·자동 완성은 그대로 둔다)
 */
export const singleEnterFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent("input")) return tr;
  if (tr.isUserEvent("input.paste") || tr.isUserEvent("input.drop") || tr.isUserEvent("input.complete")) return tr;
  let count = 0;
  let change: { from: number; to: number; text: string } | null = null;
  tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    count++;
    change = { from, to, text: inserted.toString() };
  });
  const only = change as { from: number; to: number; text: string } | null;
  if (count !== 1 || !only || !only.text.endsWith("\n\n")) return tr;
  const insert = only.text.slice(0, -1);
  return [
    {
      changes: { from: only.from, to: only.to, insert },
      selection: EditorSelection.cursor(only.from + insert.length),
      effects: tr.effects,
      userEvent: "input",
      scrollIntoView: tr.scrollIntoView,
    },
  ];
});

// ---------- 문서 만들기 ----------

export function createScriptState(
  lines: ScriptLine[],
  extensions: Extension = [],
  /** 첫 씬의 번호 */
  sceneStart = 1,
): EditorState {
  const source = lines.length > 0 ? lines : [{ style: DEFAULT_STYLE, text: "" }];
  const styles = source.map((l) => l.style);
  return EditorState.create({
    doc: source.map((l) => l.text).join("\n"),
    extensions: [
      lineStylesField.init(() => styles),
      sceneStartField.init(() => sceneStart),
      sceneNumbersField,
      singleEnterFilter,
      styleHistory,
      extensions,
    ],
  });
}

// ---------- 명령 ----------

/**
 * 괄호지문이 되는 줄의 글을 괄호로 감싼다. 이미 감싸져 있으면 손대지 않는다.
 * 빈 줄은 "()"로 만들고, 커서가 있던 줄이면 괄호 안에 둔다.
 */
function parentheticalWrap(
  state: EditorState,
  lineNumber: number,
): { changes: ChangeSpec[]; cursor?: number } {
  const line = state.doc.line(lineNumber);
  const text = line.text;
  const trimmed = text.trim();
  if (trimmed === "") return { changes: [{ from: line.from, to: line.to, insert: "()" }], cursor: line.from + 1 };
  const open = trimmed.startsWith("(") || trimmed.startsWith("（");
  const close = trimmed.endsWith(")") || trimmed.endsWith("）");
  if (open && close) return { changes: [] };
  const changes: ChangeSpec[] = [];
  if (!open) changes.push({ from: line.from, insert: "(" });
  if (!close) changes.push({ from: line.to, insert: ")" });
  return { changes };
}

/** 스타일을 바꾸는 효과와, 괄호지문이면 괄호로 감싸는 글 고침을 함께 만든다. */
function styleTransaction(state: EditorState, lineNumbers: number[], style: LineStyle) {
  const effects: StateEffect<{ pos: number; style: LineStyle }>[] = [];
  const changes: ChangeSpec[] = [];
  let selection: EditorSelection | undefined;
  for (const n of lineNumbers) {
    effects.push(setLineStyleEffect.of({ pos: state.doc.line(n).from, style }));
    if (style !== "parenthetical" || styleAtLine(state, n) === "parenthetical") continue;
    const wrap = parentheticalWrap(state, n);
    changes.push(...wrap.changes);
    const head = state.selection.main.head;
    if (state.selection.main.empty && state.doc.lineAt(head).number === n) {
      const line = state.doc.line(n);
      if (wrap.cursor !== undefined) selection = EditorSelection.single(wrap.cursor);
      // 줄 맨 끝(또는 맨 앞)에 있던 커서는 괄호가 붙은 뒤에도 맨 끝(맨 앞)에 둔다. (Tab을 이어서 누를 수 있게)
      else if (wrap.changes.length && head === line.to) selection = EditorSelection.single(line.to + wrap.changes.length);
      else if (wrap.changes.length && head === line.from) selection = EditorSelection.single(line.from);
    }
  }
  return state.update({ effects, changes, selection, userEvent: changes.length ? "input.style" : "style" });
}

/** 선택한 줄(들)의 스타일을 바꾼다. */
export function setStyle(style: LineStyle): StateCommand {
  return ({ state, dispatch }) => {
    const lines: number[] = [];
    const seen = new Set<number>();
    for (const range of state.selection.ranges) {
      const first = state.doc.lineAt(range.from).number;
      const last = state.doc.lineAt(range.to).number;
      for (let n = first; n <= last; n++) {
        if (seen.has(n)) continue;
        seen.add(n);
        lines.push(n);
      }
    }
    dispatch(styleTransaction(state, lines, style));
    return true;
  };
}

/**
 * Enter: 줄을 나누고 새 줄의 스타일을 정한다.
 * - 줄 끝에서 누르면 규칙에 따라 다음 스타일 (인물 → 대사 등)
 * - 줄 중간에서 누르면 같은 스타일로 나뉜다.
 */
export const insertScriptNewline: StateCommand = ({ state, dispatch }) => {
  if (state.selection.ranges.length > 1) return false;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const style = styleAtLine(state, line.number);
  const lineEndPos = state.doc.lineAt(range.to).to;
  const textAfterCursor = state.sliceDoc(range.to, lineEndPos);
  const atLineEnd = range.to === lineEndPos || textAfterCursor.trim() === "";
  const isHeaderOrSingle =
    style === "scene" ||
    style === "subheader" ||
    style === "transition" ||
    style === "character";
  const enterRules = getNextStyleRules();
  const newStyle = isHeaderOrSingle || atLineEnd ? (enterRules[style] ?? "action") : style;
  const newLineStart = range.from + 1;
  // 새 줄이 괄호지문이면 "()"를 미리 넣고 커서를 괄호 안에 둔다.
  const wrapped = newStyle === "parenthetical" && atLineEnd;
  const insert = wrapped ? "\n()" : "\n";

  dispatch(
    state.update({
      changes: { from: range.from, to: range.to, insert },
      selection: EditorSelection.cursor(wrapped ? newLineStart + 1 : newLineStart),
      effects: setLineStyleEffect.of({ pos: newLineStart, style: newStyle }),
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

/**
 * Tab / Shift+Tab: 빈 줄이거나 커서가 줄 맨 앞·맨 끝일 때 스타일을 순환한다.
 * 그 밖의 경우에도 Tab이 다른 곳으로 포커스를 옮기지 않도록 막는다.
 */
export function cycleLineStyle(direction: 1 | -1): StateCommand {
  return ({ state, dispatch }) => {
    const range = state.selection.main;
    if (!range.empty) return true;
    const line = state.doc.lineAt(range.head);
    if (line.length > 0 && range.head !== line.from && range.head !== line.to) return true;
    const style = cycleStyle(styleAtLine(state, line.number), direction);
    dispatch(styleTransaction(state, [line.number], style));
    return true;
  };
}

// ---------- 인물 이름 일괄 바꾸기 ----------

export type CharacterRename = {
  changes: ChangeSpec[];
  /** 바뀐 인물 이름 줄 수 */
  characterLines: number;
  /** 바뀐 씬헤딩/서브헤더/지문/대사 속 이름 수 */
  textHits: number;
};

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 인물 이름 바꾸기.
 * - 인물 스타일 줄: 이름 부분만 바꾸고 (V.O.) 같은 표시는 그대로 둔다.
 * - everywhere면 씬헤딩·서브헤더·액션·괄호지문·대사 속의 이름도 바꾼다. ("민재가" → "준호가")
 * oldKey는 인물 묶음 키 (괄호 표시를 뗀 이름, 영문은 대문자).
 */
export function renameCharacter(
  state: EditorState,
  oldKey: string,
  newName: string,
  everywhere: boolean,
  /** 이 이름을 품은 다른 인물 이름 (예: "민재"를 바꿀 때 "민재석") — 그 자리는 바꾸지 않는다 */
  otherNames: string[] = [],
): CharacterRename {
  const name = newName.trim();
  const styles = state.field(lineStylesField);
  const changes: ChangeSpec[] = [];
  let characterLines = 0;
  let textHits = 0;
  if (!name || !oldKey) return { changes, characterLines, textHits };

  const pattern = new RegExp(escapeRegExp(oldKey), "gi");
  const longer = otherNames.map((n) => toUpperLatin(n)).filter((n) => n !== oldKey && n.includes(oldKey));
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n);
    const style = styles[n - 1];
    if (style === "character") {
      const current = characterName(line.text);
      if (toUpperLatin(current) !== oldKey) continue;
      const at = line.text.indexOf(current);
      changes.push({ from: line.from + at, to: line.from + at + current.length, insert: name });
      characterLines++;
    } else if (
      everywhere &&
      (style === "action" || style === "dialogue" || style === "parenthetical" || style === "scene" || style === "subheader")
    ) {
      const upper = toUpperLatin(line.text);
      for (const match of line.text.matchAll(pattern)) {
        const index = match.index ?? 0;
        // "민재석" 같은 다른 인물 이름의 일부면 건너뛴다.
        if (longer.some((other) => {
          const offset = other.indexOf(oldKey);
          return upper.startsWith(other, index - offset);
        })) continue;
        const from = line.from + index;
        changes.push({ from, to: from + match[0].length, insert: name });
        textHits++;
      }
    }
  }
  return { changes, characterLines, textHits };
}
