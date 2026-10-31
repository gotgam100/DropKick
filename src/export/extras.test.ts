import { describe, expect, it } from "vitest";
import { createDefaultStructureBoard, serializeStructureBoard } from "../structure/structureModel";
import { buildExtraSection, markdownToBlocks, structureToBlocks } from "./extras";

describe("일반 문서 → 내보내기 조각", () => {
  it("제목, 목록, 문단을 나누고 꾸밈 기호를 걷어 낸다", () => {
    const blocks = markdownToBlocks("# 민재\n\n**서른 살** 형사.\n둘째 줄\n\n## 특징\n- 말이 *적다*\n- 왼손잡이");
    expect(blocks).toEqual([
      { kind: "heading", level: 2, text: "민재" },
      { kind: "paragraph", text: "서른 살 형사.\n둘째 줄" },
      { kind: "heading", level: 3, text: "특징" },
      { kind: "bullet", text: "말이 적다" },
      { kind: "bullet", text: "왼손잡이" },
    ]);
  });

  it("빈 문서는 조각이 없다", () => {
    expect(markdownToBlocks("  \n\n")).toEqual([]);
  });
});

describe("3막 구조 → 표", () => {
  const board = createDefaultStructureBoard();
  board.beats[0].synopsis = "체육관에서 혼자 연습한다";
  board.beats[0].scenes = [{ key: "k", sceneNumber: 1, heading: "내부. 체육관 - 밤", snippet: "" }];
  const text = serializeStructureBoard(board);

  it("막마다 제목과 표를 만들고(등록한 씬은 빼고), 15단계가 모두 들어간다", () => {
    const blocks = structureToBlocks(text);
    expect(blocks.filter((b) => b.kind === "heading")).toHaveLength(3);
    const tables = blocks.filter((b) => b.kind === "table");
    expect(tables).toHaveLength(3);
    const rows = tables.flatMap((t) => (t.kind === "table" ? t.rows : []));
    expect(rows).toHaveLength(15);
    expect(rows[0]).toEqual(["1", "오프닝 이미지", "체육관에서 혼자 연습한다"]);
    expect(rows[14][0]).toBe("15");
  });

  it("문서 종류에 맞게 변환한다", () => {
    expect(buildExtraSection("structure", "구조", text).blocks[0]).toMatchObject({ kind: "heading" });
    expect(buildExtraSection("memo", "메모", "안녕").blocks).toEqual([{ kind: "paragraph", text: "안녕" }]);
    expect(buildExtraSection("memo", "민재", "# 민재\n본문").blocks).toEqual([{ kind: "paragraph", text: "본문" }]);
  });
});
