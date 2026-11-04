/**
 * 블레이크 스나이더의 '세이브 더 캣(Save the Cat!)' 15단계 3막 구조 데이터 모델.
 * - 각 비트 카드는 기본 명칭을 가지며 사용자가 커스텀 명칭으로 수정할 수 있다.
 * - 각 막(1막·2막·3막)마다 카드를 자유롭게 추가하거나 삭제할 수 있다.
 * - 각 비트 카드에는 시놉시스와 여러 개의 원고 씬을 등록할 수 있다.
 */
import type { SceneSummary } from "../analysis/analyze";
import { newId } from "../project/model";

export type BeatDefinition = {
  id: string;
  number: number;
  act: 1 | 2 | 3;
  defaultTitle: string;
  targetLabel: string;
  /** 권장 위치 범위 (0 ~ 100%) */
  targetRange: [number, number];
  guide: string;
};

export const SAVE_THE_CAT_BEATS: readonly BeatDefinition[] = [
  // ---------- 1막 (설정) ----------
  {
    id: "opening-image",
    number: 1,
    act: 1,
    defaultTitle: "오프닝 이미지",
    targetLabel: "0~1%",
    targetRange: [0, 2],
    guide: "영화의 첫인상이자 변화 전 주인공의 현재 상태를 보여주는 장면",
  },
  {
    id: "theme-stated",
    number: 2,
    act: 1,
    defaultTitle: "주제 제시",
    targetLabel: "5%",
    targetRange: [3, 8],
    guide: "영화 전체를 관통하는 주제(핵심 질문)가 대화나 상황으로 처음 언급되는 순간",
  },
  {
    id: "set-up",
    number: 3,
    act: 1,
    defaultTitle: "설정",
    targetLabel: "1~10%",
    targetRange: [1, 12],
    guide: "주인공의 일상과 결핍, 주변 인물, 목표를 소개하는 구간",
  },
  {
    id: "catalyst",
    number: 4,
    act: 1,
    defaultTitle: "기폭제",
    targetLabel: "10%",
    targetRange: [8, 14],
    guide: "주인공의 일상을 뒤흔들고 사건을 시작하게 만드는 결정적 사건",
  },
  {
    id: "debate",
    number: 5,
    act: 1,
    defaultTitle: "토론(구성점1)",
    targetLabel: "10~20%",
    targetRange: [10, 22],
    guide: "새로운 세계(모험)로 나아갈지 망설이고 갈등하는 구간",
  },

  // ---------- 2막 (대립) ----------
  {
    id: "break-into-two",
    number: 6,
    act: 2,
    defaultTitle: "2막 진입",
    targetLabel: "20%",
    targetRange: [18, 25],
    guide: "주인공이 스스로 선택하여 이전 세계를 떠나 본격적인 이야기로 뛰어드는 순간",
  },
  {
    id: "b-story",
    number: 7,
    act: 2,
    defaultTitle: "B 스토리",
    targetLabel: "22%",
    targetRange: [20, 28],
    guide: "주제를 일깨워 줄 새로운 인물(조력자·연인·관계)이나 서브 플롯이 시작되는 지점",
  },
  {
    id: "fun-and-games",
    number: 8,
    act: 2,
    defaultTitle: "재미와 놀이",
    targetLabel: "20~50%",
    targetRange: [20, 52],
    guide: "이 영화의 장르적 재미와 핵심 컨셉(예고편에 나올 장면들)이 본격적으로 펼쳐지는 구간",
  },
  {
    id: "midpoint",
    number: 9,
    act: 2,
    defaultTitle: "중간점",
    targetLabel: "50%",
    targetRange: [45, 55],
    guide: "가짜 승리 혹은 가짜 패배. 사건의 판도가 커지고 마감 시한(시계)이 작동하는 전환점",
  },
  {
    id: "bad-guys-close-in",
    number: 10,
    act: 2,
    defaultTitle: "악당이 다가오다",
    targetLabel: "50~75%",
    targetRange: [50, 76],
    guide: "외부의 적대 세력이 강해지고 주인공 팀 내부에서도 균열·의심이 커지는 구간",
  },
  {
    id: "all-is-lost",
    number: 11,
    act: 2,
    defaultTitle: "절망의 순간",
    targetLabel: "75%",
    targetRange: [70, 79],
    guide: "모든 것을 잃은 것 같은 가짜 패배의 순간. 스승의 부재나 가장 큰 좌절",
  },
  {
    id: "dark-night-of-the-soul",
    number: 12,
    act: 2,
    defaultTitle: "영혼의 어두운 밤(구성점2)",
    targetLabel: "75~80%",
    targetRange: [74, 82],
    guide: "좌절 끝에 진정한 깨달음(주제)과 해결의 실마리를 스스로 찾아내는 시간",
  },

  // ---------- 3막 (해결) ----------
  {
    id: "break-into-three",
    number: 13,
    act: 3,
    defaultTitle: "3막 진입",
    targetLabel: "80%",
    targetRange: [78, 85],
    guide: "A 스토리와 B 스토리의 깨달음이 합쳐져 마지막 승부를 향해 나아가는 순간",
  },
  {
    id: "finale",
    number: 14,
    act: 3,
    defaultTitle: "피날레",
    targetLabel: "80~99%",
    targetRange: [80, 99],
    guide: "주인공이 변화된 모습으로 문제를 해결하고 클라이맥스를 돌파하는 구간",
  },
  {
    id: "final-image",
    number: 15,
    act: 3,
    defaultTitle: "마지막 이미지",
    targetLabel: "99~100%",
    targetRange: [95, 100],
    guide: "오프닝 이미지와 대비되며 주인공과 세계가 어떻게 달라졌는지 보여주는 마지막 장면",
  },
];

export const ACT_META: Record<1 | 2 | 3, { title: string; colorClass: string }> = {
  1: { title: "1막 · 설정", colorClass: "act-1" },
  2: { title: "2막 · 대립", colorClass: "act-2" },
  3: { title: "3막 · 해결", colorClass: "act-3" },
};

/** 카드에 등록된 개별 씬 참조 정보 */
export type AssignedSceneRef = {
  key: string;
  sceneNumber: number;
  heading: string;
  snippet: string;
};

/** 개별 비트 카드의 사용자 입력 상태 */
export type BeatCardState = {
  id: string;
  act: 1 | 2 | 3;
  /** 커스텀 카드 명칭 */
  title: string;
  /** 기본 카드 명칭 (되돌리기 기준) */
  defaultTitle: string;
  /** 단계 설명 가이드 */
  guide: string;
  /** 카드 내 시놉시스 (여러 줄 가능) */
  synopsis: string;
  /** 카드에 등록된 씬 목록 (여러 씬 등록 가능) */
  scenes: AssignedSceneRef[];
};

export type StructureBoardData = {
  format: "dropkick-structure";
  version: 1;
  template: "save-the-cat";
  beats: BeatCardState[];
};

/** "S#1. 내부. 체육관 - 밤" 또는 "#1. 내부. 체육관 - 밤" → "내부. 체육관 - 밤" */
export function cleanSceneHeading(heading: string): string {
  return heading.replace(/^\s*(?:(?:S\s*#|#)\s*\d+[A-Z]?\.?|\d+[A-Z]?\.)\s*/i, "").trim();
}

function snippetOf(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 60);
}

export function makeSceneRef(scene: SceneSummary): AssignedSceneRef {
  return {
    key: newId("sref"),
    sceneNumber: scene.number,
    heading: cleanSceneHeading(scene.heading),
    snippet: snippetOf(scene.text),
  };
}

export function createDefaultStructureBoard(): StructureBoardData {
  return {
    format: "dropkick-structure",
    version: 1,
    template: "save-the-cat",
    beats: SAVE_THE_CAT_BEATS.map((b) => ({
      id: b.id,
      act: b.act,
      title: b.defaultTitle,
      defaultTitle: b.defaultTitle,
      guide: b.guide,
      synopsis: "",
      scenes: [],
    })),
  };
}

export function createCustomBeatCard(act: 1 | 2 | 3, title = "새 단계"): BeatCardState {
  return {
    id: newId("beat"),
    act,
    title,
    defaultTitle: title,
    guide: "",
    synopsis: "",
    scenes: [],
  };
}

export function serializeStructureBoard(board: StructureBoardData): string {
  return `${JSON.stringify(board, null, 2)}\n`;
}

export function parseStructureBoard(text: string): StructureBoardData {
  const fallback = createDefaultStructureBoard();
  if (!text || !text.trim()) return fallback;
  try {
    const raw = JSON.parse(text) as Partial<StructureBoardData>;
    if (!raw || !Array.isArray(raw.beats)) return fallback;

    const defById = new Map(SAVE_THE_CAT_BEATS.map((d) => [d.id, d]));
    const parsedBeats: BeatCardState[] = [];

    for (const item of raw.beats) {
      if (!item || typeof item !== "object" || typeof item.id !== "string") continue;
      const def = defById.get(item.id);
      const act: 1 | 2 | 3 =
        item.act === 1 || item.act === 2 || item.act === 3 ? item.act : (def?.act ?? 1);
      const defaultTitle =
        def?.defaultTitle ??
        (typeof item.defaultTitle === "string" && item.defaultTitle.trim()
          ? item.defaultTitle
          : "새 단계");
      const guide = typeof item.guide === "string" ? item.guide : (def?.guide ?? "");

      let rawTitle = typeof item.title === "string" && item.title.trim() ? item.title : defaultTitle;
      // 이전 기본 명칭을 새 기본 명칭으로 자동 보정
      if (item.id === "debate" && rawTitle === "고민") {
        rawTitle = "토론(구성점1)";
      } else if (item.id === "bad-guys-close-in" && rawTitle === "다가오는 악당") {
        rawTitle = "악당이 다가오다";
      } else if (item.id === "dark-night-of-the-soul" && rawTitle === "영혼의 어두운 밤") {
        rawTitle = "영혼의 어두운 밤(구성점2)";
      } else if (item.id === "final-image" && rawTitle === "파이널 이미지") {
        rawTitle = "마지막 이미지";
      }

      const scenes: AssignedSceneRef[] = Array.isArray(item.scenes)
        ? item.scenes
            .filter(
              (s): s is AssignedSceneRef =>
                Boolean(s) &&
                typeof s.key === "string" &&
                typeof s.sceneNumber === "number" &&
                typeof s.heading === "string",
            )
            .map((s) => ({
              key: s.key,
              sceneNumber: s.sceneNumber,
              heading: s.heading,
              snippet: typeof s.snippet === "string" ? s.snippet : "",
            }))
        : [];

      parsedBeats.push({
        id: item.id,
        act,
        title: rawTitle,
        defaultTitle,
        guide,
        synopsis: typeof item.synopsis === "string" ? item.synopsis : "",
        scenes,
      });
    }

    return {
      format: "dropkick-structure",
      version: 1,
      template: "save-the-cat",
      beats: parsedBeats,
    };
  } catch {
    return fallback;
  }
}

/**
 * 카드에 저장된 씬 참조(AssignedSceneRef)를 현재 원고의 실제 씬(SceneSummary)과 연결한다.
 * - 앞에 새 씬이 추가되어 씬 번호가 밀려도 장소 제목과 본문 일부(snippet)로 따라간다.
 * - 같은 씬 번호 자리에서 제목만 살짝 고친 경우에도 본문이 같으면 연결을 유지한다.
 */
export function resolveSceneRef(ref: AssignedSceneRef, scenes: SceneSummary[]): SceneSummary | null {
  const valid = scenes.filter((s) => s.number > 0);
  if (valid.length === 0) return null;

  // 1. 번호와 제목이 모두 일치하는 경우
  const exact = valid.find(
    (s) => s.number === ref.sceneNumber && cleanSceneHeading(s.heading) === ref.heading,
  );
  if (exact) return exact;

  // 2. 제목이 같고 본문 앞부분도 일치하는 씬 (앞에 씬이 추가·삭제되어 번호만 밀린 경우)
  const sameHeading = valid.filter((s) => cleanSceneHeading(s.heading) === ref.heading);
  if (sameHeading.length === 1) return sameHeading[0];
  if (sameHeading.length > 1) {
    if (ref.snippet) {
      const snippetMatch = sameHeading.find((s) => snippetOf(s.text) === ref.snippet);
      if (snippetMatch) return snippetMatch;
    }
    // 번호가 가장 가까운 씬
    return sameHeading
      .slice()
      .sort((a, b) => Math.abs(a.number - ref.sceneNumber) - Math.abs(b.number - ref.sceneNumber))[0];
  }

  // 3. 씬헤딩을 수정했지만 같은 번호 자리이고 본문 앞부분이 같은 경우
  if (ref.snippet) {
    const bySnippet = valid.find((s) => snippetOf(s.text) === ref.snippet);
    if (bySnippet) return bySnippet;
  }

  return null;
}
