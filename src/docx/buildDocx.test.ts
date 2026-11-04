import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildDocx } from "./buildDocx";
import { buildExtraSection } from "../export/extras";
import { createDefaultStructureBoard, serializeStructureBoard } from "../structure/structureModel";
import type { ScriptDocument } from "../fountain/fountain";

describe("Word (.docx) 내보내기", () => {
  it("시나리오를 docx 바이너리로 정상 생성한다", async () => {
    const doc: ScriptDocument = {
      titlePage: "Title: 테스트 영화\nAuthor: 홍길동\nDraft date: 2026-10-30",
      lines: [
        { style: "scene", text: "내부. 회의실 - 낮" },
        { style: "action", text: "민재가 의자에 앉아 있다." },
        { style: "character", text: "민재" },
        { style: "parenthetical", text: "한숨 쉬며" },
        { style: "dialogue", text: "정말 그렇게 될까?" },
        { style: "transition", text: "CUT TO:" },
      ],
    };

    const uint8 = await buildDocx(doc);
    expect(uint8).toBeDefined();
    expect(uint8.byteLength).toBeGreaterThan(1000); // 정상 zip/docx 파일 크기

    // docx 파일은 표준 zip 시그니처 (0x50, 0x4B, 0x03, 0x04 = PK..)로 시작해야 함
    expect(uint8[0]).toBe(0x50);
    expect(uint8[1]).toBe(0x4b);
  });

  it("부록(문서, 3막 구조 표)만으로도 docx를 만든다", async () => {
    const extras = [
      buildExtraSection("memo", "메모", "# 제목\n- 하나\n문단"),
      buildExtraSection("structure", "구조", serializeStructureBoard(createDefaultStructureBoard())),
    ];
    const bytes = await buildDocx(null, extras);
    expect(bytes[0]).toBe(0x50);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("막·장·씬 요약 줄은 Word 원고에 들어가지 않는다", async () => {
    const doc: ScriptDocument = {
      titlePage: null,
      lines: [
        { style: "act", text: "비밀막이름" },
        { style: "chapter", text: "비밀장이름" },
        { style: "scene", text: "내부. 회의실 - 낮" },
        { style: "synopsis", text: "비밀요약글" },
        { style: "action", text: "민재가 앉아 있다." },
      ],
    };
    const xml = strFromU8(unzipSync(await buildDocx(doc))["word/document.xml"]);
    expect(xml).toContain("민재가 앉아 있다.");
    for (const secret of ["비밀막이름", "비밀장이름", "비밀요약글"]) expect(xml).not.toContain(secret);
  });

  it("스크립트 설정에서 켜면 막·장·씬 요약이 Word 원고에 들어간다", async () => {
    const lines: ScriptDocument["lines"] = [
      { style: "act", text: "비밀막이름" },
      { style: "chapter", text: "비밀장이름" },
      { style: "scene", text: "내부. 회의실 - 낮" },
      { style: "synopsis", text: "비밀요약글" },
      { style: "action", text: "민재가 앉아 있다." },
    ];
    const read = async (printOutline: ScriptDocument["printOutline"]) =>
      strFromU8(unzipSync(await buildDocx({ titlePage: null, lines, printOutline }))["word/document.xml"]);
    const onlySections = await read({ sections: true });
    expect(onlySections).toContain("비밀막이름");
    expect(onlySections).toContain("비밀장이름");
    expect(onlySections).not.toContain("비밀요약글");
    const onlySynopsis = await read({ synopsis: true });
    expect(onlySynopsis).toContain("비밀요약글");
    expect(onlySynopsis).not.toContain("비밀막이름");
  });

  it("글자 꾸밈 기호는 빼고 굵게·기울임·밑줄을 입히고, >끝<은 가운데 정렬한다", async () => {
    const lines: ScriptDocument["lines"] = [
      { style: "action", text: "**굵은글** *기운글* _밑줄글_" },
      { style: "action", text: ">끝<" },
    ];
    const xml = strFromU8(unzipSync(await buildDocx({ titlePage: null, lines }))["word/document.xml"]);
    expect(xml).toContain("굵은글");
    expect(xml).not.toContain("**");
    expect(xml).not.toContain("&gt;끝&lt;");
    expect(xml).toContain("<w:i/>");
    expect(xml).toContain("<w:u ");
    expect(xml).toContain('w:val="center"');
  });
});
