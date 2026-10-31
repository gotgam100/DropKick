import { describe, expect, it } from "vitest";
import type { SceneSummary } from "../analysis/analyze";
import { planFiles } from "../project/tree";
import {
  SAVE_THE_CAT_BEATS,
  createCustomBeatCard,
  createDefaultStructureBoard,
  makeSceneRef,
  parseStructureBoard,
  resolveSceneRef,
  serializeStructureBoard,
} from "./structureModel";

function mockScene(
  number: number,
  heading: string,
  text: string,
  page = 1,
  eighths = 4,
): SceneSummary {
  return {
    line: number * 5,
    number,
    heading: `S#${number}. ${heading}`,
    eighths,
    page,
    characters: [],
    speeches: 0,
    text,
  };
}

describe("3막 구조 보드 (Save the Cat 15단계)", () => {
  it("세이브 더 캣 15단계 기본 카드가 1막(5)·2막(7)·3막(3)으로 생성되며 구성점 명칭이 반영된다", () => {
    const board = createDefaultStructureBoard();
    expect(board.beats).toHaveLength(15);
    expect(SAVE_THE_CAT_BEATS.filter((b) => b.act === 1)).toHaveLength(5);
    expect(SAVE_THE_CAT_BEATS.filter((b) => b.act === 2)).toHaveLength(7);
    expect(SAVE_THE_CAT_BEATS.filter((b) => b.act === 3)).toHaveLength(3);
    expect(board.beats[0].title).toBe("오프닝 이미지");
    expect(board.beats[4].title).toBe("토론(구성점1)");
    expect(board.beats[8].title).toBe("중간점");
    expect(board.beats[9].title).toBe("악당이 다가오다");
    expect(board.beats[11].title).toBe("영혼의 어두운 밤(구성점2)");
    expect(board.beats[14].title).toBe("마지막 이미지");
  });

  it("카드 명칭 커스텀 수정, 여러 줄 시놉시스, 복수 씬 등록, 카드 추가·삭제를 저장하고 복원한다", () => {
    const board = createDefaultStructureBoard();
    const s1 = mockScene(1, "내부. 복싱 체육관 - 밤", "민재가 홀로 샌드백을 친다.");
    const s2 = mockScene(2, "외부. 골목길 - 밤", "민재가 빗속을 걸어간다.");

    board.beats[0].title = "프롤로그 (커스텀 제목)";
    board.beats[0].synopsis = "첫째 줄\n둘째 줄\n셋째 줄\n넷째 줄 (스크롤 확인용)";
    board.beats[0].scenes = [makeSceneRef(s1), makeSceneRef(s2)];

    // 1막에서 카드 1개 삭제하고, 2막에 커스텀 카드 1개 추가
    board.beats.splice(1, 1);
    const customCard = createCustomBeatCard(2, "서브플롯 위기");
    board.beats.push(customCard);

    const raw = serializeStructureBoard(board);
    const loaded = parseStructureBoard(raw);

    expect(loaded.beats).toHaveLength(15);
    expect(loaded.beats[0].title).toBe("프롤로그 (커스텀 제목)");
    expect(loaded.beats[0].synopsis.split("\n")).toHaveLength(4);
    expect(loaded.beats[0].scenes).toHaveLength(2);
    expect(loaded.beats.some((b) => b.title === "서브플롯 위기" && b.act === 2)).toBe(true);
  });

  it("앞에 새 씬이 추가되어 씬 번호가 밀려도 등록된 씬을 정확히 추적한다", () => {
    const originalScene = mockScene(3, "내부. 병원 복도 - 낮", "의사가 차트를 들고 나온다.");
    const ref = makeSceneRef(originalScene);

    // 앞에 씬 2개가 추가되어 S#3이 S#5로 밀린 상황
    const updatedScenes = [
      mockScene(1, "외부. 서울역 - 아침", "기차가 도착한다."),
      mockScene(2, "내부. 택시 안 - 아침", "민재가 창밖을 본다."),
      mockScene(5, "내부. 병원 복도 - 낮", "의사가 차트를 들고 나온다."),
    ];

    const resolved = resolveSceneRef(ref, updatedScenes);
    expect(resolved).not.toBeNull();
    expect(resolved?.number).toBe(5);
  });

  it(".beats 파일 확장자 매핑이 올바르게 동작한다", () => {
    const tree = planFiles([
      { id: "d1", type: "structure", name: "3막 구조", file: "" },
    ]);
    expect(tree[0].type === "structure" && tree[0].file).toBe("3막 구조.beats");
  });
});
