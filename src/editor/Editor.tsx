import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorSelection, type EditorState, type Extension, type Text } from "@codemirror/state";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { openSearchPanel, searchKeymap } from "@codemirror/search";
import { koreanSearchPhrases } from "./searchPhrases";
import { searchPanelDrag } from "./searchPanelDrag";
import { paperTheme } from "./theme";
import {
  characterNames,
  createScriptState,
  currentStyle,
  styleAtLine,
  lineStylesField,
  sceneNumbersField,
  sceneStartField,
  setSceneStartEffect,
  setLineStyleEffect,
  scriptLines,
  renameCharacter,
  setStyle,
  cycleLineStyle,
  type ScriptLine,
} from "./lineStyles";
import { sceneMoveSpec } from "./sceneMove";
import { keepOrphans, mergeOrphans, orphanChains, orphanInfo, previousScene, replaceLinesSpec } from "./synopsis";
import { scriptEditing, setFountainModeEffect } from "./scriptView";
import { notesOf, restoreNotes, scriptNotes, setNotesEffect, type ScriptNote } from "./notes";
import { currentPage, pageBreaks, paginationField, totalPages } from "./pageBreaks";
import { analyzeScript, type ScriptAnalysis } from "../analysis/analyze";
import type { DocStyle, LineStyle, OutlineStyle } from "./styles";
import { clampPosition, type ViewPosition } from "../project/viewPositions";

export type EditorInfo = {
  lines: number;
  chars: number;
  characters: number;
  scenes: number;
  page: number;
  pages: number;
  /** 커서가 있는 줄 번호 */
  line: number;
  style: DocStyle;
};

export type EditorHandle = {
  setStyle: (style: LineStyle) => void;
  /** 지금 줄을 다음 스타일로 (스타일 메뉴의 "다음 스타일") */
  nextStyle: () => void;
  /**
   * 사이드바에서 막·장·씬 요약을 만든다. 막·장은 line번 줄 앞(null이면 맨 끝)에 빈 줄로 넣고,
   * 요약은 line번 씬헤딩 아래(이미 있는 요약 뒤)에 넣는다. 새 줄로 커서를 옮긴다.
   */
  insertOutline: (kind: OutlineStyle, line: number | null) => void;
  /** 주인 없는 요약 처리: 앞 씬 요약으로 합치기 / 일반 글로 남기기 / 방금 한 것 되돌리기 */
  resolveOrphans: (mode: "merge" | "keep" | "undo") => void;
  /** 새 원고로 바꾼다. 되돌리기 기록도 새로 시작한다. position을 주면 그때 보던 자리(커서와 화면 위치)로 돌아간다. */
  load: (lines: ScriptLine[], position?: ViewPosition | null) => void;
  /** 지금 보고 있는 자리: 커서 위치와 화면 맨 위에 보이는 줄. 나중에 load로 돌아올 수 있다. */
  getViewPosition: () => ViewPosition | null;
  getLines: () => ScriptLine[];
  /** 지금 내용을 "저장된 상태"로 표시한다. */
  markSaved: () => void;
  /** 저장을 시작할 때의 상태를 기억해 둔다. (저장 중에 더 쓴 글은 "수정됨"으로 남게) */
  captureSaveState: () => SaveToken | null;
  /** 저장이 끝나면 저장을 시작했던 그 상태를 "저장된 상태"로 표시한다. */
  markSavedAt: (token: SaveToken) => void;
  undo: () => void;
  redo: () => void;
  find: () => void;
  /** Fountain 보기를 켜고 끈다. 원고는 그대로 두고 줄마다 Fountain 기호를 겹쳐 보여 준다. */
  setFountainMode: (on: boolean) => void;
  focus: () => void;
  /** 그 줄로 커서를 옮기고 화면 위쪽에 보이게 한다. */
  goToLine: (line: number) => void;
  /**
   * 씬 하나를 다른 씬헤딩 앞(null이면 맨 끝)으로 옮긴다. 한 번의 ⌘Z로 되돌릴 수 있다.
   * 옮긴 게 없으면 false.
   */
  moveScene: (fromLine: number, beforeLine: number | null) => boolean;
  /** 지금 고른 글 (고른 게 없으면 null) */
  selection: () => { from: number; to: number; text: string } | null;
  /** 글 범위가 화면에서 차지하는 곳 (메모 창을 그 글 밖에 띄우려고 쓴다) */
  rectOf: (from: number, to: number) => { top: number; bottom: number; left: number; right: number } | null;
  getNotes: () => ScriptNote[];
  /** 첫 씬의 번호를 바꾼다. (스크립트 설정의 "씬 번호 시작") 스크립트를 불러올 때도 이 값을 쓴다. */
  setSceneStart: (start: number) => void;
  /** 메모가 붙은 글을 골라 화면 가운데에 보이게 한다. (메모를 찾았으면 true) */
  selectNote: (id: string) => boolean;
  /** 저장해 둔 메모를 지금 글에 맞춰 붙인다. */
  setNotes: (notes: ScriptNote[]) => void;
  /** 메모를 새로 붙이거나(같은 id가 없으면) 내용을 고친다. */
  saveNote: (note: ScriptNote) => void;
  removeNote: (id: string) => void;
  /** 인물 이름 일괄 바꾸기. apply가 false면 바꿀 곳 수만 센다. (한 번의 ⌘Z로 되돌릴 수 있다) */
  renameCharacter: (
    oldKey: string,
    newName: string,
    everywhere: boolean,
    otherNames: string[],
    apply: boolean,
  ) => { characterLines: number; textHits: number };
};

type Props = {
  initialLines: ScriptLine[];
  onInfo: (info: EditorInfo) => void;
  onDirtyChange: (dirty: boolean) => void;
  /** 페이지를 다시 계산할 때마다 (입력이 멈췄을 때) 분석 결과를 알린다. */
  onAnalysis: (analysis: ScriptAnalysis) => void;
  /** 메모를 붙이거나 고치거나 지웠을 때 (글을 쓰다 밀린 위치는 알리지 않는다) */
  onNotesChange: (notes: ScriptNote[]) => void;
  /** 메모가 붙은 글을 눌렀을 때 */
  onNoteOpen: (id: string) => void;
  /** 씬헤딩이 사라져 어느 씬에도 속하지 않게 된 요약이 생겼을 때 (합칠지 묻는다) */
  onOrphanSynopsis: (info: { texts: string[]; target: string }) => void;
};

type Snapshot = { doc: Text; styles: readonly DocStyle[] };

/** 가장 가까운, 위아래로 스크롤되는 부모 */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if (overflow === "auto" || overflow === "scroll") return p;
  }
  return null;
}

/** 저장 시작 시점의 원고 상태 (바깥에서는 내용을 몰라도 된다) */
export type SaveToken = { readonly snapshot: Snapshot };

function readInfo(state: EditorState, withCounts: EditorInfo | null): EditorInfo {
  const style = currentStyle(state);
  const page = currentPage(state);
  const pages = totalPages(state);
  const line = state.doc.lineAt(state.selection.main.head).number;
  if (withCounts) return { ...withCounts, style, page, pages, line };
  const text = state.doc.toString();
  return {
    lines: state.doc.lines,
    chars: text.replace(/\n/g, "").length,
    characters: characterNames(state).length,
    scenes: state.field(sceneNumbersField).size,
    page,
    pages,
    line,
    style,
  };
}

function snapshot(state: EditorState): Snapshot {
  return { doc: state.doc, styles: state.field(lineStylesField) };
}

function sameAs(state: EditorState, saved: Snapshot): boolean {
  const styles = state.field(lineStylesField);
  if (styles !== saved.styles) {
    if (styles.length !== saved.styles.length) return false;
    for (let i = 0; i < styles.length; i++) if (styles[i] !== saved.styles[i]) return false;
  }
  return state.doc === saved.doc || state.doc.eq(saved.doc);
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor(
  { initialLines, onInfo, onDirtyChange, onAnalysis, onNotesChange, onNoteOpen, onOrphanSynopsis },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensionsRef = useRef<Extension | null>(null);
  const sceneStartRef = useRef(1);
  const savedRef = useRef<Snapshot | null>(null);
  const dirtyRef = useRef(false);
  const lastInfoRef = useRef<EditorInfo | null>(null);
  const onInfoRef = useRef(onInfo);
  const onDirtyRef = useRef(onDirtyChange);
  const onAnalysisRef = useRef(onAnalysis);
  onInfoRef.current = onInfo;
  onDirtyRef.current = onDirtyChange;
  onAnalysisRef.current = onAnalysis;
  const onNotesRef = useRef(onNotesChange);
  const onNoteOpenRef = useRef(onNoteOpen);
  onNotesRef.current = onNotesChange;
  onNoteOpenRef.current = onNoteOpen;
  const onOrphanRef = useRef(onOrphanSynopsis);
  onOrphanRef.current = onOrphanSynopsis;
  /** 합칠지 묻는 창이 떠 있는 동안에는 다시 묻지 않는다 */
  const orphanAskingRef = useRef(false);

  function dispatchNotes(notes: ScriptNote[]) {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setNotesEffect.of(notes) });
    onNotesRef.current(notesOf(view.state));
  }

  function publishAnalysis(state: EditorState) {
    const { pagination } = state.field(paginationField);
    onAnalysisRef.current(analyzeScript(scriptLines(state), pagination, state.field(sceneStartField)));
  }

  function setDirty(dirty: boolean) {
    if (dirtyRef.current === dirty) return;
    dirtyRef.current = dirty;
    onDirtyRef.current(dirty);
  }

  function publishInfo(state: EditorState, recount: boolean) {
    lastInfoRef.current = readInfo(state, recount ? null : lastInfoRef.current);
    onInfoRef.current(lastInfoRef.current);
  }

  function resolveOrphans(mode: "merge" | "keep" | "undo") {
    const view = viewRef.current;
    orphanAskingRef.current = false;
    if (!view) return;
    if (mode === "undo") {
      undo(view);
      view.focus();
      return;
    }
    const lines = scriptLines(view.state);
    const spec = replaceLinesSpec(view.state, mode === "merge" ? mergeOrphans(lines) : keepOrphans(lines));
    if (spec) view.dispatch(spec);
    view.focus();
  }

  /**
   * 씬헤딩이 지워져 주인 없는 요약이 생겼는지 본다. (되돌리기·다시 실행으로 생긴 것은 묻지 않는다)
   * 합칠 앞 씬이 없으면 묻지 않고 일반 글(액션)로 남기고, 있으면 합칠지 묻는다.
   */
  function checkOrphans(update: ViewUpdate) {
    if (orphanAskingRef.current) return;
    if (update.transactions.some((tr) => tr.isUserEvent("undo") || tr.isUserEvent("redo"))) return;
    const info = orphanInfo(update.state);
    if (!info) return;
    if (info.target === null) {
      const styles = update.state.field(lineStylesField).map((style) => ({ style }));
      const anyTarget = orphanChains(styles).some((c) => previousScene(styles, c.from) !== null);
      if (!anyTarget) {
        // 갱신 중에는 다시 고칠 수 없어서 한 박자 뒤에 처리한다.
        orphanAskingRef.current = true;
        setTimeout(() => resolveOrphans("keep"), 0);
        return;
      }
    }
    orphanAskingRef.current = true;
    onOrphanRef.current({ texts: info.texts, target: info.target ?? "" });
  }

  useImperativeHandle(ref, () => ({
    setStyle(style) {
      const view = viewRef.current;
      if (!view) return;
      setStyle(style)(view);
      view.focus();
    },
    setFountainMode(on) {
      viewRef.current?.dispatch({ effects: setFountainModeEffect.of(on) });
    },
    nextStyle() {
      const view = viewRef.current;
      if (!view) return;
      cycleLineStyle(1, true)(view);
      view.focus();
    },
    insertOutline(kind, line) {
      const view = viewRef.current;
      if (!view) return;
      const { state } = view;
      let at: number;
      if (kind === "synopsis") {
        // 씬헤딩 아래, 이미 있는 요약 줄들 뒤
        let last = line ?? state.doc.lines;
        while (last < state.doc.lines && styleAtLine(state, last + 1) === "synopsis") last++;
        at = state.doc.line(last).to;
      } else {
        at = line === null ? state.doc.length : state.doc.line(line).from;
      }
      // 새 줄을 끼워 넣는 것이라, 밀려난 원래 줄의 스타일은 그대로 되돌려 놓는다.
      const insertBefore = kind !== "synopsis" && line !== null;
      const newStart = insertBefore ? at : at + 1;
      const effects = [setLineStyleEffect.of({ pos: newStart, style: kind })];
      if (insertBefore) {
        effects.push(setLineStyleEffect.of({ pos: newStart + 1, style: styleAtLine(state, line) }));
      }
      view.dispatch({
        changes: { from: at, insert: "\n" },
        selection: EditorSelection.cursor(newStart),
        effects: [...effects, EditorView.scrollIntoView(newStart, { y: "center" })],
        userEvent: "input.style",
      });
      view.focus();
    },
    resolveOrphans,
    load(lines, position) {
      const view = viewRef.current;
      if (!view || !extensionsRef.current) return;
      const state = createScriptState(lines, extensionsRef.current, sceneStartRef.current);
      view.setState(state);
      savedRef.current = snapshot(state);
      setDirty(false);
      publishInfo(state, true);
      publishAnalysis(state);
      view.focus();
      if (position) {
        const { caret, top } = clampPosition(position, state.doc.length);
        view.dispatch({ selection: { anchor: caret } });
        // 쪽 나눔 계산이 끝나 높이가 자리 잡은 뒤에 화면을 옮긴다
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (viewRef.current !== view) return;
            view.dispatch({ effects: EditorView.scrollIntoView(top, { y: "start", yMargin: 0 }) });
          }),
        );
      }
    },
    getViewPosition() {
      const view = viewRef.current;
      if (!view) return null;
      const caret = view.state.selection.main.head;
      let top = view.state.doc.lineAt(caret).from;
      // 원고가 들어 있는 스크롤 영역의 맨 위에 보이는 줄을 찾는다
      const scroller = scrollParentOf(view.dom);
      if (scroller) {
        const area = scroller.getBoundingClientRect();
        const content = view.contentDOM.getBoundingClientRect();
        const pos = view.posAtCoords({ x: content.left + 8, y: Math.max(area.top, content.top) + 4 }, false);
        top = view.state.doc.lineAt(pos).from;
      }
      return { caret, top };
    },
    getLines() {
      const view = viewRef.current;
      return view ? scriptLines(view.state) : [];
    },
    markSaved() {
      const view = viewRef.current;
      if (!view) return;
      savedRef.current = snapshot(view.state);
      setDirty(false);
    },
    captureSaveState() {
      const view = viewRef.current;
      return view ? { snapshot: snapshot(view.state) } : null;
    },
    markSavedAt(token) {
      const view = viewRef.current;
      if (!view) return;
      savedRef.current = token.snapshot;
      setDirty(!sameAs(view.state, token.snapshot));
    },
    undo() {
      if (viewRef.current) undo(viewRef.current);
    },
    redo() {
      if (viewRef.current) redo(viewRef.current);
    },
    find() {
      if (viewRef.current) openSearchPanel(viewRef.current);
    },
    focus() {
      viewRef.current?.focus();
    },
    selection() {
      const view = viewRef.current;
      if (!view) return null;
      const { from, to } = view.state.selection.main;
      return from < to ? { from, to, text: view.state.sliceDoc(from, to) } : null;
    },
    rectOf(from, to) {
      const view = viewRef.current;
      if (!view) return null;
      const a = view.coordsAtPos(from);
      const b = view.coordsAtPos(to, -1) ?? a;
      if (!a || !b) return null;
      return { top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom), left: Math.min(a.left, b.left), right: Math.max(a.right, b.right) };
    },
    getNotes() {
      const view = viewRef.current;
      return view ? notesOf(view.state) : [];
    },
    selectNote(id) {
      const view = viewRef.current;
      if (!view) return false;
      const note = notesOf(view.state).find((n) => n.id === id);
      if (!note) return false;
      view.dispatch({
        selection: { anchor: note.from, head: note.to },
        effects: EditorView.scrollIntoView(note.from, { y: "center" }),
      });
      view.focus();
      return true;
    },
    setSceneStart(start) {
      const next = Number.isInteger(start) && start >= 1 ? start : 1;
      sceneStartRef.current = next;
      const view = viewRef.current;
      if (!view || view.state.field(sceneStartField) === next) return;
      view.dispatch({ effects: setSceneStartEffect.of(next) });
      publishAnalysis(view.state);
    },
    setNotes(notes) {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({ effects: setNotesEffect.of(restoreNotes(view.state.doc.toString(), notes)) });
    },
    saveNote(note) {
      const view = viewRef.current;
      if (!view) return;
      const current = notesOf(view.state);
      const exists = current.some((n) => n.id === note.id);
      dispatchNotes(exists ? current.map((n) => (n.id === note.id ? { ...n, text: note.text } : n)) : [...current, note]);
    },
    removeNote(id) {
      const view = viewRef.current;
      if (view) dispatchNotes(notesOf(view.state).filter((n) => n.id !== id));
    },
    renameCharacter(oldKey, newName, everywhere, otherNames, apply) {
      const view = viewRef.current;
      if (!view) return { characterLines: 0, textHits: 0 };
      const result = renameCharacter(view.state, oldKey, newName, everywhere, otherNames);
      if (apply && result.changes.length > 0) {
        view.dispatch({ changes: result.changes, userEvent: "rename" });
      }
      return { characterLines: result.characterLines, textHits: result.textHits };
    },
    moveScene(fromLine, beforeLine) {
      const view = viewRef.current;
      if (!view) return false;
      const move = sceneMoveSpec(view.state, fromLine, beforeLine);
      if (!move) return false;
      const notes = notesOf(view.state);
      view.dispatch(move.spec);
      // 옮겨진 글 안의 메모는 글을 보고 다시 붙인다.
      view.dispatch({ effects: setNotesEffect.of(restoreNotes(view.state.doc.toString(), notes)) });
      const heading = view.state.doc.line(move.headingLine);
      view.dispatch({
        selection: { anchor: heading.from },
        effects: EditorView.scrollIntoView(heading.from, { y: "center" }),
      });
      return true;
    },
    goToLine(lineNumber) {
      const view = viewRef.current;
      if (!view) return;
      const n = Math.max(1, Math.min(lineNumber, view.state.doc.lines));
      const line = view.state.doc.line(n);
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: "start", yMargin: 120 }),
      });
      view.focus();
    },
  }));

  useEffect(() => {
    if (!hostRef.current) return;

    const extensions: Extension = [
      history(),
      koreanSearchPhrases,
      searchPanelDrag(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: "false", lang: "ko" }),
      scriptEditing(),
      scriptNotes((id) => onNoteOpenRef.current(id)),
      pageBreaks(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      paperTheme,
      EditorView.updateListener.of((update) => {
        const changed =
          update.docChanged ||
          update.startState.field(lineStylesField) !== update.state.field(lineStylesField);
        const repaginated =
          update.startState.field(paginationField) !== update.state.field(paginationField);
        if (changed && savedRef.current) setDirty(!sameAs(update.state, savedRef.current));
        if (changed) checkOrphans(update);
        if (repaginated) publishAnalysis(update.state);
        if (!changed && !update.selectionSet && !repaginated) return;
        // 글이나 스타일이 바뀌었을 때만 전체 개수를 다시 센다.
        publishInfo(update.state, changed);
      }),
    ];
    extensionsRef.current = extensions;

    const state = createScriptState(initialLines, extensions);
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    // 개발용: 브라우저 콘솔에서 에디터를 살펴볼 수 있게 한다.
    if (import.meta.env.DEV) (window as unknown as { __dropkick: EditorView }).__dropkick = view;
    savedRef.current = snapshot(state);
    publishInfo(state, true);
    publishAnalysis(state);
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 에디터는 처음 한 번만 만든다. 이후 내용은 load()로 바꾼다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="editor-host" data-script-editor ref={hostRef} />;
});
