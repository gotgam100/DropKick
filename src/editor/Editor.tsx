import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { EditorState, Extension, Text } from "@codemirror/state";
import { EditorView, keymap, drawSelection, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, redo, undo } from "@codemirror/commands";
import { highlightSelectionMatches, openSearchPanel, searchKeymap } from "@codemirror/search";
import { paperTheme } from "./theme";
import {
  characterNames,
  createScriptState,
  currentStyle,
  lineStylesField,
  sceneNumbersField,
  scriptLines,
  setStyle,
  type ScriptLine,
} from "./lineStyles";
import { scriptEditing } from "./scriptView";
import { currentPage, pageBreaks, paginationField, totalPages } from "./pageBreaks";
import { analyzeScript, type ScriptAnalysis } from "../analysis/analyze";
import type { LineStyle } from "./styles";

export type EditorInfo = {
  lines: number;
  chars: number;
  charsNoSpace: number;
  characters: number;
  scenes: number;
  page: number;
  pages: number;
  /** 커서가 있는 줄 번호 */
  line: number;
  style: LineStyle;
};

export type EditorHandle = {
  setStyle: (style: LineStyle) => void;
  /** 새 원고로 바꾼다. 되돌리기 기록도 새로 시작한다. */
  load: (lines: ScriptLine[]) => void;
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
  focus: () => void;
  /** 그 줄로 커서를 옮기고 화면 위쪽에 보이게 한다. */
  goToLine: (line: number) => void;
};

type Props = {
  initialLines: ScriptLine[];
  onInfo: (info: EditorInfo) => void;
  onDirtyChange: (dirty: boolean) => void;
  /** 페이지를 다시 계산할 때마다 (입력이 멈췄을 때) 분석 결과를 알린다. */
  onAnalysis: (analysis: ScriptAnalysis) => void;
};

type Snapshot = { doc: Text; styles: readonly LineStyle[] };

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
    charsNoSpace: text.replace(/\s/g, "").length,
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
  { initialLines, onInfo, onDirtyChange, onAnalysis },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const extensionsRef = useRef<Extension | null>(null);
  const savedRef = useRef<Snapshot | null>(null);
  const dirtyRef = useRef(false);
  const lastInfoRef = useRef<EditorInfo | null>(null);
  const onInfoRef = useRef(onInfo);
  const onDirtyRef = useRef(onDirtyChange);
  const onAnalysisRef = useRef(onAnalysis);
  onInfoRef.current = onInfo;
  onDirtyRef.current = onDirtyChange;
  onAnalysisRef.current = onAnalysis;

  function publishAnalysis(state: EditorState) {
    const { pagination } = state.field(paginationField);
    onAnalysisRef.current(analyzeScript(scriptLines(state), pagination));
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

  useImperativeHandle(ref, () => ({
    setStyle(style) {
      const view = viewRef.current;
      if (!view) return;
      setStyle(style)(view);
      view.focus();
    },
    load(lines) {
      const view = viewRef.current;
      if (!view || !extensionsRef.current) return;
      const state = createScriptState(lines, extensionsRef.current);
      view.setState(state);
      savedRef.current = snapshot(state);
      setDirty(false);
      publishInfo(state, true);
      publishAnalysis(state);
      view.focus();
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
      drawSelection(),
      highlightSelectionMatches(),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: "false", lang: "ko" }),
      placeholder("여기에 시나리오를 쓰세요…"),
      scriptEditing(),
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

  return <div className="editor-host" ref={hostRef} />;
});
