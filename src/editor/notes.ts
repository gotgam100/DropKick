/**
 * 원고 메모: 글의 일부분에 붙이는 짧은 메모.
 * 메모가 붙은 글에는 밑줄이 그려진다. 앞에서 글을 고치면 메모 위치도 함께 따라 움직이고,
 * 메모가 붙은 글을 모두 지우면 메모도 함께 사라진다.
 * 메모는 원고 파일(.fountain)에 섞지 않고 project.json에 따로 저장한다. (인쇄·PDF에 나오지 않는다)
 */
import { RangeSet, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export type ScriptNote = {
  id: string;
  /** 원고 전체 글에서의 위치 (줄 사이는 줄바꿈 1글자) */
  from: number;
  to: number;
  /** 메모를 붙인 글. 불러올 때 위치가 맞는지 확인하는 데 쓴다. */
  quote: string;
  text: string;
  /** 어느 스크립트의 메모인지 (프로젝트에 스크립트가 여럿일 때. 편집기 안에서는 쓰지 않는다) */
  script?: string;
};

type NoteSpec = { id: string; text: string };

/** 메모 전체를 이 목록으로 바꾼다. */
export const setNotesEffect = StateEffect.define<ScriptNote[]>();

function toSet(notes: readonly ScriptNote[], length: number): DecorationSet {
  const ranges = notes
    .filter((n) => n.from >= 0 && n.to <= length && n.from < n.to)
    .map((n) => Decoration.mark({ class: "cm-note", spec: { id: n.id, text: n.text } satisfies NoteSpec }).range(n.from, n.to));
  return RangeSet.of(ranges, true);
}

export const notesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    let next = tr.docChanged ? value.map(tr.changes) : value;
    for (const effect of tr.effects) if (effect.is(setNotesEffect)) next = toSet(effect.value, tr.state.doc.length);
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** 지금 있는 메모 목록 (위치가 바뀌었으면 바뀐 위치로) */
export function notesOf(state: EditorState): ScriptNote[] {
  const notes: ScriptNote[] = [];
  const cursor = state.field(notesField).iter();
  while (cursor.value) {
    const spec = cursor.value.spec.spec as NoteSpec;
    notes.push({
      id: spec.id,
      from: cursor.from,
      to: cursor.to,
      quote: state.sliceDoc(cursor.from, cursor.to),
      text: spec.text,
    });
    cursor.next();
  }
  return notes;
}

/** 이 위치에 걸친 메모. 경계는 안쪽만 센다. */
export function noteAt(state: EditorState, pos: number): ScriptNote | null {
  return notesOf(state).find((n) => pos >= n.from && pos < n.to) ?? null;
}

/**
 * 저장해 둔 메모를 지금 글에 맞춘다.
 * 위치의 글이 메모를 붙였던 글과 같으면 그대로, 아니면 같은 글을 가장 가까운 곳에서 찾는다. 못 찾으면 버린다.
 */
export function restoreNotes(doc: string, notes: readonly ScriptNote[]): ScriptNote[] {
  const result: ScriptNote[] = [];
  for (const n of notes) {
    if (!n.quote) continue;
    if (doc.slice(n.from, n.to) === n.quote) {
      result.push(n);
      continue;
    }
    let best = -1;
    for (let at = doc.indexOf(n.quote); at !== -1; at = doc.indexOf(n.quote, at + 1)) {
      if (best === -1 || Math.abs(at - n.from) < Math.abs(best - n.from)) best = at;
    }
    if (best !== -1) result.push({ ...n, from: best, to: best + n.quote.length });
  }
  return result;
}

/** 원고 글의 위치(offset)가 몇 번째 줄(1부터)인지. 줄 사이는 줄바꿈 1글자로 센다. */
export function lineOfOffset(lineTexts: readonly string[], offset: number): number {
  let start = 0;
  for (let i = 0; i < lineTexts.length; i++) {
    const end = start + lineTexts[i].length;
    if (offset <= end) return i + 1;
    start = end + 1;
  }
  return Math.max(1, lineTexts.length);
}

/** 저장 파일에서 읽은 값을 믿지 않고 검사한다. */
export function parseNotes(value: unknown): ScriptNote[] {
  if (!Array.isArray(value)) return [];
  const notes: ScriptNote[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Record<string, unknown>;
    if (typeof n.id !== "string" || !n.id || ids.has(n.id)) continue;
    if (typeof n.from !== "number" || typeof n.to !== "number" || !(n.from >= 0) || !(n.to > n.from)) continue;
    if (typeof n.quote !== "string" || typeof n.text !== "string") continue;
    ids.add(n.id);
    const script = typeof n.script === "string" && n.script ? n.script : undefined;
    notes.push({ id: n.id, from: n.from, to: n.to, quote: n.quote, text: n.text, ...(script ? { script } : {}) });
  }
  return notes;
}

/** 메모가 붙은 글을 누르면 알려 준다. (글을 드래그해 고르는 중에는 열지 않는다) */
export function scriptNotes(onOpen: (id: string) => void): Extension {
  return [
    notesField,
    EditorView.domEventHandlers({
      click(event, view) {
        if (!view.state.selection.main.empty) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) return false;
        const note = noteAt(view.state, pos);
        if (note) onOpen(note.id);
        return false;
      },
    }),
  ];
}
