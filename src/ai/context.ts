/** 'AI에게 묻기'에 함께 보낼 글을 고르고, 질문을 만든다. */
import type { ScriptLine } from "../editor/lineStyles";

export type ContextKind = "selection" | "scene" | "whole";

export const CONTEXT_LABELS: Record<ContextKind, string> = {
  selection: "고른 글만",
  scene: "고른 글이 있는 씬",
  whole: "원고 전체",
};

/** 원고 전체 글에서의 위치(offset)가 몇 번째 줄인지 (0부터). 줄 사이는 줄바꿈 1글자. */
export function lineIndexAt(lines: readonly ScriptLine[], offset: number): number {
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const end = start + lines[i].text.length;
    if (offset <= end) return i;
    start = end + 1;
  }
  return Math.max(0, lines.length - 1);
}

/** 그 줄이 속한 씬의 줄 범위 [시작, 끝). 씬헤딩이 하나도 앞에 없으면 맨 처음부터. */
export function sceneRange(lines: readonly ScriptLine[], index: number): [number, number] {
  let start = 0;
  for (let i = Math.min(index, lines.length - 1); i >= 0; i--) {
    if (lines[i].style === "scene") {
      start = i;
      break;
    }
  }
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].style === "scene") {
      end = i;
      break;
    }
  }
  return [start, end];
}

const STYLE_TAG: Record<string, string> = {
  scene: "씬헤딩",
  action: "지문",
  character: "인물",
  parenthetical: "괄호지문",
  dialogue: "대사",
  subheader: "서브헤더",
  transition: "전환",
};

/** AI가 구조를 알아보도록 줄마다 종류를 붙인 글 */
export function formatLines(lines: readonly ScriptLine[]): string {
  return lines
    .filter((l) => l.text.trim() !== "")
    .map((l) => `[${STYLE_TAG[l.style] ?? l.style}] ${l.text}`)
    .join("\n");
}

/** 보낼 글의 크기 짐작. 한글은 글자 수와 비슷한 수의 토큰이 든다고 보고 넉넉히 센다. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 1.1);
}

export type AskInput = {
  kind: ContextKind;
  quote: string;
  lines: readonly ScriptLine[];
  /** 고른 글이 시작하는 줄 */
  lineIndex: number;
  question: string;
};

export type AskRequest = {
  system: { text: string; cache?: boolean }[];
  messages: { role: "user"; content: string }[];
  /** 원고에서 보내는 글(질문 제외)의 크기 짐작 */
  contextTokens: number;
};

const INSTRUCTIONS =
  "당신은 한국어 시나리오 작가를 돕는 시나리오 에디터입니다. " +
  "작가의 원고 일부와 질문이 주어집니다. 쉽고 구체적인 한국어로 짧게 답하세요. " +
  "원고를 직접 고쳐 쓰라는 요청이 아니면 고친 글 전체를 다시 쓰지 말고, 이유와 제안을 먼저 말하세요. " +
  "대안을 줄 때는 할리우드 형식의 시나리오 문장(지문, 인물, 대사)을 지키세요.";

export function buildAskRequest({ kind, quote, lines, lineIndex, question }: AskInput): AskRequest {
  let context = "";
  if (kind === "scene") {
    const [from, to] = sceneRange(lines, lineIndex);
    context = formatLines(lines.slice(from, to));
  } else if (kind === "whole") {
    context = formatLines(lines);
  }
  const system: AskRequest["system"] = [{ text: INSTRUCTIONS }];
  // 원고 전체는 크고 같은 원고로 여러 번 묻기 쉬워서, 캐시해 두 번째부터 비용을 줄인다.
  if (context) system.push({ text: `다음은 작가의 원고입니다. 각 줄 앞의 [ ]는 줄 종류입니다.\n\n${context}`, cache: kind === "whole" });
  const content = `고른 글:\n"""\n${quote}\n"""\n\n질문: ${question.trim()}`;
  return {
    system,
    messages: [{ role: "user", content }],
    contextTokens: estimateTokens(quote + context),
  };
}
