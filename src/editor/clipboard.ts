/**
 * 스크립트 에디터 복사·잘라내기·붙여넣기 시 줄 스타일(씬헤딩, 액션, 인물, 괄호지문, 대사, 전환) 유지.
 *
 * - DropKick 안에서 복사한 내용은 각 줄의 스타일을 클립보드에 함께 담는다.
 * - 붙여넣을 때 각 줄의 원래 스타일을 복원하여 적용한다.
 * - ⌘Z(실행 취소) 시 붙여넣은 스타일과 글이 함께 깔끔하게 취소된다.
 * - 외부에서 복사한 일반 텍스트는 기존처럼 기본 동작 또는 Fountain 마커 감지를 따른다.
 */
import { EditorState, StateEffect, type Extension, type Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { setLineStyleEffect, lineStylesField } from "./lineStyles";
import { nextStyleOnEnter, type DocStyle } from "./styles";
import { fromFountain } from "../fountain/fountain";

export const DROPKICK_CLIPBOARD_MIME = "application/x-dropkick-script";

export type ScriptClipboardPayload = {
  version: 1;
  text: string;
  styles: DocStyle[];
  isFullLine: boolean;
};

// 같은 창 안에서 브라우저 클립보드 제약 없이 100% 즉시 동작하도록 보장하는 메모리 캐시
let inMemoryClipboard: ScriptClipboardPayload | null = null;

export function getInMemoryClipboard(): ScriptClipboardPayload | null {
  return inMemoryClipboard;
}

/** 선택된 구간의 텍스트와 줄별 스타일을 추출한다. */
export function extractSelectedLines(
  doc: Text,
  lineStyles: readonly DocStyle[],
  from: number,
  to: number,
): ScriptClipboardPayload | null {
  if (from === to) return null;

  const startLine = doc.lineAt(from);
  let endLine = doc.lineAt(to);

  // 줄바꿈 바로 뒤(다음 줄 시작점 pos)에서 선택이 끝난 경우, 빈 줄이 추가로 잡히지 않도록 앞 줄로 맞춘다.
  if (to === endLine.from && endLine.number > startLine.number) {
    endLine = doc.line(endLine.number - 1);
  }

  const text = doc.sliceString(from, to);
  const styles: DocStyle[] = [];

  for (let n = startLine.number; n <= endLine.number; n++) {
    styles.push(lineStyles[n - 1] ?? "action");
  }

  const isFullLine =
    from === startLine.from && (to === endLine.to || to === endLine.to + 1);

  return {
    version: 1,
    text,
    styles,
    isFullLine,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function copyToClipboardData(
  event: ClipboardEvent,
  payload: ScriptClipboardPayload,
): boolean {
  inMemoryClipboard = payload;

  if (event.clipboardData) {
    event.clipboardData.clearData();
    event.clipboardData.setData("text/plain", payload.text);

    try {
      event.clipboardData.setData(
        DROPKICK_CLIPBOARD_MIME,
        JSON.stringify(payload),
      );
    } catch {
      // 일부 브라우저에서 커스텀 MIME 타입 제한 시 무시
    }

    try {
      const jsonStr = encodeURIComponent(JSON.stringify(payload));
      const html = `<div data-dropkick-script="${jsonStr}"><pre>${escapeHtml(payload.text)}</pre></div>`;
      event.clipboardData.setData("text/html", html);
    } catch {
      // 무시
    }

    event.preventDefault();
    return true;
  }
  return false;
}

/**
 * 프로그래밍 방식(예: 가이드의 복사 버튼)으로 스크립트 Payload를 클립보드에 기록한다.
 */
export async function copyScriptPayloadToClipboard(
  payload: ScriptClipboardPayload,
): Promise<boolean> {
  // 1. 메모리 캐시에 최우선 보관 (DropKick 내 붙여넣기 100% 보장)
  inMemoryClipboard = payload;

  let writeSuccess = false;

  // 2. 시스템 클립보드에 HTML(데이터 속성 포함) 및 text/plain 기록
  try {
    const jsonStr = encodeURIComponent(JSON.stringify(payload));
    const html = `<div data-dropkick-script="${jsonStr}"><pre>${escapeHtml(payload.text)}</pre></div>`;

    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === "function" &&
      typeof ClipboardItem !== "undefined" &&
      typeof Blob !== "undefined"
    ) {
      const blobText = new Blob([payload.text], { type: "text/plain" });
      const blobHtml = new Blob([html], { type: "text/html" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": blobText,
          "text/html": blobHtml,
        }),
      ]);
      writeSuccess = true;
    }
  } catch {
    // ClipboardItem 생성이나 write 실패 시
  }

  // 3. writeText 폴백
  if (!writeSuccess) {
    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === "function"
      ) {
        await navigator.clipboard.writeText(payload.text);
        writeSuccess = true;
      }
    } catch {}
  }

  return true;
}

/**
 * 텍스트가 Fountain 포맷의 특징(씬헤딩, 인물, 서브헤더, 전환, 표지 등)을 포함하는지 감지한다.
 */
export function isFountainText(text: string): boolean {
  if (!text || !text.trim()) return false;

  // 1. 표지 메타데이터 (Title:, Author:, Credit: 등)
  if (/^\s*Title\s*:\s*[^\n]+/im.test(text)) return true;

  // 2. 강제 인물 표기 (@민재, @수아)
  if (/^\s*@[^\s\n]/m.test(text)) return true;

  // 3. 서브헤더 표기 (..복도)
  if (/^\s*\.\.[^\s\n]/m.test(text)) return true;

  // 4. 전환 표기 (> CUT TO:, > FADE OUT.)
  if (/^\s*>[^<\n]+$/m.test(text)) return true;

  // 5. 씬헤딩 점 시작 (.실내, .실외, .내부, .외부, .INT, .EXT 등)
  if (/^\s*\.(?:실내|실외|내부|외부|INT|EXT|EST|I\/E)[.\s]/im.test(text)) return true;

  // 6. 씬 번호 마커 (#1#, #2A#)
  if (/#[\w.\-]+#\s*$/m.test(text)) return true;

  // 7. 표준 영문 씬헤딩 시작 (INT. EXT.)
  if (/^\s*(?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/im.test(text)) return true;

  // 8. 한국어 씬헤딩 (S#1, #1)
  if (/^\s*(?:S\s*#|#)\s*\d+/im.test(text)) return true;

  return false;
}

/**
 * 일반 클립보드 텍스트가 Fountain 형식인 경우 구문 분석하여 라인별 스타일이 담긴 Payload로 변환한다.
 */
export function parseFountainClipboard(plainText: string): ScriptClipboardPayload | null {
  if (!isFountainText(plainText)) return null;

  try {
    const doc = fromFountain(plainText);
    if (!doc.lines || doc.lines.length === 0) return null;

    // 액션 이외의 스타일(씬, 인물, 대사, 괄호지문, 서브헤더, 전환)이 최소 1개 이상 있거나 표지가 있어야 함
    const hasScriptStyle = doc.lines.some((l) => l.style !== "action");
    if (!hasScriptStyle && !doc.titlePage) return null;

    const text = doc.lines.map((l) => l.text).join("\n");
    const styles = doc.lines.map((l) => l.style);

    return {
      version: 1,
      text,
      styles,
      isFullLine: true,
    };
  } catch {
    return null;
  }
}

export function readFromClipboardData(
  event: ClipboardEvent,
): ScriptClipboardPayload | null {
  const clip = event.clipboardData;
  if (!clip) return inMemoryClipboard;

  const plainText = clip.getData("text/plain");

  // 1. 커스텀 MIME 타입 확인
  try {
    const raw = clip.getData(DROPKICK_CLIPBOARD_MIME);
    if (raw) {
      const parsed = JSON.parse(raw) as ScriptClipboardPayload;
      if (parsed && parsed.version === 1 && Array.isArray(parsed.styles)) {
        return parsed;
      }
    }
  } catch {}

  // 2. 앱 내 메모리 캐시 확인 (텍스트 내용이 일치할 때, 줄바꿈 정규화)
  if (inMemoryClipboard) {
    const normMem = inMemoryClipboard.text.replace(/\r\n/g, "\n");
    const normPlain = plainText ? plainText.replace(/\r\n/g, "\n") : "";
    if (normMem === normPlain) {
      return inMemoryClipboard;
    }
  }

  // 3. HTML 데이터 속성 확인
  try {
    const html = clip.getData("text/html");
    if (html) {
      const match = html.match(/data-dropkick-script="([^"]+)"/);
      if (match && match[1]) {
        const decoded = decodeURIComponent(match[1]);
        const parsed = JSON.parse(decoded) as ScriptClipboardPayload;
        if (parsed && parsed.version === 1 && Array.isArray(parsed.styles)) {
          return parsed;
        }
      }
    }
  } catch {}

  // 4. 외부/일반 클립보드의 Fountain 텍스트 감지 및 자동 변환
  if (plainText) {
    const fountainPayload = parseFountainClipboard(plainText);
    if (fountainPayload) {
      return fountainPayload;
    }
  }

  return null;
}

/**
 * 붙여넣을 때 각 줄에 적용할 스타일 효과 목록(setLineStyleEffect)을 계산한다.
 */
export function computePasteEffects(
  doc: Text,
  selFrom: number,
  selTo: number,
  payload: ScriptClipboardPayload,
  /** 붙여넣는 줄 바로 위 줄의 요소, 붙여넣는 첫 줄의 지금 요소 (씬 요약이 씬헤딩 아래에만 들어가게 쓴다) */
  context: { above?: DocStyle; target?: DocStyle } = {},
): StateEffect<unknown>[] {
  const targetLine = doc.lineAt(selFrom);
  const isLineEmpty = targetLine.text.trim() === "";
  const isAtLineStart = selFrom === targetLine.from;
  const isWholeLineSelected = selFrom === targetLine.from && selTo === targetLine.to;

  const newLines = payload.text.split("\n");
  const effects: StateEffect<unknown>[] = [];

  const styleCount = payload.styles.length;
  let curPos = selFrom;
  // 바로 위 줄의 요소. 씬 요약은 씬헤딩이나 다른 씬 요약 바로 아래에서만 요약으로 남고, 아니면 액션이 된다.
  let above: DocStyle | undefined = context.above;
  const fit = (style: DocStyle): DocStyle =>
    style === "synopsis" && above !== "scene" && above !== "synopsis" ? "action" : style;

  for (let i = 0; i < newLines.length; i++) {
    const lineStartPos = curPos;

    if (i < styleCount) {
      if (i === 0) {
        // 첫 번째 줄: 줄의 시작점이거나, 줄이 비어있거나, 줄 전체를 덮어쓰거나, 전체 줄 복사본일 때 스타일 적용
        if (isAtLineStart || isLineEmpty || isWholeLineSelected || payload.isFullLine) {
          const style = fit(payload.styles[i]);
          effects.push(setLineStyleEffect.of({ pos: lineStartPos, style }));
          above = style;
        } else {
          above = context.target;
        }
      } else {
        // 두 번째 줄부터는 새로 생성된 줄이므로 항상 원래 복사된 스타일 적용
        const style = fit(payload.styles[i]);
        effects.push(setLineStyleEffect.of({ pos: lineStartPos, style }));
        above = style;
      }
    } else if (i === styleCount && newLines[i] === "") {
      // 텍스트 끝에 \n이 있어서 빈 줄이 추가된 경우 (예: "민재\n")
      // 마지막 줄 스타일의 다음 기본 스타일(예: 인물 다음 대사) 적용
      const lastStyle = payload.styles[styleCount - 1] ?? "action";
      const nextStyle = nextStyleOnEnter(lastStyle) ?? "action";
      effects.push(setLineStyleEffect.of({ pos: lineStartPos, style: nextStyle }));
    }

    if (i < newLines.length - 1) {
      curPos += newLines[i].length + 1; // +1 for '\n'
    }
  }

  return effects;
}

export function createPasteTransaction(
  state: EditorState,
  payload: ScriptClipboardPayload,
  selFrom = state.selection.main.from,
  selTo = state.selection.main.to,
) {
  const styles = state.field(lineStylesField, false);
  const lineNo = state.doc.lineAt(selFrom).number;
  const effects = computePasteEffects(state.doc, selFrom, selTo, payload, {
    above: styles?.[lineNo - 2],
    target: styles?.[lineNo - 1],
  });
  return state.update({
    changes: { from: selFrom, to: selTo, insert: payload.text },
    effects,
    selection: { anchor: selFrom + payload.text.length },
    userEvent: "input.paste",
    scrollIntoView: true,
  });
}

export function handleCopy(event: ClipboardEvent, view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (sel.empty) return false;

  const payload = extractSelectedLines(
    view.state.doc,
    view.state.field(lineStylesField),
    sel.from,
    sel.to,
  );
  if (!payload) return false;

  return copyToClipboardData(event, payload);
}

export function handleCut(event: ClipboardEvent, view: EditorView): boolean {
  const sel = view.state.selection.main;
  if (sel.empty) return false;

  const handled = handleCopy(event, view);
  if (!handled) return false;

  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: "" },
    selection: { anchor: sel.from },
    userEvent: "delete.cut",
    scrollIntoView: true,
  });
  return true;
}

export function handlePaste(event: ClipboardEvent, view: EditorView): boolean {
  const payload = readFromClipboardData(event);
  if (!payload || !payload.text) {
    return false; // 일반 텍스트 붙여넣기는 CodeMirror 기본 처리로 넘김
  }

  const tr = createPasteTransaction(view.state, payload);
  view.dispatch(tr);

  event.preventDefault();
  return true;
}

/** 스크립트 에디터용 복사·잘라내기·붙여넣기 DOM 이벤트 핸들러 Extension */
export function scriptClipboard(): Extension {
  return EditorView.domEventHandlers({
    copy: (event, view) => handleCopy(event, view),
    cut: (event, view) => handleCut(event, view),
    paste: (event, view) => handlePaste(event, view),
  });
}
