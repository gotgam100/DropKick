import { describe, expect, it } from "vitest";
import { fromFountain } from "../fountain/fountain";
import {
  SAMPLE_KOREAN_SCRIPT_FOUNTAIN,
  SAMPLE_KOREAN_SCRIPT_TITLE,
} from "./sampleScript";
import { GUIDE_SEEN_KEY } from "./ScreenplayGuideDialog";

describe("예시 스크립트", () => {
  it("Fountain 파서로 정상 구문 분석된다", () => {
    const doc = fromFountain(SAMPLE_KOREAN_SCRIPT_FOUNTAIN);
    expect(doc.titlePage).toContain(SAMPLE_KOREAN_SCRIPT_TITLE);
    expect(doc.lines.length).toBeGreaterThan(10);
  });

  it("7대 줄 스타일(씬헤딩, 액션, 인물, 괄호지문, 대사, 서브헤더, 전환)이 모두 포함된다", () => {
    const doc = fromFountain(SAMPLE_KOREAN_SCRIPT_FOUNTAIN);
    const styles = new Set(doc.lines.map((l) => l.style));

    expect(styles.has("scene")).toBe(true);
    expect(styles.has("action")).toBe(true);
    expect(styles.has("character")).toBe(true);
    expect(styles.has("parenthetical")).toBe(true);
    expect(styles.has("dialogue")).toBe(true);
    expect(styles.has("subheader")).toBe(true);
    expect(styles.has("transition")).toBe(true);
  });

  it("서브헤더가 올바르게 파싱되고 그 아래 액션 줄들이 대사 없이 이어진다", () => {
    const doc = fromFountain(SAMPLE_KOREAN_SCRIPT_FOUNTAIN);
    const subheaderIndex = doc.lines.findIndex((l) => l.style === "subheader");
    expect(subheaderIndex).toBeGreaterThan(0);
    expect(doc.lines[subheaderIndex].text).toBe("회상. 단편영화 <은행강도의 최후> 촬영장");

    // 서브헤더 바로 아래는 액션 줄
    expect(doc.lines[subheaderIndex + 1].style).toBe("action");
    expect(doc.lines[subheaderIndex + 1].text).toContain("슬레이트");
  });

  it("씬헤딩 4개로 이루어진 전문이다", () => {
    const doc = fromFountain(SAMPLE_KOREAN_SCRIPT_FOUNTAIN);
    const scenes = doc.lines.filter((l) => l.style === "scene");
    expect(scenes.length).toBe(4);
  });

  it("가이드 키 상수가 정의되어 있다", () => {
    expect(GUIDE_SEEN_KEY).toBe("dropkick.guide.seen.v1");
  });
});
