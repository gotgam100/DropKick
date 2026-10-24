/**
 * DropKick 원고 ↔ Fountain 텍스트 변환
 *
 * 저장할 때는 다른 Fountain 프로그램도 같은 스타일로 읽을 수 있도록
 * 표시 기호를 붙인다. (앱 화면에는 보이지 않는다)
 *
 *   씬헤딩    .내부. 체육관 - 밤 #3#
 *   액션      그대로 (헷갈릴 만한 줄만 앞에 !)
 *   인물      @민재
 *   괄호지문  (숨을 고르며)
 *   대사      그대로
 *   전환      > CUT TO:
 *
 * 문단 사이는 빈 줄로 나눈다. 인물-괄호지문-대사, 이어지는 액션 줄은 붙여 쓴다.
 */
import type { ScriptLine } from "../editor/lineStyles";
import type { LineStyle } from "../editor/styles";

export type ScriptDocument = {
  /** Fountain 표지 정보 (Title:, Author: 등). 그대로 보관했다가 다시 쓴다. */
  titlePage: string | null;
  lines: ScriptLine[];
};

const SCENE_NUMBER_SUFFIX = /\s*#[\w.\-]+#\s*$/;
const STANDARD_SCENE_PREFIX = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const KOREAN_SCENE_PREFIX = /^S\s*#\s*\d+/i;
const TITLE_KEY = /^[A-Za-z][A-Za-z ]*:/;
const INTENTIONAL_BLANK = "  ";

// ---------- 저장 (원고 → Fountain) ----------

function isDialogueBlockStyle(style: LineStyle) {
  return style === "parenthetical" || style === "dialogue";
}

function hasLetters(text: string) {
  return /[A-Za-z]/.test(text);
}

function isAllCapsLatin(text: string) {
  return hasLetters(text) && text === text.toUpperCase();
}

/** 액션 줄이 다른 요소로 잘못 읽힐 수 있으면 앞에 !를 붙인다. */
function actionNeedsForce(text: string) {
  return (
    STANDARD_SCENE_PREFIX.test(text) ||
    KOREAN_SCENE_PREFIX.test(text) ||
    /^[.!@>~=#]/.test(text) ||
    text.startsWith("[[") ||
    text.startsWith("/*") ||
    isAllCapsLatin(text) ||
    TITLE_KEY.test(text)
  );
}

function serializeLine(line: ScriptLine, sceneNumber: number): string {
  const text = line.text;
  if (text.trim() === "") return INTENTIONAL_BLANK;
  switch (line.style) {
    case "scene":
      return `.${text} #${sceneNumber}#`;
    case "action":
      return actionNeedsForce(text) ? `!${text}` : text;
    case "character":
      return `@${text}`;
    case "parenthetical": {
      const t = text.trim();
      return t.startsWith("(") ? t : `(${t})`;
    }
    case "dialogue":
      return text.startsWith("(") ? ` ${text}` : text;
    case "transition":
      return `> ${text.replace(/<\s*$/, "")}`;
  }
}

/** 이전 줄 다음에 빈 줄 없이 바로 이어 쓰는지 */
function joinsPrevious(prev: ScriptLine | undefined, line: ScriptLine) {
  if (!prev) return false;
  if (prev.text.trim() === "" || line.text.trim() === "") {
    // 빈 줄 표시("  ")는 앞뒤 액션 문단에 붙여 써야 Fountain에서 유지된다.
    return prev.style === "action" && line.style === "action";
  }
  if (isDialogueBlockStyle(line.style)) {
    return prev.style === "character" || isDialogueBlockStyle(prev.style);
  }
  return prev.style === "action" && line.style === "action";
}

export function toFountain(doc: ScriptDocument): string {
  const out: string[] = [];
  if (doc.titlePage && doc.titlePage.trim()) {
    out.push(doc.titlePage.trim(), "");
  }

  let sceneNumber = 0;
  let prev: ScriptLine | undefined;
  for (const line of doc.lines) {
    if (line.style === "scene") {
      const manual = /^\s*S\s*#\s*(\d+)/i.exec(line.text);
      sceneNumber = manual ? Number(manual[1]) : sceneNumber + 1;
    }
    if (prev && !joinsPrevious(prev, line)) out.push("");
    out.push(serializeLine(line, sceneNumber));
    prev = line;
  }
  return out.join("\n") + "\n";
}

// ---------- 열기 (Fountain → 원고) ----------

function splitTitlePage(lines: string[]): { titlePage: string | null; body: string[] } {
  if (lines.length === 0 || !TITLE_KEY.test(lines[0])) return { titlePage: null, body: lines };
  let end = 0;
  while (end < lines.length && lines[end].trim() !== "") end++;
  return { titlePage: lines.slice(0, end).join("\n"), body: lines.slice(end + 1) };
}

function stripBoneyard(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

export function fromFountain(source: string): ScriptDocument {
  const raw = stripBoneyard(source.replace(/\r\n?/g, "\n").replace(/^﻿/, ""));
  const { titlePage, body } = splitTitlePage(raw.split("\n"));
  const lines: ScriptLine[] = [];

  let inDialogue = false;
  for (let i = 0; i < body.length; i++) {
    const rawLine = body[i];
    const prevBlank = i === 0 || body[i - 1].trim() === "";
    const nextBlank = i === body.length - 1 || body[i + 1].trim() === "";

    if (rawLine === INTENTIONAL_BLANK) {
      lines.push({ style: "action", text: "" });
      inDialogue = false;
      continue;
    }

    const text = rawLine.trim() === "" ? "" : rawLine.replace(/\s+$/, "");
    if (text === "") {
      inDialogue = false;
      continue;
    }

    // 대사 블록 안: 괄호로 시작하면 괄호지문, 아니면 대사
    if (inDialogue) {
      const t = text.trim();
      if (t.startsWith("(") && t.endsWith(")")) {
        lines.push({ style: "parenthetical", text: t });
      } else {
        lines.push({ style: "dialogue", text: t });
      }
      continue;
    }

    const trimmed = text.trim();

    if (trimmed.startsWith("!")) {
      lines.push({ style: "action", text: trimmed.slice(1) });
      continue;
    }

    if (trimmed.startsWith("[[") || /^=(?!=)/.test(trimmed) || /^#/.test(trimmed)) {
      // 메모, 시놉시스, 섹션은 지금은 액션으로 남긴다.
      lines.push({ style: "action", text: trimmed });
      continue;
    }

    if (trimmed.startsWith(".") && !trimmed.startsWith("..")) {
      lines.push({ style: "scene", text: trimmed.slice(1).replace(SCENE_NUMBER_SUFFIX, "").trim() });
      continue;
    }

    if (
      prevBlank &&
      (STANDARD_SCENE_PREFIX.test(trimmed) || KOREAN_SCENE_PREFIX.test(trimmed))
    ) {
      lines.push({ style: "scene", text: trimmed.replace(SCENE_NUMBER_SUFFIX, "").trim() });
      continue;
    }

    if (trimmed.startsWith(">") && !trimmed.endsWith("<")) {
      lines.push({ style: "transition", text: trimmed.slice(1).trim() });
      continue;
    }

    if (trimmed.startsWith(">") && trimmed.endsWith("<")) {
      // 가운데 정렬 표시는 아직 지원하지 않으므로 액션으로
      lines.push({ style: "action", text: trimmed.slice(1, -1).trim() });
      continue;
    }

    if (prevBlank && nextBlank && isAllCapsLatin(trimmed) && /TO:$/.test(trimmed)) {
      lines.push({ style: "transition", text: trimmed });
      continue;
    }

    const forcedCharacter = trimmed.startsWith("@");
    const nameText = forcedCharacter ? trimmed.slice(1).trim() : trimmed;
    const looksLikeCharacter =
      forcedCharacter ||
      (prevBlank &&
        !nextBlank &&
        isAllCapsLatin(nameText.replace(/\(.*\)\s*\^?$/, "")) &&
        !/[.!?]$/.test(nameText));
    if (looksLikeCharacter && !nextBlank) {
      lines.push({ style: "character", text: nameText.replace(/\s*\^$/, "") });
      inDialogue = true;
      continue;
    }

    lines.push({ style: "action", text: text.replace(/^ {4}|\t/, "") });
  }

  return { titlePage, lines: lines.length > 0 ? lines : [{ style: "action", text: "" }] };
}
