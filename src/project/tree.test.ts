import { describe, expect, it } from "vitest";
import { createProject, walkDocs, type ProjectNode } from "./model";
import {
  defaultParentFor,
  findNode,
  insertNode,
  makeDoc,
  makeFolder,
  moveNode,
  planFiles,
  removeNode,
  renameNode,
} from "./tree";

function names(tree: ProjectNode[]): unknown[] {
  return tree.map((n) => (n.type === "folder" ? { [n.name]: names(n.children) } : n.name));
}

function sample() {
  const { manifest } = createProject("드롭킥");
  let tree = manifest.tree;
  const people = defaultParentFor(tree, "character")!;
  const memos = defaultParentFor(tree, "memo")!;
  const minjae = { ...makeDoc(tree, "character", people), name: "민재" };
  tree = insertNode(tree, minjae, people);
  const sua = { ...makeDoc(tree, "character", people), name: "수아" };
  tree = insertNode(tree, sua, people);
  const idea = makeDoc(tree, "memo", memos);
  tree = insertNode(tree, idea, memos);
  return { tree, ids: { people, memos, minjae: minjae.id, sua: sua.id, idea: idea.id, script: manifest.mainScript } };
}

describe("트리 편집", () => {
  it("인물 설정은 인물 폴더, 메모는 메모 폴더에 들어간다", () => {
    const { tree } = sample();
    expect(names(tree)).toEqual(["시나리오", "시놉시스", { 인물: ["민재", "수아"] }, { 메모: ["새 메모"] }]);
  });

  it("같은 폴더에서 이름이 겹치지 않게 번호를 붙인다", () => {
    const { tree, ids } = sample();
    const doc2 = makeDoc(tree, "memo", ids.memos);
    expect(doc2.name).toBe("새 메모 2");
    expect(makeFolder(tree, null).name).toBe("새 폴더");
    expect(renameNode(tree, ids.sua, "민재").length).toBe(tree.length);
    expect(findNode(renameNode(tree, ids.sua, "민재"), ids.sua)?.name).toBe("민재 2");
  });

  it("빈 이름으로는 바꾸지 않는다", () => {
    const { tree, ids } = sample();
    expect(findNode(renameNode(tree, ids.minjae, "   "), ids.minjae)?.name).toBe("민재");
  });

  it("폴더를 지우면 안의 문서들도 함께 지워졌다고 알려 준다", () => {
    const { tree, ids } = sample();
    const result = removeNode(tree, ids.people);
    expect(result.removed.map((d) => d.name)).toEqual(["민재", "수아"]);
    expect(names(result.tree)).toEqual(["시나리오", "시놉시스", { 메모: ["새 메모"] }]);
  });

  it("끌어서 다른 폴더 안으로, 다른 문서 앞뒤로 옮긴다", () => {
    const { tree, ids } = sample();
    let next = moveNode(tree, ids.idea, ids.people, "inside");
    expect(names(next)).toEqual(["시나리오", "시놉시스", { 인물: ["민재", "수아", "새 메모"] }, { 메모: [] }]);
    next = moveNode(next, ids.sua, ids.script, "before");
    expect(names(next)).toEqual(["수아", "시나리오", "시놉시스", { 인물: ["민재", "새 메모"] }, { 메모: [] }]);
    next = moveNode(next, ids.minjae, ids.idea, "after");
    expect(names(next)).toEqual(["수아", "시나리오", "시놉시스", { 인물: ["새 메모", "민재"] }, { 메모: [] }]);
  });

  it("폴더를 자기 안으로는 옮길 수 없고, 문서 안으로도 넣을 수 없다", () => {
    const { tree, ids } = sample();
    let next = insertNode(tree, { id: "inner", type: "folder", name: "속", children: [] }, ids.people);
    expect(moveNode(next, ids.people, "inner", "inside")).toBe(next);
    expect(moveNode(next, ids.memos, ids.minjae, "inside")).toBe(next);
    next = moveNode(next, ids.people, ids.people, "inside");
    expect(names(next)[2]).toEqual({ 인물: ["민재", "수아", { 속: [] }] });
  });
});

describe("저장할 파일 경로", () => {
  it("트리 모양과 이름 그대로 파일 경로를 정한다", () => {
    const { tree, ids } = sample();
    let next = renameNode(tree, ids.idea, "아이디어");
    next = renameNode(next, ids.people, "등장인물");
    const files = walkDocs(planFiles(next)).map((d) => d.file);
    expect(files).toEqual([
      "시나리오.fountain",
      "시놉시스.md",
      "등장인물/민재.md",
      "등장인물/수아.md",
      "메모/아이디어.md",
    ]);
  });

  it("파일 이름으로 못 쓰는 글자는 바꾸고, 겹치면 번호를 붙인다", () => {
    const tree: ProjectNode[] = [
      { id: "a", type: "memo", name: "A/B: 메모", file: "" },
      { id: "b", type: "memo", name: "A-B- 메모", file: "" },
    ];
    expect(walkDocs(planFiles(tree)).map((d) => d.file)).toEqual(["A-B- 메모.md", "A-B- 메모 2.md"]);
  });
});
