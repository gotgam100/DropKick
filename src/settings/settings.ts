/**
 * DropKick 앱 설정 관리 (로컬 저장소에 보관)
 */
import type { LineStyle } from "../editor/styles";
import { DEFAULT_APP_SHORTCUTS, parseAppShortcuts, type AppShortcuts } from "./appShortcuts";

export type ThemeMode = "system" | "light" | "dark";
export type ZoomPercent = 80 | 100 | 120 | 150;
export type AutosaveInterval = 3000 | 10000 | 30000 | 0;

export type StyleShortcuts = Record<LineStyle, string>;
export type NextStyleRules = Record<LineStyle, LineStyle>;

export const DEFAULT_STYLE_SHORTCUTS: StyleShortcuts = {
  scene: "1",
  action: "2",
  character: "3",
  parenthetical: "4",
  dialogue: "5",
  subheader: "6",
  transition: "7",
};

export const DEFAULT_NEXT_STYLE_RULES: NextStyleRules = {
  scene: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "action",
  subheader: "action",
  transition: "action",
};

export type AppSettings = {
  /** 화면 테마: 맥 설정 따르기 / 밝은 모드 / 어두운 모드 */
  theme: ThemeMode;
  /** 원고 화면 비율: 80% / 100%(기본) / 120% / 150% */
  zoom: ZoomPercent;
  /** 원고에서 현재 커서가 있는 줄 강조 표시 */
  highlightCurrentLine: boolean;
  /** 표지 기본 작가 이름 */
  defaultAuthor: string;
  /** 표지 기본 연락처 */
  defaultContact: string;
  /** 인물 이름 자동 완성 */
  characterAutocomplete: boolean;
  /** 씬헤딩(장소) 자동 완성 */
  sceneAutocomplete: boolean;
  /** 원고 왼쪽 S# 씬 번호 표시 */
  showSceneNumbers: boolean;
  /** 자동 저장 간격 (밀리초, 0이면 자동 저장 끄기) */
  autosaveDelayMs: AutosaveInterval;
  /** 백업 보관 개수 (최대 100개) */
  backupKeepCount: number;
  /** 시작할 때 마지막 작업 프로젝트 자동 열기 */
  openLastProjectOnStart: boolean;
  /** 문장 스타일별 단축키 (숫자/문자 1자리, 기본 1~7) */
  styleShortcuts: StyleShortcuts;
  /** 사이드바·통계·화면 나누기·가이드 단축키 */
  appShortcuts: AppShortcuts;
  /** 줄 끝에서 Enter를 눌렀을 때 다음 스타일 규칙 */
  nextStyleOnEnter: NextStyleRules;
};

const STORAGE_KEY = "dropkick.settings.v1";

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  zoom: 100,
  highlightCurrentLine: true,
  defaultAuthor: "",
  defaultContact: "",
  characterAutocomplete: true,
  sceneAutocomplete: true,
  showSceneNumbers: true,
  autosaveDelayMs: 3000,
  backupKeepCount: 30,
  openLastProjectOnStart: true,
  styleShortcuts: DEFAULT_STYLE_SHORTCUTS,
  appShortcuts: DEFAULT_APP_SHORTCUTS,
  nextStyleOnEnter: DEFAULT_NEXT_STYLE_RULES,
};

export function normalizeZoom(val: unknown): ZoomPercent {
  const n = Number(val);
  if (n === 80 || n === 100 || n === 120 || n === 150) return n;
  return 100;
}

export function loadSettings(): AppSettings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<AppSettings>;
    if (!p || typeof p !== "object") return DEFAULT_SETTINGS;

    const theme: ThemeMode =
      p.theme === "light" || p.theme === "dark" || p.theme === "system" ? p.theme : "system";
    const zoom = normalizeZoom(p.zoom);
    const autosaveDelayMs: AutosaveInterval =
      p.autosaveDelayMs === 3000 ||
      p.autosaveDelayMs === 10000 ||
      p.autosaveDelayMs === 30000 ||
      p.autosaveDelayMs === 0
        ? p.autosaveDelayMs
        : 3000;
    const rawKeep = typeof p.backupKeepCount === "number" ? Math.round(p.backupKeepCount) : 30;
    const backupKeepCount = Math.max(1, Math.min(100, rawKeep));

    const styleShortcuts: StyleShortcuts = {
      ...DEFAULT_STYLE_SHORTCUTS,
      ...(p.styleShortcuts && typeof p.styleShortcuts === "object" ? p.styleShortcuts : {}),
    };

    const nextStyleOnEnter: NextStyleRules = {
      ...DEFAULT_NEXT_STYLE_RULES,
      ...(p.nextStyleOnEnter && typeof p.nextStyleOnEnter === "object" ? p.nextStyleOnEnter : {}),
    };

    return {
      theme,
      zoom,
      highlightCurrentLine:
        typeof p.highlightCurrentLine === "boolean" ? p.highlightCurrentLine : true,
      defaultAuthor: typeof p.defaultAuthor === "string" ? p.defaultAuthor : "",
      defaultContact: typeof p.defaultContact === "string" ? p.defaultContact : "",
      characterAutocomplete:
        typeof p.characterAutocomplete === "boolean" ? p.characterAutocomplete : true,
      sceneAutocomplete: typeof p.sceneAutocomplete === "boolean" ? p.sceneAutocomplete : true,
      showSceneNumbers: typeof p.showSceneNumbers === "boolean" ? p.showSceneNumbers : true,
      autosaveDelayMs,
      backupKeepCount,
      openLastProjectOnStart:
        typeof p.openLastProjectOnStart === "boolean" ? p.openLastProjectOnStart : true,
      styleShortcuts,
      appShortcuts: parseAppShortcuts(p.appShortcuts),
      nextStyleOnEnter,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // 저장 공간 접근이 막혀 있어도 앱 동작에는 지장 없다.
  }
}

/**
 * 프로그램을 처음 다운로드받아 연 상태로 모든 로컬 설정·양식·열었던 프로젝트 기록을 초기화한다.
 */
export function clearAllAppStorage(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.clear();
    }
  } catch {
    // 무시
  }
}
