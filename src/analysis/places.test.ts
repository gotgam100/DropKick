import { describe, expect, it } from "vitest";
import type { SceneSummary } from "./analyze";
import { countPlaces, groupScenesByPlace, knownPlaces, knownTimes, parseHeading, placeKeyOf, placeOf } from "./places";

const scene = (line: number, number: number, heading: string): SceneSummary => ({
  line,
  number,
  heading,
  page: 1,
  eighths: 1,
  characters: [],
  speeches: 0,
  text: "",
});

describe("장소 뽑기", () => {
  it("내부·외부와 시간대를 뗀다", () => {
    expect(placeOf("#3. 내부. 체육관 - 밤")).toBe("체육관");
    expect(placeOf("S#2. 외부. 골목 - 낮")).toBe("골목");
    expect(placeOf("INT. GYM - NIGHT")).toBe("GYM");
    expect(placeOf("체육관")).toBe("체육관");
    expect(placeOf("#1. 내부. 관장의 사무실 - 밤")).toBe("관장의 사무실");
  });
});

describe("장소별 씬 묶기", () => {
  const scenes = [
    scene(1, 1, "#1. 내부. 체육관 - 밤"),
    scene(5, 2, "#2. 외부. 골목 - 낮"),
    scene(9, 3, "#3. 내부. 체육관 - 낮"),
    scene(12, 4, "#4. 실내. 체육관 - 새벽"),
  ];
  it("씬이 많은 장소부터 묶는다", () => {
    const groups = groupScenesByPlace(scenes);
    expect(groups.map((g) => [g.place, g.scenes.map((s) => s.number)])).toEqual([
      ["체육관", [1, 3, 4]],
      ["골목", [2]],
    ]);
    expect(groups[0].scenes[0].heading).toBe("내부. 체육관 - 밤");
  });
});

describe("씬헤딩 자동 완성용 분해", () => {
  it("앞부분, 장소, 시간대로 나눈다", () => {
    expect(parseHeading("내부. 체육관 - 밤")).toEqual({ prefix: "내부. ", place: "체육관", time: "밤" });
    expect(parseHeading("외부. 체")).toEqual({ prefix: "외부. ", place: "체", time: null });
    expect(parseHeading("체육")).toEqual({ prefix: "", place: "체육", time: null });
    expect(parseHeading("내부. 체육관 - ")).toEqual({ prefix: "내부. ", place: "체육관", time: "" });
  });

  const headings = ["내부. 체육관 - 밤", "외부. 골목 - 낮", "외부. 체육관 - 낮", "내부. 사무실 - 밤"];
  it("장소는 내부·외부와 상관없이 합치고 자주 쓴 것부터", () => {
    expect(knownPlaces(headings)).toEqual(["체육관", "사무실", "골목"]);
  });
  it("시간대는 같은 장소에서 쓴 것을 먼저", () => {
    expect(knownTimes(headings, "골목")).toEqual(["낮", "밤"]);
    expect(knownTimes(headings, "사무실")).toEqual(["밤", "낮"]);
  });
});

describe("시간대를 아직 안 쓴 씬헤딩", () => {
  it("끝의 ' -'는 장소에 붙지 않는다", () => {
    expect(placeOf("#1. 외부. 체육관 -")).toBe("체육관");
    expect(parseHeading("외부. 체육관 -")).toEqual({ prefix: "외부. ", place: "체육관", time: "" });
  });
});

describe("장소 수 세기", () => {
  it('"실내. 장소명"까지만 같으면 같은 장소다 (세부장소와 시간대는 달라도 된다)', () => {
    const scenes = [
      scene(1, 1, "#1. 실내. 병원. 로비 - 낮"),
      scene(5, 2, "#2. 실내. 병원. 응급실 - 밤"),
      scene(9, 3, "#3. 실내. 병원 - 새벽"),
      scene(12, 4, "#4. 실내. 카페 - 낮"),
    ];
    expect(countPlaces(scenes)).toBe(2);
  });

  it("안과 밖은 다른 장소로 센다", () => {
    const scenes = [scene(1, 1, "#1. 내부. 병원 - 낮"), scene(5, 2, "#2. 외부. 병원 - 낮")];
    expect(countPlaces(scenes)).toBe(2);
  });

  it("같은 뜻의 표기(내부·실내·INT)는 같은 것으로 본다", () => {
    const scenes = [scene(1, 1, "#1. 내부. 병원 - 낮"), scene(5, 2, "#2. 실내. 병원 - 밤"), scene(9, 3, "#3. INT. 병원 - 낮")];
    expect(countPlaces(scenes)).toBe(1);
  });

  it("영문은 대소문자를 가리지 않고, 띄어쓰기 차이는 무시한다", () => {
    expect(placeKeyOf("#1. INT. City  Hall. 로비 - DAY")).toBe(placeKeyOf("#9. int. city hall - NIGHT"));
  });

  it("씬 번호가 없는 앞부분과 장소 없는 씬은 세지 않는다", () => {
    const scenes = [scene(0, 0, "#0. 내부. 어딘가 - 낮"), scene(3, 1, "(장소 없음)"), scene(8, 2, "#2. 내부. 병원 - 낮")];
    expect(countPlaces(scenes)).toBe(1);
  });

  it("안팎 표기가 없으면 장소 이름만으로 센다", () => {
    expect(countPlaces([scene(1, 1, "#1. 체육관 - 낮"), scene(4, 2, "#2. 체육관. 탈의실 - 밤")])).toBe(1);
  });
});
