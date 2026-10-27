import { describe, expect, it } from "vitest";
import type { ScriptLine } from "../editor/lineStyles";
import { createProject, parseManifest, serializeManifest, walkDocs, type ProjectNode } from "../project/model";
import { folderNamed, insertNode, makeDoc, removeNode } from "../project/tree";
import { compareScripts, diffLines, diffText } from "./diff";
import { nextRevisionName, restoreSettings, settingsDocs } from "./revisions";

const S = (text: string): ScriptLine => ({ style: "scene", text });
const A = (text: string): ScriptLine => ({ style: "action", text });
const C = (text: string): ScriptLine => ({ style: "character", text });
const D = (text: string): ScriptLine => ({ style: "dialogue", text });

describe("원고 비교", () => {
  const before = [S("내부. 체육관 - 밤"), A("민재가 서 있다."), C("민재"), D("딱 한 번만 더."), S("외부. 골목 - 밤"), A("비가 온다."), S("내부. 집 - 낮"), A("조용하다.")];

  it("같은 원고는 바뀐 곳이 없다", () => {
    const result = compareScripts(before, before);
    expect([result.addedScenes, result.removedScenes, result.changedScenes]).toEqual([0, 0, 0]);
  });

  it("씬 추가, 삭제, 대사 변경을 씬 단위로 찾는다", () => {
    const after = [
      S("S#1. 내부. 체육관 - 밤"), // 번호를 직접 써도 같은 씬
      A("민재가 서 있다."),
      C("민재"),
      D("이번엔 진짜 마지막이야."),
      S("내부. 라커룸 - 밤"),
      A("새로 넣은 씬."),
      S("내부. 집 - 낮"),
      A("조용하다."),
    ];
    const result = compareScripts(before, after);
    expect(result.scenes.map((s) => `${s.kind}:${s.heading}`)).toEqual([
      "changed:S#1. 내부. 체육관 - 밤",
      "removed:외부. 골목 - 밤",
      "added:내부. 라커룸 - 밤",
      "same:내부. 집 - 낮",
    ]);
    expect([result.addedScenes, result.removedScenes, result.changedScenes]).toEqual([1, 1, 1]);
  });

  it("같은 장소 씬이 여러 개일 때 앞쪽 씬을 지워도 뒤쪽 씬이 어긋나지 않는다", () => {
    const multi = [
      S("내부. 체육관 - 낮"),
      A("첫 체육관."),
      S("외부. 골목 - 밤"),
      A("첫 골목."),
      S("내부. 집 - 낮"),
      A("집."),
      S("외부. 골목 - 밤"),
      A("두 번째 골목."),
    ];
    // 2씬(첫 골목)만 지운 원고
    const afterDelete = [
      S("내부. 체육관 - 낮"),
      A("첫 체육관."),
      S("내부. 집 - 낮"),
      A("집."),
      S("외부. 골목 - 밤"),
      A("두 번째 골목."),
    ];
    const result = compareScripts(multi, afterDelete);
    expect(result.scenes.map((s) => `${s.kind}:S#${s.number}:${s.heading}`)).toEqual([
      "same:S#1:내부. 체육관 - 낮",
      "removed:S#2:외부. 골목 - 밤",
      "same:S#2:내부. 집 - 낮",
      "same:S#3:외부. 골목 - 밤",
    ]);
  });

  it("씬헤딩을 고쳐도 본문이 같으면 한 씬으로 묶어 1씬이 두 개로 나뉘지 않는다", () => {
    const editedHeading = [
      S("내부. 체육관 - 새벽"), // 밤 → 새벽으로 수정
      A("민재가 서 있다."),
      C("민재"),
      D("딱 한 번만 더."),
      S("외부. 골목 - 밤"),
      A("비가 온다."),
      S("내부. 집 - 낮"),
      A("조용하다."),
    ];
    const result = compareScripts(before, editedHeading);
    expect(result.scenes.map((s) => `${s.kind}:S#${s.number}:${s.heading}`)).toEqual([
      "changed:S#1:내부. 체육관 - 새벽",
      "same:S#2:외부. 골목 - 밤",
      "same:S#3:내부. 집 - 낮",
    ]);
  });

  it("줄 비교는 가운데에 끼운 줄만 추가로 본다", () => {
    const ops = diffLines([A("하나"), A("셋")], [A("하나"), A("둘"), A("셋")]);
    expect(ops.map((o) => o.kind)).toEqual(["same", "add", "same"]);
  });

  it("일반 글도 줄 단위로 비교한다", () => {
    const ops = diffText("# 민재\n- 나이: 34", "# 민재\n- 나이: 35");
    expect(ops.map((o) => `${o.kind}:${o.line.text}`)).toEqual(["same:# 민재", "del:- 나이: 34", "add:- 나이: 35"]);
  });

  it("바뀐 곳을 새 원고의 줄 위에 표시한다 (새 줄, 고친 줄, 지운 줄)", () => {
    const after = [
      S("내부. 체육관 - 밤"), // 0
      A("민재가 서 있다."), // 1
      C("민재"), // 2
      D("이번엔 진짜 마지막이야."), // 3 고친 줄
      S("내부. 라커룸 - 밤"), // 4 새 씬 (골목 씬은 지움)
      A("새로 넣은 씬."), // 5
      S("내부. 집 - 낮"), // 6
    ]; // 마지막 "조용하다."는 지움
    const { marks, scenes } = compareScripts(before, after);
    expect(marks.get(3)).toMatchObject({ kind: "changed", before: [D("딱 한 번만 더.")] });
    // 지운 골목 씬은 그 다음 줄(라커룸 씬헤딩) 앞에 표시. 라커룸 씬은 새 씬
    expect(marks.get(4)?.kind).toBe("added");
    expect(marks.get(4)?.removed?.map((l) => l.text)).toEqual(["외부. 골목 - 밤", "비가 온다."]);
    expect(marks.get(5)?.kind).toBe("added");
    // 원고 맨 끝에서 지운 줄은 마지막 줄 뒤에
    expect(marks.get(6)).toMatchObject({ atEnd: true, removed: [A("조용하다.")] });
    expect([0, 1, 2].some((i) => marks.has(i))).toBe(false);
    // 씬마다 놓인 자리 (지운 씬은 지운 자리)
    expect(scenes.map((s) => s.anchor)).toEqual([0, 4, 4, 6]);
  });
});

describe("수정고에 함께 넣는 설정 문서", () => {
  function project() {
    const { manifest } = createProject("드롭킥");
    let tree = manifest.tree;
    const add = (folder: string, type: "memo" | "character", name: string) => {
      const parent = folderNamed(tree, folder);
      const doc = { ...makeDoc(tree, type, parent), name };
      tree = insertNode(tree, doc, parent);
      return doc;
    };
    const logline = add("개요", "memo", "로그라인");
    const minjae = add("인물 설정", "character", "민재");
    const memo = add("메모", "memo", "아이디어");
    return { tree, ids: { logline: logline.id, minjae: minjae.id, memo: memo.id } };
  }

  it("개요·인물 설정 폴더의 문서와 인물 설정은 넣고, 메모·기타는 넣지 않는다", () => {
    const { tree } = project();
    expect(settingsDocs(tree).map((d) => `${d.folders.join("/")}/${d.doc.name}`)).toEqual(["개요/로그라인", "인물 설정/민재"]);
  });

  it("되돌리면 지운 설정 문서는 원래 폴더에 다시 생기고, 메모는 그대로", () => {
    const { tree, ids } = project();
    const snapshot = settingsDocs(tree).map(({ doc, folders }) => ({
      doc: { id: doc.id, type: doc.type, name: doc.name, folders },
      text: `${doc.name} (고 때 내용)`,
    }));
    // 고 이후: 민재를 지우고, 로그라인을 고쳤다
    const removed = removeNode(tree, ids.minjae).tree;
    const texts = new Map([
      [ids.logline, "고친 로그라인"],
      [ids.memo, "메모 내용"],
    ]);
    const restored = restoreSettings(removed, texts, snapshot);
    const names = walkDocs(restored.tree).map((d) => d.name);
    expect(names).toContain("민재");
    expect(restored.texts.get(ids.minjae)).toBe("민재 (고 때 내용)");
    expect(restored.texts.get(ids.logline)).toBe("로그라인 (고 때 내용)");
    expect(restored.texts.get(ids.memo)).toBe("메모 내용");
    const people = restored.tree.find((n) => n.name === "인물 설정") as Extract<ProjectNode, { type: "folder" }>;
    expect(people.children.map((n) => n.name)).toEqual(["민재"]);
  });

  it("다음 고 이름은 가장 큰 번호 + 1", () => {
    expect(nextRevisionName([])).toBe("1고");
    const meta = (name: string) => ({ id: name, name, note: "", createdAt: "", dir: ".dropkick-revisions/x" });
    expect(nextRevisionName([meta("1고"), meta("3고 (투자용)"), meta("되돌리기 전")])).toBe("4고");
  });

  it("수정고 목록은 project.json에 저장되고, 위험한 경로는 버린다", () => {
    const { manifest } = createProject("드롭킥");
    const withRevisions = {
      ...manifest,
      revisions: [
        { id: "r1", name: "1고", note: "첫 고", createdAt: "2026-10-25T05:00:00.000Z", dir: ".dropkick-revisions/2026-10-25 14-00-00 1고" },
        { id: "bad", name: "나쁜", note: "", createdAt: "x", dir: "../밖" },
      ],
    };
    const parsed = parseManifest(serializeManifest(withRevisions));
    expect(parsed.revisions?.map((r) => r.id)).toEqual(["r1"]);
  });
});
