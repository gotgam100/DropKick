/**
 * DropKick 원고 ↔ Fountain 텍스트 변환
 *
 * 저장할 때는 다른 Fountain 프로그램도 같은 스타일로 읽을 수 있도록
 * 표시 기호를 붙인다. (앱 화면에는 보이지 않는다)
 *
 *   씬헤딩    .내부. 체육관 - 밤 #3#
 *   액션      그대로 (헷갈릴 만한 줄만 앞에 !). >가운데<, **굵게**, *기울임*, _밑줄_ 도 그대로
 *   인물      @민재
 *   괄호지문  (숨을 고르며)
 *   대사      그대로
 *   전환      > CUT TO:
 *   막        # 1막
 *   장        ## 시퀀스 A
 *   씬 요약   = 코끼리가 첫 등장하는 장면
 *
 * 문단 사이는 빈 줄로 나눈다. 인물-괄호지문-대사, 이어지는 액션 줄은 붙여 쓴다.
 */
import type { ScriptLine } from "../editor/lineStyles";
import type { DocStyle } from "../editor/styles";
import type { OutlinePrint } from "../layout/paginate";
import { isCenteredText } from "../layout/inline";
import { numberScenes } from "../layout/sceneNumbers";

export type ScriptDocument = {
  /** Fountain 표지 정보 (Title:, Author: 등). 그대로 보관했다가 다시 쓴다. */
  titlePage: string | null;
  lines: ScriptLine[];
  /** 첫 씬의 번호 (스크립트 설정). 저장할 때 `#번호#`에 쓴다. 기본 1 */
  sceneStart?: number;
  /** PDF·Word로 내보낼 때 막·장·씬 요약을 원고에 넣을지 (스크립트 설정). 저장에는 쓰지 않는다. */
  printOutline?: OutlinePrint;
};

const SCENE_NUMBER_SUFFIX = /\s*#[\w.\-]+#\s*$/;
const STANDARD_SCENE_PREFIX = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s]/i;
const KOREAN_SCENE_PREFIX = /^(?:S\s*#|#)\s*\d+/i;
const TITLE_KEY = /^[A-Za-z][A-Za-z ]*:/;
const INTENTIONAL_BLANK = "  ";

// ---------- 저장 (원고 → Fountain) ----------

function isDialogueBlockStyle(style: DocStyle): style is "parenthetical" | "dialogue" {
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
  // `>가운데 정렬<`은 Fountain에서도 가운데 정렬이므로 그대로 쓴다.
  if (isCenteredText(text)) return false;
  // 줄 앞을 들여 쓴 액션은 ! 뒤에 그대로 써서 들여쓰기를 지킨다.
  if (/^[ \t]/.test(text)) return true;
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
  if (text.trim() === "") {
    // 빈 씬헤딩/서브헤더/전환도 스타일이 남도록 표시만 쓴다. 나머지 빈 줄은 빈 줄 표시로.
    if (line.style === "scene") return ".";
    if (line.style === "subheader") return "..";
    if (line.style === "transition") return ">";
    if (line.style === "act") return "#";
    if (line.style === "chapter") return "##";
    if (line.style === "synopsis") return "=";
    return INTENTIONAL_BLANK;
  }
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
    case "subheader":
      return `..${text}`;
    case "transition":
      return `> ${text.replace(/<\s*$/, "")}`;
    case "act":
      return `# ${text}`;
    case "chapter":
      return `## ${text}`;
    case "synopsis":
      return `= ${text}`;
  }
}

/**
 * 저장할 때 줄 글 앞뒤에 붙는 Fountain 기호. (Fountain 보기에서 화면에 겹쳐 보여 준다. 글은 건드리지 않는다)
 * 예: 씬헤딩 `.` + 글 + ` #1#`, 인물 `@` + 글
 */
export function fountainAffixes(line: ScriptLine, sceneNumber: number): { prefix: string; suffix: string } {
  const out = serializeLine(line, sceneNumber);
  if (line.text.trim() === "") return { prefix: out === INTENTIONAL_BLANK ? "" : out, suffix: "" };
  const at = out.indexOf(line.text);
  if (at < 0) return { prefix: "", suffix: "" };
  return { prefix: out.slice(0, at), suffix: out.slice(at + line.text.length) };
}

/** 이전 줄 다음에 빈 줄 없이 바로 이어 쓰는지 */
function joinsPrevious(prev: ScriptLine | undefined, line: ScriptLine) {
  if (!prev) return false;
  if (prev.text.trim() === "" || line.text.trim() === "") {
    // 빈 줄 표시("  ")는 앞뒤 액션 문단에 붙여 써야 Fountain에서 유지된다.
    return prev.style === "action" && line.style === "action";
  }
  if (line.style === "synopsis") return prev.style === "synopsis";
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

  const scenes = numberScenes(
    doc.lines.map((l) => l.style),
    (n) => doc.lines[n - 1].text,
    doc.sceneStart ?? 1,
  );
  let prev: ScriptLine | undefined;
  doc.lines.forEach((line, i) => {
    if (prev && !joinsPrevious(prev, line)) out.push("");
    out.push(serializeLine(line, scenes.get(i + 1)?.number ?? 0));
    prev = line;
  });
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
    // "  "(빈 줄 표시)는 문단 구분이 아니라 내용이므로 빈 줄로 치지 않는다.
    const isBlank = (s: string) => s.trim() === "" && s !== INTENTIONAL_BLANK;
    const prevBlank = i === 0 || isBlank(body[i - 1]);
    const nextBlank = i === body.length - 1 || isBlank(body[i + 1]);

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

    // `# 막`, `## 장`: # 하나는 막, 둘은 장. 세 개부터와 `#3.`처럼 붙여 쓴 것은 그냥 글로 둔다.
    const section = /^(#{1,2})(?:\s+(.*))?$/.exec(trimmed);
    if (section) {
      lines.push({ style: section[1].length === 1 ? "act" : "chapter", text: (section[2] ?? "").trim() });
      continue;
    }

    // `= 요약`: 씬헤딩이나 다른 요약 바로 뒤에서만 요약이다. 그 밖의 `=` 줄은 글로 남긴다.
    const above = lines[lines.length - 1]?.style;
    if (/^=(?!=)/.test(trimmed) && (above === "scene" || above === "synopsis")) {
      lines.push({ style: "synopsis", text: trimmed.slice(1).trim() });
      continue;
    }

    if (trimmed.startsWith("[[") || /^=(?!=)/.test(trimmed) || /^#/.test(trimmed)) {
      // 메모와 그 밖의 시놉시스·섹션은 지금은 액션으로 남긴다.
      lines.push({ style: "action", text: trimmed });
      continue;
    }

    if (trimmed.startsWith("..")) {
      lines.push({ style: "subheader", text: trimmed.slice(2).trim() });
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
      // 가운데 정렬: 액션 줄로 두고 >…< 기호를 글에 남긴다. (화면과 내보내기가 이 기호로 가운데에 놓는다)
      lines.push({ style: "action", text: trimmed });
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

    // 빈 줄로 나뉜 액션 문단 사이는 빈 액션 줄로 남겨 문단 구분을 지킨다.
    if (prevBlank && lines.length > 0 && lines[lines.length - 1].style === "action") {
      lines.push({ style: "action", text: "" });
    }
    lines.push({ style: "action", text: text.replace(/^ {4}|\t/, "") });
  }

  return { titlePage, lines: lines.length > 0 ? lines : [{ style: "action", text: "" }] };
}

/**
 * 원고 글(Fountain)을 표지와 줄 목록으로. 프로젝트를 열거나 스크립트를 바꿀 때 쓴다.
 * 막·장·씬 요약 줄도 그대로 둔다. (빼면 다시 열 때 사라지고, 다음 자동 저장 때 파일에서도 지워진다)
 */
export function scriptLinesOf(text: string): { titlePage: string | null; lines: ScriptLine[] } {
  const doc = fromFountain(text);
  return { titlePage: doc.titlePage, lines: doc.lines };
}
