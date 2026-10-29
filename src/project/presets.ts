/**
 * 문서 프리셋 (기본값: 인물 설정, 사용자가 직접 추가·편집·삭제 가능)
 */
import { newId } from "./model";

export type DocPreset = {
  id: string;
  /** 메뉴에 보이는 프리셋 이름 (예: "인물 설정", "장소 설정", "스크립트 양식") */
  name: string;
  /** 이 프리셋으로 새 문서를 만들 때 기본 문서 이름 (예: "새 인물", "새 장소", "새 스크립트") */
  defaultDocName: string;
  /** "character"이면 인물 통계 연결, "script"이면 시나리오 원고 형식 */
  docType: "character" | "memo" | "script";
  /** 사이드바에 표시할 SF 심볼 아이콘 id */
  icon?: string;
  /** 첫 줄 제목(# 문서 이름) 아래에 들어갈 양식 본문 */
  body: string;
};

const STORAGE_KEY = "dropkick.presets.v1";

export const DEFAULT_CHARACTER_BODY = `## 기본 정보
- 나이:
- 성별:
- 직업:
- 외모:

## 성격
- 성격:
- 말투:
- 습관·버릇:

## 이야기 속 역할
- 원하는 것 (목표):
- 필요한 것 (결핍):
- 두려워하는 것:
- 비밀:

## 관계
- 

## 변화 (아크)
- 처음:
- 끝:

## 메모
`;

export const DEFAULT_CHARACTER_PRESET: DocPreset = {
  id: "preset-character",
  name: "인물 양식",
  defaultDocName: "새 인물",
  docType: "character",
  icon: "person",
  body: DEFAULT_CHARACTER_BODY,
};

export const DEFAULT_PRESET_IDS = new Set(["preset-character"]);
export function isDefaultPreset(id: string): boolean {
  return DEFAULT_PRESET_IDS.has(id);
}

export const DEFAULT_PRESETS: DocPreset[] = [DEFAULT_CHARACTER_PRESET];

/** 프리셋과 문서 이름으로 실제 문서 텍스트를 만든다. */
export function formatPresetText(preset: Pick<DocPreset, "body"> & { docType?: string }, docName: string): string {
  const cleaned = extractPresetBody(preset.body);
  if (preset.docType === "script") {
    if (/^Title:/m.test(cleaned)) {
      return cleaned.replace(/^Title:\s*[^\n]*/m, `Title: ${docName}`);
    }
    return cleaned;
  }
  return cleaned ? `# ${docName}\n\n${cleaned}` : `# ${docName}\n\n`;
}

/** 문서 전체 글에서 맨 위 `# 제목` 줄을 떼어 내고 양식 본문만 뽑는다. */
export function extractPresetBody(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const withoutTitle = normalized.replace(/^#\s+[^\n]*\n+/, "");
  return withoutTitle.replace(/^\n+/, "");
}

function isValidPreset(value: unknown): value is DocPreset {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    p.id.length > 0 &&
    typeof p.name === "string" &&
    p.name.trim().length > 0 &&
    typeof p.defaultDocName === "string" &&
    (p.docType === "character" || p.docType === "memo" || p.docType === "script") &&
    typeof p.body === "string"
  );
}

/** 저장된 프리셋 목록을 읽는다. 저장된 것이 없으면 기본값을 돌려준다. */
export function loadPresets(): DocPreset[] {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return DEFAULT_PRESETS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PRESETS;
    const valid = parsed
      .filter(isValidPreset)
      .filter((p) => p.id !== "preset-script")
      .map((p) =>
        p.id === "preset-character" && p.name === "인물 설정" ? { ...p, name: "인물 양식" } : p,
      );
    if (valid.length === 0) return DEFAULT_PRESETS;
    const hasChar = valid.some((p) => p.id === "preset-character");
    let result = valid;
    if (!hasChar) result = [DEFAULT_CHARACTER_PRESET, ...result];
    return result;
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function savePresets(presets: DocPreset[]): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
    }
  } catch {
    // 저장 공간 접근이 막혀 있어도 앱 동작에는 지장 없다.
  }
}

export function createCustomPreset(input: {
  name: string;
  defaultDocName?: string;
  docType?: "character" | "memo" | "script";
  icon?: string;
  body: string;
}): DocPreset {
  const name = input.name.trim() || "새 프리셋";
  const defaultDocName = input.defaultDocName?.trim() || `새 ${name.replace(/\s*설정$/, "") || "문서"}`;
  const docType = input.docType ?? "memo";
  const defaultIcon = docType === "character" ? "person" : docType === "script" ? "film" : "doc.text";
  return {
    id: newId("preset"),
    name,
    defaultDocName,
    docType,
    icon: input.icon || defaultIcon,
    body: extractPresetBody(input.body),
  };
}
