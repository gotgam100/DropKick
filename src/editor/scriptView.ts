import { Prec, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import {
  characterNames,
  cycleLineStyle,
  insertScriptNewline,
  lineStylesField,
  setStyle,
  styleAtLine,
} from "./lineStyles";
import { LINE_STYLES, STYLE_LABELS, type LineStyle } from "./styles";

// 스타일마다 줄 장식을 하나씩 미리 만들어 둔다.
const lineDecorations = Object.fromEntries(
  LINE_STYLES.map((style) => [
    style,
    Decoration.line({ class: `sl sl-${style}` }),
  ]),
) as Record<LineStyle, Decoration>;

const currentLineDecorations = Object.fromEntries(
  LINE_STYLES.map((style) => [
    style,
    Decoration.line({
      class: `sl sl-${style} sl-current`,
      attributes: { "data-style": STYLE_LABELS[style] },
    }),
  ]),
) as Record<LineStyle, Decoration>;

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
        update.startState.field(lineStylesField) !== update.state.field(lineStylesField)
      ) {
        this.decorations = this.build(update.view);
      }
    }

    build(view: EditorView): DecorationSet {
      const { state } = view;
      const styles = state.field(lineStylesField);
      const currentLine = state.doc.lineAt(state.selection.main.head).number;
      const ranges = [];
      let lastLine = 0;
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = state.doc.lineAt(pos);
          if (line.number > lastLine) {
            const style = styles[line.number - 1];
            const deco =
              line.number === currentLine && view.hasFocus
                ? currentLineDecorations[style]
                : lineDecorations[style];
            ranges.push(deco.range(line.from));
            lastLine = line.number;
          }
          pos = line.to + 1;
        }
      }
      return Decoration.set(ranges);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

const styleKeymap = keymap.of([
  { key: "Enter", run: insertScriptNewline },
  { key: "Tab", run: cycleLineStyle(1), shift: cycleLineStyle(-1) },
  ...LINE_STYLES.map((style, i) => ({
    key: `Mod-${i + 1}`,
    run: setStyle(style),
    preventDefault: true,
  })),
]);

// 인물 스타일 줄에서 앞서 나온 이름을 자동 완성한다.
function characterCompletions(context: CompletionContext) {
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
    options: names.map((name) => ({ label: name, type: "character" })),
    validFor: /^[^\n]*$/,
  };
}

// lineStylesField는 createScriptState()가 넣어 준다.
export function scriptEditing(): Extension {
  return [
    styleDecorations,
    // 자동 완성 창이 열려 있을 때는 Enter가 이름 선택에 쓰이도록, 스타일 키는 그보다 낮게 둔다.
    Prec.high(styleKeymap),
    autocompletion({
      override: [characterCompletions],
      icons: false,
      defaultKeymap: true,
    }),
  ];
}
