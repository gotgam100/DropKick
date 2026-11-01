import type { LineStyle } from "../editor/styles";

/** 한 줄 안에서 떨어져 있는 글 덩어리 하나. (예: "미숙   하아... 없다"에서 이름과 대사는 덩어리가 둘이다) */
export type Seg = {
  /** 왼쪽에서의 위치 (pt). Word는 들여쓰기, 가운데 맞춤은 CENTER_X, 오른쪽 맞춤은 RIGHT_X */
  x: number;
  text: string;
  /** 글꼴 이름. 본문과 다른 글꼴(굵은 글씨 등)이면 씬헤딩일 수 있다 */
  font?: string;
  size?: number;
  /** 글이 끝나는 위치 (PDF). 줄이 끝까지 찼는지 보는 데 쓴다 */
  right?: number;
  /** 문서가 스타일 이름을 직접 알려 줄 때 (Word의 문단 스타일) */
  hint?: LineStyle;
  /** 문단 스타일 이름 (Word). 같은 스타일 문단이 인물과 대사를 함께 담는 문서를 알아보는 데 쓴다 */
  block?: string;
};

/** 문서의 한 줄. PDF는 화면에 보이는 줄, Word는 문단 하나. */
export type Row = {
  /** 쪽 번호 (1부터). Word는 1 */
  page: number;
  /** 쪽 위에서의 거리 (pt). Word는 문단 순서 */
  y: number;
  segs: Seg[];
  pageWidth?: number;
  pageHeight?: number;
  /** true면 한 문단이 통째로 한 줄에 들어 있다 (이어 붙이지 않는다) */
  paragraph?: boolean;
};

export const CENTER_X = 5000;
export const RIGHT_X = 9000;

/** 확인하면 좋은 곳의 종류 */
export type ReviewKind = "orphan-dialogue" | "lonely-name" | "no-scene" | "no-character";

export type ReviewItem = { kind: ReviewKind; page: number; text: string };

export type ImportReport = {
  scenes: number;
  characters: string[];
  dialogues: number;
  actions: number;
  /** 사람이 확인하면 좋은 곳 */
  review: ReviewItem[];
  /** 쪽 번호·머리말처럼 걷어 낸 줄 수 */
  removed: number;
};

export type ImportedScript = {
  /** 표지로 보이는 쪽에서 찾은 제목 (없으면 null) */
  title: string | null;
  lines: { style: LineStyle; text: string }[];
  report: ImportReport;
  /** 확실하지 않아서 물어보고 싶은 것 (답을 주고 다시 분석하면 사라진다) */
  questions: Question[];
};

/** 분석 전에 작가에게 확인하고 싶은 것 */
export type Question =
  | { id: "cover"; title: string }
  | { id: "character"; options: { x: number; samples: string[] }[] }
  | { id: "subheader"; samples: string[] };

/** 질문에 대한 작가의 답. 답이 없는 항목은 자동으로 정한다 */
export type Answers = {
  cover?: { isCover: boolean; title: string };
  /** 인물 이름이 시작하는 위치. null이면 인물 이름 줄이 따로 없다 */
  characterX?: number | null;
  /** 글씨체가 달라 헷갈렸던 줄마다 작가가 고른 스타일 (줄 글 → 스타일) */
  lineStyles?: Record<string, LineStyle>;
};
