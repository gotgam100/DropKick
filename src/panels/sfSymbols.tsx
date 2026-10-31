/**
 * 사이드바 폴더·문서용 SF Symbols 아이콘 모음 및 아이콘 변경 팝업창.
 */
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ProjectNode } from "../project/model";

export type SymbolCategory = "all" | "docs" | "film" | "people" | "places" | "objects";

export type SfSymbolDef = {
  /** 저장되는 식별자 (SF Symbol 이름 기준) */
  id: string;
  /** 한국어 이름 */
  label: string;
  /** 검색용 키워드 */
  keywords: string;
  category: Exclude<SymbolCategory, "all">;
  render: (open?: boolean) => ReactNode;
};

export const SF_SYMBOLS: SfSymbolDef[] = [
  // ---------- 문서·보관 ----------
  {
    id: "folder",
    label: "폴더",
    keywords: "folder 폴더 디렉토리",
    category: "docs",
    render: (open) =>
      open ? (
        <path d="M1.5 4.5v8h11l2-5.5H4l-2 5.5M1.5 4.5V3h4l1.5 1.5h5.5V7" strokeLinejoin="round" />
      ) : (
        <path d="M1.5 3h4L7 4.5h7.5v8h-13z" strokeLinejoin="round" />
      ),
  },
  {
    id: "doc.text",
    label: "문서",
    keywords: "doc text document 문서 메모 글",
    category: "docs",
    render: () => (
      <>
        <path d="M3 1.5h7l3 3v10H3z" strokeLinejoin="round" />
        <path d="M10 1.5v3h3M5.5 7h5M5.5 9.5h5M5.5 12h3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "script",
    label: "시나리오 원고",
    keywords: "script page 원고 대본 시나리오",
    category: "docs",
    render: () => (
      <>
        <rect x="3" y="1.5" width="10" height="13" rx="1" />
        <path d="M5.5 5h5M5.5 7.5h5M7 10h3.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "book",
    label: "책·개요",
    keywords: "book synopsis 책 개요 시놉시스 스토리",
    category: "docs",
    render: () => <path d="M2 3.5c2-1 4-1 6 0v10c-2-1-4-1-6 0zM8 3.5c2-1 4-1 6 0v10c-2-1-4-1-6 0z" strokeLinejoin="round" />,
  },
  {
    id: "book.closed",
    label: "덮인 책",
    keywords: "book closed 단행본 원작 소설 대본집",
    category: "docs",
    render: () => (
      <>
        <path d="M3.5 2h9v12h-9a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 3.5 2z" strokeLinejoin="round" />
        <path d="M5 2v12M2.5 12h10" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "note.text",
    label: "노트·메모",
    keywords: "note memo 노트 메모장 정리",
    category: "docs",
    render: () => (
      <>
        <rect x="2.5" y="2" width="11" height="12" rx="1.5" />
        <path d="M5 5.5h6M5 8h6M5 10.5h3.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "list.bullet",
    label: "목록·구성안",
    keywords: "list bullet 목록 구성 트리트먼트 순서",
    category: "docs",
    render: () => (
      <>
        <circle cx="3.2" cy="4.5" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="3.2" cy="8" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="3.2" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
        <path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "checklist",
    label: "체크리스트",
    keywords: "checklist todo 할일 점검 확인 수정사항",
    category: "docs",
    render: () => (
      <>
        <path d="M2.2 5l1.3 1.3 2.3-2.5M2.2 10.5l1.3 1.3 2.3-2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 5h5.5M8 10.5h5.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "bookmark",
    label: "책갈피",
    keywords: "bookmark 책갈피 북마크 표시",
    category: "docs",
    render: () => <path d="M4 2h8v12l-4-3-4 3z" strokeLinejoin="round" />,
  },
  {
    id: "archivebox",
    label: "보관함",
    keywords: "archive box 보관함 상자 기타 자료",
    category: "docs",
    render: () => (
      <>
        <rect x="2" y="2.5" width="12" height="3" rx="0.8" />
        <path d="M3 5.5v8h10v-8M6.5 8.5h3" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "rectangle.split.3x1",
    label: "3막 구조 보드",
    keywords: "structure board 3막 구조 칸반 보드 세이브더캣",
    category: "docs",
    render: () => (
      <>
        <rect x="1.8" y="2.5" width="12.4" height="11" rx="1.2" />
        <path d="M6 2.5v11M10 2.5v11" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "paperclip",
    label: "클립·첨부",
    keywords: "paperclip clip 클립 첨부 참고자료",
    category: "docs",
    render: () => (
      <path
        d="M10.5 4.5l-5.2 5.2a1.8 1.8 0 0 0 2.5 2.5l5.6-5.6a3.2 3.2 0 1 0-4.5-4.5L3.3 7.7a4.6 4.6 0 0 0 6.5 6.5l4.2-4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },

  // ---------- 영화·창작 ----------
  {
    id: "clapperboard",
    label: "슬레이트",
    keywords: "clapperboard slate 슬레이트 촬영 씬 장면 영화",
    category: "film",
    render: () => (
      <>
        <rect x="2" y="5.5" width="12" height="8" rx="1" />
        <path d="M2 5.5l1.2-3h10.3l-.8 3zM5.5 2.5l-1 3M9.5 2.5l-1 3" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "film",
    label: "필름",
    keywords: "film movie cinema 필름 영화 영상 시퀀스",
    category: "film",
    render: () => (
      <>
        <rect x="2" y="2.5" width="12" height="11" rx="1" />
        <path d="M5 2.5v11M11 2.5v11M2 5.5h3M11 5.5h3M2 8h12M2 10.5h3M11 10.5h3" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "theatermasks",
    label: "연극 가면·장르",
    keywords: "theater masks 가면 연극 드라마 희극 비극 연기",
    category: "film",
    render: () => (
      <>
        <path d="M2 3h7v4.5c0 2.2-1.6 4-3.5 4S2 9.7 2 7.5z" strokeLinejoin="round" />
        <path d="M4 6h.01M7 6h.01M4.2 8.3c.7.6 1.9.6 2.6 0" strokeLinecap="round" />
        <path d="M9 6.5h5V11c0 2-1.5 3.5-3.2 3.5-1.4 0-2.6-.9-3-2.2" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "video",
    label: "카메라·연출",
    keywords: "video camera 카메라 연출 촬영 콘티",
    category: "film",
    render: () => (
      <>
        <rect x="1.8" y="4.2" width="8.7" height="7.6" rx="1.4" />
        <path d="M10.5 6.8l3.7-2v6.4l-3.7-2z" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "camera",
    label: "사진·스틸컷",
    keywords: "camera photo 사진 이미지 레퍼런스 스틸",
    category: "film",
    render: () => (
      <>
        <path d="M2 5h2.5l1.2-1.8h4.6L11.5 5H14v8H2z" strokeLinejoin="round" />
        <circle cx="8" cy="9" r="2.3" />
      </>
    ),
  },
  {
    id: "lightbulb",
    label: "아이디어·영감",
    keywords: "lightbulb bulb idea 전구 아이디어 영감 발상 소재",
    category: "film",
    render: () => (
      <>
        <path d="M5.5 10.5c-1.2-.9-2-2.2-2-3.8a4.5 4.5 0 0 1 9 0c0 1.6-.8 2.9-2 3.8l-.4 1.5H5.9z" strokeLinejoin="round" />
        <path d="M6.2 14h3.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "sparkles",
    label: "반짝임·하이라이트",
    keywords: "sparkles magic 반짝임 포인트 명장면 핵심",
    category: "film",
    render: () => (
      <>
        <path d="M8 2l1.3 3.7L13 7l-3.7 1.3L8 12 6.7 8.3 3 7l3.7-1.3z" strokeLinejoin="round" />
        <path d="M12.8 11l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "quote.bubble",
    label: "대사·말풍선",
    keywords: "quote bubble dialogue 대사 말풍선 대화 인터뷰",
    category: "film",
    render: () => <path d="M2.5 3.5h11v7.5H7l-3.5 3v-3h-1z" strokeLinejoin="round" />,
  },
  {
    id: "music.note",
    label: "음악·사운드",
    keywords: "music note audio 음악 소리 효과음 OST 노래",
    category: "film",
    render: () => (
      <>
        <path d="M6 12.2V3.5l7-1.5v8.7" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="4.3" cy="12.2" r="1.7" />
        <circle cx="11.3" cy="10.7" r="1.7" />
      </>
    ),
  },
  {
    id: "mic",
    label: "마이크·내레이션",
    keywords: "mic voice 마이크 목소리 내레이션 녹음",
    category: "film",
    render: () => (
      <>
        <rect x="5.8" y="2" width="4.4" height="7" rx="2.2" />
        <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0M8 12v2.2M5.8 14.2h4.4" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "paintbrush",
    label: "미술·톤앤매너",
    keywords: "paintbrush art 미술 색감 비주얼 컨셉",
    category: "film",
    render: () => (
      <>
        <path d="M12.8 2.2l1 1-6.5 6.5-1.8-.3-.3-1.8z" strokeLinejoin="round" />
        <path d="M5.2 9.4c-1.5.2-2.5 1.3-2.5 2.6 0 .8-.5 1.4-1.2 1.7 1.6.5 3.8.2 4.6-1.2.4-.7.3-1.6-.9-3.1z" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "pencil",
    label: "집필·초고",
    keywords: "pencil write 연필 쓰기 초고 메모",
    category: "film",
    render: () => (
      <path d="M11.5 2.2l2.3 2.3L5.3 13H3v-2.3zM9.8 3.9l2.3 2.3" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },

  // ---------- 인물·감정 ----------
  {
    id: "person",
    label: "인물 (1명)",
    keywords: "person character 인물 사람 주인공 캐릭터",
    category: "people",
    render: () => (
      <>
        <circle cx="8" cy="5.5" r="2.8" />
        <path d="M2.5 14c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "person.2",
    label: "인물들·관계",
    keywords: "people group 인물들 관계 가족 팀 조연",
    category: "people",
    render: () => (
      <>
        <circle cx="6" cy="5.5" r="2.3" />
        <path d="M1.8 13.5c.5-2.4 2.2-3.7 4.2-3.7s3.7 1.3 4.2 3.7" strokeLinecap="round" />
        <circle cx="11" cy="6" r="1.9" />
        <path d="M11 10.2c1.6 0 2.9 1 3.4 2.9" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "heart",
    label: "하트·감정",
    keywords: "heart love 하트 사랑 감정 로맨스 관계",
    category: "people",
    render: () => (
      <path d="M8 13.5s-5.5-3.4-5.5-7.2A3.2 3.2 0 0 1 8 4.2a3.2 3.2 0 0 1 5.5 2.1c0 3.8-5.5 7.2-5.5 7.2z" strokeLinejoin="round" />
    ),
  },
  {
    id: "face.smiling",
    label: "미소·호감",
    keywords: "smile face 얼굴 표정 미소 유머",
    category: "people",
    render: () => (
      <>
        <circle cx="8" cy="8" r="6" />
        <circle cx="6" cy="6.8" r="0.7" fill="currentColor" stroke="none" />
        <circle cx="10" cy="6.8" r="0.7" fill="currentColor" stroke="none" />
        <path d="M5.6 9.8c.6 1 1.4 1.5 2.4 1.5s1.8-.5 2.4-1.5" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "eye",
    label: "시선·관찰",
    keywords: "eye view 눈 시선 시점 관찰 비밀",
    category: "people",
    render: () => (
      <>
        <path d="M1.5 8s2.5-4.2 6.5-4.2S14.5 8 14.5 8s-2.5 4.2-6.5 4.2S1.5 8 1.5 8z" strokeLinejoin="round" />
        <circle cx="8" cy="8" r="2" />
      </>
    ),
  },
  {
    id: "crown",
    label: "왕관·주연",
    keywords: "crown king 왕관 주인공 보스 권력",
    category: "people",
    render: () => <path d="M2 12.5l1-7 3 2.8L8 4l2 4.3 3-2.8 1 7z" strokeLinejoin="round" />,
  },
  {
    id: "eyeglasses",
    label: "안경·분석",
    keywords: "eyeglasses glasses 안경 학자 조력자 연구",
    category: "people",
    render: () => (
      <>
        <circle cx="4.5" cy="9.5" r="2.3" />
        <circle cx="11.5" cy="9.5" r="2.3" />
        <path d="M6.8 9.2h2.4M2.2 9.2L3.5 4.5M13.8 9.2l-1.3-4.7" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "hand.raised",
    label: "손·약속·저지",
    keywords: "hand stop 손 다짐 갈등 멈춤",
    category: "people",
    render: () => (
      <path
        d="M5.5 8V3.5M7.5 7.5V2.5M9.5 7.5V3.2M11.5 8.5V5M5.5 8l-1.3-1.2a1 1 0 0 0-1.4 1.4l2.5 3.8c.7 1 1.8 1.8 3.2 1.8h1c2 0 3.5-1.5 3.5-3.5V8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },

  // ---------- 장소·자연 ----------
  {
    id: "mappin",
    label: "장소 핀",
    keywords: "mappin pin location 장소 위치 로케이션 지도",
    category: "places",
    render: () => (
      <>
        <path d="M8 14.2s4.5-4.2 4.5-7.7a4.5 4.5 0 1 0-9 0c0 3.5 4.5 7.7 4.5 7.7z" strokeLinejoin="round" />
        <circle cx="8" cy="6.5" r="1.5" />
      </>
    ),
  },
  {
    id: "house",
    label: "집·실내",
    keywords: "house home 집 실내 가정 방",
    category: "places",
    render: () => (
      <>
        <path d="M2 7.5L8 2.3l6 5.2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3.5 6.5v7h9v-7M6.5 13.5v-4h3v4" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "building.2",
    label: "도시·건물",
    keywords: "building city 건물 빌딩 도시 회사 학교 병원",
    category: "places",
    render: () => (
      <>
        <path d="M2.5 14V3h6.5v11M9 6.5h4.5V14M1.5 14h13" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 5.5h1M6.5 5.5h1M4.5 8h1M6.5 8h1M4.5 10.5h1M6.5 10.5h1M11 9h1M11 11.5h1" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "globe",
    label: "세계관·배경",
    keywords: "globe world 지구 세계관 시대배경 해외",
    category: "places",
    render: () => (
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "car",
    label: "자동차·이동",
    keywords: "car vehicle 자동차 도로 추격 이동",
    category: "places",
    render: () => (
      <>
        <path d="M2 9l1.5-4h9L14 9v3.5H2zM3.5 12.5V14M12.5 12.5V14" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="4.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="11.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    id: "moon.stars",
    label: "달·밤",
    keywords: "moon night 달 밤 새벽 꿈",
    category: "places",
    render: () => (
      <>
        <path d="M11.5 10.8A5.2 5.2 0 0 1 6.2 3a5.2 5.2 0 1 0 6.8 6.8c-.5.4-1 .8-1.5 1z" strokeLinejoin="round" />
        <path d="M11.8 2.8v2M10.8 3.8h2" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "sun.max",
    label: "해·낮",
    keywords: "sun day 해 태양 낮 아침 여름",
    category: "places",
    render: () => (
      <>
        <circle cx="8" cy="8" r="3" />
        <path
          d="M8 1.8v1.5M8 12.7v1.5M1.8 8h1.5M12.7 8h1.5M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1"
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    id: "leaf",
    label: "자연·숲",
    keywords: "leaf nature 나뭇잎 자연 숲 계절 성장",
    category: "places",
    render: () => (
      <>
        <path d="M13.5 2.5C7.5 2.5 3 6 3 11.5c5.5 0 9-4.5 10.5-9z" strokeLinejoin="round" />
        <path d="M2.5 13.5L9 7" strokeLinecap="round" />
      </>
    ),
  },

  // ---------- 사물·기호 ----------
  {
    id: "star",
    label: "별·중요",
    keywords: "star favorite 별 중요 핵심 즐겨찾기",
    category: "objects",
    render: () => <path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" strokeLinejoin="round" />,
  },
  {
    id: "flag",
    label: "깃발·이정표",
    keywords: "flag milestone 깃발 목표 사건 전환점",
    category: "objects",
    render: () => <path d="M3.5 2v12M3.5 2.5h9l-2 3.2 2 3.3h-9" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    id: "tag",
    label: "태그·분류",
    keywords: "tag label 태그 이름표 분류 키워드",
    category: "objects",
    render: () => (
      <>
        <path d="M2 8.2V2.5h5.7l6.3 6.3-5.7 5.7z" strokeLinejoin="round" />
        <circle cx="5.2" cy="5.2" r="1" fill="currentColor" />
      </>
    ),
  },
  {
    id: "flame",
    label: "불꽃·절정·갈등",
    keywords: "flame fire 불꽃 갈등 위기 클라이맥스 액션",
    category: "objects",
    render: () => (
      <path
        d="M8.5 2c.5 2.5-1.5 3.8-1.5 5.8 0 1.2.9 2 2 2s2-1 2-2.6c1.5 1.1 2.2 2.6 2.2 4.1a5.2 5.2 0 1 1-10.4 0c0-2.6 1.8-4.7 5.7-9.3z"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: "bolt",
    label: "번개·충격·사건",
    keywords: "bolt lightning 번개 사건 반전 긴장 스포츠",
    category: "objects",
    render: () => <path d="M9 1.8L3.2 9h4.3L6.8 14.2 12.8 7H8.5z" strokeLinejoin="round" />,
  },
  {
    id: "key",
    label: "열쇠·단서·비밀",
    keywords: "key clue 열쇠 단서 떡밥 복선 비밀",
    category: "objects",
    render: () => (
      <>
        <circle cx="5.5" cy="8" r="3" />
        <path d="M8.5 8h6M12 8v2.2M14.2 8v2.2" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "lock",
    label: "자물쇠·잠금",
    keywords: "lock secret 자물쇠 비공개 미결",
    category: "objects",
    render: () => (
      <>
        <rect x="3" y="7" width="10" height="7" rx="1.2" />
        <path d="M5.2 7V5a2.8 2.8 0 0 1 5.6 0v2" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "clock",
    label: "시계·타임라인",
    keywords: "clock time 시계 시간 타임라인 연표 과거 현재",
    category: "objects",
    render: () => (
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.5V8l2.5 1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  {
    id: "trophy",
    label: "트로피·목표·승리",
    keywords: "trophy award 트로피 우승 경기 목표 대회",
    category: "objects",
    render: () => (
      <>
        <path d="M4.5 2.5h7v3.8a3.5 3.5 0 0 1-7 0zM4.5 4H2.3v1.5c0 1.4 1 2.5 2.2 2.5M11.5 4h2.2v1.5c0 1.4-1 2.5-2.2 2.5" strokeLinejoin="round" />
        <path d="M8 9.8v3M5.2 13.5h5.6" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "puzzlepiece",
    label: "퍼즐·구성 조각",
    keywords: "puzzle piece 퍼즐 떡밥 에피소드 조각",
    category: "objects",
    render: () => (
      <path
        d="M3 4.5h3.2a1.5 1.5 0 1 1 2.6 0H12v3.2a1.5 1.5 0 1 1 0 2.6V13H3V9.8a1.5 1.5 0 1 0 0-2.6z"
        strokeLinejoin="round"
      />
    ),
  },
  {
    id: "calendar",
    label: "달력·일정",
    keywords: "calendar schedule 달력 일정 날짜",
    category: "objects",
    render: () => (
      <>
        <rect x="2" y="3" width="12" height="11" rx="1.2" />
        <path d="M5 1.8v2.4M11 1.8v2.4M2 6.5h12" strokeLinecap="round" />
      </>
    ),
  },
  {
    id: "questionmark.circle",
    label: "물음표·미정·고민",
    keywords: "question mystery 물음표 미스테리 고민 질문",
    category: "objects",
    render: () => (
      <>
        <circle cx="8" cy="8" r="6" />
        <path d="M6.3 6.2a1.8 1.8 0 1 1 2.5 1.7c-.6.3-.8.7-.8 1.4" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.7" fill="currentColor" stroke="none" />
      </>
    ),
  },
];

// 이전 짧은 id("memo", "character", "synopsis", "clapper", "bulb", "pin", "box")와도 호환
const ALIAS_MAP: Record<string, string> = {
  memo: "doc.text",
  character: "person",
  synopsis: "book",
  structure: "rectangle.split.3x1",
  clapper: "clapperboard",
  bulb: "lightbulb",
  pin: "mappin",
  box: "archivebox",
};

const BY_ID = new Map(SF_SYMBOLS.map((s) => [s.id, s]));

export function resolveSymbol(type: ProjectNode["type"], icon?: string): SfSymbolDef {
  const raw = icon || type;
  const mapped = ALIAS_MAP[raw] ?? raw;
  return BY_ID.get(mapped) ?? BY_ID.get(ALIAS_MAP[type] ?? type) ?? SF_SYMBOLS[1];
}

export function SfSymbolIcon({ type, icon, open }: { type: ProjectNode["type"]; icon?: string; open?: boolean }) {
  const def = resolveSymbol(type, icon);
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      {def.render(open)}
    </svg>
  );
}

type DialogProps = {
  node: ProjectNode;
  x: number;
  y: number;
  onApply: (icon?: string) => void;
  onClose: () => void;
};

/** 우클릭 → '아이콘 변경…'을 눌렀을 때 뜨는 미니멀 SF 심볼 팝업창 */
export function IconPickerDialog({ node, x, y, onApply, onClose }: DialogProps) {
  const defaultSymbolId = resolveSymbol(node.type).id;
  const currentSymbolId = resolveSymbol(node.type, node.icon).id;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = (symbolId: string) => {
    onApply(symbolId === defaultSymbolId ? undefined : symbolId);
    onClose();
  };

  // 사이드바나 화면 가장자리에 잘리지 않도록 document.body에 띄우고 좌표를 화면 안으로 맞춘다.
  const popupWidth = 316;
  const popupHeight = 228;
  const left = typeof window !== "undefined" ? Math.max(12, Math.min(x, window.innerWidth - popupWidth - 12)) : x;
  const top = typeof window !== "undefined" ? Math.max(12, Math.min(y, window.innerHeight - popupHeight - 12)) : y;

  const content = (
    <div className="icon-popover-backdrop" onMouseDown={onClose}>
      <div
        className="icon-popover"
        role="dialog"
        aria-label="아이콘 변경"
        style={{ left, top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="icon-popover-grid" role="listbox" aria-label="SF 심볼 목록">
          {SF_SYMBOLS.map((s) => {
            const isSelected = currentSymbolId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                aria-label={s.label}
                className={isSelected ? "icon-popover-cell active" : "icon-popover-cell"}
                onClick={() => submit(s.id)}
              >
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                  {s.render(false)}
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : content;
}
