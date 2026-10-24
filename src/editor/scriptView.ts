import { Prec, type Extension, type Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
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
  sceneNumbersField,
  setStyle,
  styleAtLine,
} from "./lineStyles";
import { LINE_STYLES, STYLE_LABELS, type LineStyle } from "./styles";

// 줄 장식은 (스타일, 앞 줄과 이어지는지, 현재 줄인지) 조합마다 한 번만 만든다.
const lineDecorationCache = new Map<string, Decoration>();

function lineDecoration(style: LineStyle, continued: boolean, current: boolean): Decoration {
  const key = `${style}|${continued}|${current}`;
  let deco = lineDecorationCache.get(key);
  if (!deco) {
    let cls = `sl sl-${style}`;
    if (continued) cls += " sl-continued";
    if (current) cls += " sl-current";
    deco = Decoration.line({
      class: cls,
      attributes: current ? { "data-style": STYLE_LABELS[style] } : undefined,
    });
    lineDecorationCache.set(key, deco);
  }
  return deco;
}

// 앞 줄과 같은 스타일이 이어질 때 문단 사이 빈 줄 없이 붙여 쓰는 스타일
const CONTINUOUS_STYLES = new Set<LineStyle>(["action"]);

// 씬헤딩 앞에 붙는 자동 씬 번호 (글자가 아니라 화면 표시)
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
    span.textContent = `S#${this.number}. `;
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
      const currentLine = state.doc.lineAt(state.selection.main.head).number;
      const ranges: Range<Decoration>[] = [];
      let lastLine = 0;
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = state.doc.lineAt(pos);
          if (line.number > lastLine) {
            const style = styles[line.number - 1];
            const continued =
              CONTINUOUS_STYLES.has(style) && styles[line.number - 2] === style;
            const current = line.number === currentLine && view.hasFocus;
            ranges.push(lineDecoration(style, continued, current).range(line.from));

            const scene = scenes.get(line.number);
            if (scene && !scene.manual) {
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
