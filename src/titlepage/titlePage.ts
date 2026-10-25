/**
 * 표지(Fountain 표지 정보) 읽기/쓰기
 *
 *   Title: 드롭킥
 *   Credit: 각본
 *   Author: 홍길동
 *   Source: 원작 웹툰 「…」
 *   Draft date: 2026-10-25
 *   Contact:
 *       010-0000-0000
 *       me@example.com
 *
 * 여러 줄 값은 다음 줄부터 들여 써서 이어진다 (Fountain 규칙).
 * 화면에서 다루지 않는 항목(Notes 등)도 지우지 않고 그대로 보관한다.
 */

export type TitlePageFields = {
  title: string;
  credit: string;
  author: string;
  source: string;
  draftDate: string;
  contact: string;
};

export const EMPTY_TITLE_PAGE: TitlePageFields = {
  title: "",
  credit: "",
  author: "",
  source: "",
  draftDate: "",
  contact: "",
};

const KEYS: Record<keyof TitlePageFields, { key: string; aliases: string[] }> = {
  title: { key: "Title", aliases: ["title"] },
  credit: { key: "Credit", aliases: ["credit"] },
  author: { key: "Author", aliases: ["author", "authors"] },
  source: { key: "Source", aliases: ["source"] },
  draftDate: { key: "Draft date", aliases: ["draft date", "date"] },
  contact: { key: "Contact", aliases: ["contact"] },
};

type Entry = { key: string; lines: string[] };

function parseEntries(text: string | null): Entry[] {
  const entries: Entry[] = [];
  for (const raw of (text ?? "").split("\n")) {
    const match = /^([A-Za-z][A-Za-z ]*):\s*(.*)$/.exec(raw);
    if (match) {
      entries.push({ key: match[1].trim(), lines: match[2].trim() ? [match[2].trim()] : [] });
    } else if (entries.length > 0 && raw.trim()) {
      entries[entries.length - 1].lines.push(raw.trim());
    }
  }
  return entries;
}

function fieldFor(key: string): keyof TitlePageFields | null {
  const lower = key.toLowerCase();
  for (const [field, spec] of Object.entries(KEYS)) {
    if (spec.aliases.includes(lower)) return field as keyof TitlePageFields;
  }
  return null;
}

export function readTitlePage(text: string | null): TitlePageFields {
  const fields = { ...EMPTY_TITLE_PAGE };
  for (const entry of parseEntries(text)) {
    const field = fieldFor(entry.key);
    if (field && !fields[field]) fields[field] = entry.lines.join("\n");
  }
  return fields;
}

/** 입력한 항목으로 표지 글을 만든다. 모르는 항목은 원래 표지에서 그대로 가져온다. 비면 null */
export function writeTitlePage(fields: TitlePageFields, previous: string | null): string | null {
  const out: string[] = [];
  for (const [field, spec] of Object.entries(KEYS) as [keyof TitlePageFields, (typeof KEYS)[keyof TitlePageFields]][]) {
    const lines = fields[field]
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (lines.length === 1) out.push(`${spec.key}: ${lines[0]}`);
    else out.push(`${spec.key}:`, ...lines.map((l) => `    ${l}`));
  }
  for (const entry of parseEntries(previous)) {
    if (fieldFor(entry.key)) continue;
    if (entry.lines.length <= 1) out.push(`${entry.key}: ${entry.lines[0] ?? ""}`);
    else out.push(`${entry.key}:`, ...entry.lines.map((l) => `    ${l}`));
  }
  return out.length > 0 ? out.join("\n") : null;
}
