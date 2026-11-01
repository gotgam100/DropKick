import { describe, expect, it } from "vitest";
import type { ScriptNote } from "../editor/notes";
import { createProject, parseManifest, serializeManifest, walkDocs, type DocNode, type FolderNode, type ProjectManifest, type ProjectNode } from "./model";
import { loadProject, saveProject, type ProjectFs } from "./projectIO";
import { findNameConflict, insertNode, makeDivider, makeDoc, moveNode, planFiles, removeNode, renameNode, uniqueName } from "./tree";
import {
  canScope,
  clearScope,
  hiddenIdsFor,
  inheritedScope,
  mergeNotes,
  notesOfScript,
  revisionsOfScript,
  setNodeScope,
  visibleDocsFor,
  visibleTreeFor,
} from "./scripts";

const doc = (id: string, type: DocNode["type"], scriptId?: string): DocNode => ({
  id,
  type,
  name: id,
  file: `${id}.md`,
  ...(scriptId ? { scriptId } : {}),
});
const folder = (id: string, children: ProjectNode[], scriptId?: string): FolderNode => ({
  id,
  type: "folder",
  name: id,
  children,
  ...(scriptId ? { scriptId } : {}),
});

const tree: ProjectNode[] = [
  doc("s1", "script"),
  doc("s2", "script"),
  folder("인물", [doc("민재", "character"), doc("영남", "character", "s2")]),
  folder("1화 자료", [doc("메모1", "memo"), doc("메모2", "memo")], "s1"),
  doc("3막", "structure", "s2"),
];

describe("스크립트별 보이는 문서", () => {
  it("활성 스크립트의 전용 문서와 공통 문서만 보인다", () => {
    const { tree: shown, hidden } = visibleTreeFor(tree, "s1");
    const names = JSON.stringify(shown);
    expect(names).toContain("민재");
    expect(names).toContain("메모1");
    expect(names).not.toContain("영남");
    expect(names).not.toContain("3막");
    expect(hidden).toBe(2);
  });

  it("다른 스크립트로 바꾸면 보이는 문서도 바뀐다", () => {
    const { tree: shown, hidden } = visibleTreeFor(tree, "s2");
    const names = JSON.stringify(shown);
    expect(names).toContain("영남");
    expect(names).toContain("3막");
    expect(names).not.toContain("메모1");
    expect(hidden).toBe(2);
  });

  it("스크립트 문서는 항상 보이고, 가려진 항목 id를 알려 준다", () => {
    expect([...hiddenIdsFor(tree, "s1")].sort()).toEqual(["3막", "영남"]);
    expect([...hiddenIdsFor(tree, "s2")].sort()).toEqual(["1화 자료", "메모1", "메모2"]);
    expect(JSON.stringify(visibleTreeFor(tree, "s1").tree)).toContain('"s2"');
  });

  it("스크립트를 뺀 보이는 문서 목록", () => {
    expect(visibleDocsFor(tree, "s1").map((d) => d.id)).toEqual(["민재", "메모1", "메모2"]);
  });

  it("스크립트가 들어 있는 폴더에는 전용 표시를 못 한다", () => {
    const withScript = folder("에피소드", [doc("s3", "script")], "s1");
    expect(canScope(withScript)).toBe(false);
    expect(visibleTreeFor([withScript], "s2").tree).toHaveLength(1);
    expect(canScope(doc("메모", "memo"))).toBe(true);
    expect(canScope(doc("s1", "script"))).toBe(false);
  });
});

describe("전용 스크립트 정하기", () => {
  it("전용으로 정했다가 공통으로 되돌린다", () => {
    const scoped = setNodeScope(tree, "민재", "s2");
    const folderNode = scoped.find((n) => n.id === "인물") as FolderNode;
    expect((folderNode.children[0] as DocNode).scriptId).toBe("s2");
    const common = setNodeScope(scoped, "민재");
    const back = (common.find((n) => n.id === "인물") as FolderNode).children[0] as DocNode;
    expect(back.scriptId).toBeUndefined();
    expect("scriptId" in back).toBe(false);
  });

  it("폴더를 전용으로 정하면 안의 문서와 폴더도 모두 따라가고, 공통으로 되돌리면 함께 풀린다", () => {
    const nested: ProjectNode[] = [
      doc("s1", "script"),
      doc("s2", "script"),
      folder("자료", [doc("a", "memo"), folder("하위", [doc("b", "memo", "s1")])]),
    ];
    const scoped = setNodeScope(nested, "자료", "s2");
    expect(JSON.stringify(scoped).match(/"scriptId":"s2"/g)).toHaveLength(4);
    expect(JSON.stringify(scoped)).not.toContain('"scriptId":"s1"');
    expect(JSON.stringify(setNodeScope(scoped, "자료"))).not.toContain("scriptId");
  });

  it("전용 폴더 안에 만든 문서는 그 폴더의 스크립트를 물려받는다", () => {
    const nested: ProjectNode[] = [doc("s1", "script"), folder("자료", [folder("하위", [])], "s2"), folder("공통", [])];
    expect(inheritedScope(nested, "하위")).toBe("s2");
    expect(inheritedScope(nested, "자료")).toBe("s2");
    expect(inheritedScope(nested, "공통")).toBeUndefined();
    expect(inheritedScope(nested, null)).toBeUndefined();
  });

  it("스크립트 문서에는 정해지지 않는다", () => {
    expect(setNodeScope(tree, "s1", "s2")).toEqual(tree);
  });

  it("스크립트를 지우면 그 스크립트 전용이던 항목은 공통이 된다", () => {
    const cleared = clearScope(tree, "s2");
    expect(JSON.stringify(cleared)).not.toContain('"scriptId":"s2"');
    expect(JSON.stringify(cleared)).toContain('"scriptId":"s1"');
  });
});

describe("스크립트별 메모와 수정고", () => {
  const note = (id: string, script?: string): ScriptNote => ({ id, from: 0, to: 1, quote: "a", text: id, ...(script ? { script } : {}) });

  it("script가 없는 예전 메모는 첫 스크립트의 것이다", () => {
    const all = [note("a"), note("b", "s2")];
    expect(notesOfScript(all, "s1", "s1").map((n) => n.id)).toEqual(["a"]);
    expect(notesOfScript(all, "s2", "s1").map((n) => n.id)).toEqual(["b"]);
  });

  it("한 스크립트의 메모만 바꾸고 다른 스크립트의 메모는 지킨다", () => {
    const all = [note("a", "s1"), note("b", "s2")];
    const merged = mergeNotes(all, "s1", [note("c")], "s1");
    expect(merged.map((n) => [n.id, n.script])).toEqual([
      ["b", "s2"],
      ["c", "s1"],
    ]);
    expect(mergeNotes(all, "s1", [], "s1").map((n) => n.id)).toEqual(["b"]);
  });

  it("수정고는 스크립트마다 따로 센다", () => {
    const revs = [
      { id: "r1", name: "1고", note: "", createdAt: "", dir: "x" },
      { id: "r2", name: "1고", note: "", createdAt: "", dir: "y", script: "s2" },
    ];
    expect(revisionsOfScript(revs, "s1", "s1").map((r) => r.id)).toEqual(["r1"]);
    expect(revisionsOfScript(revs, "s2", "s1").map((r) => r.id)).toEqual(["r2"]);
  });
});

describe("project.json 읽고 쓰기", () => {
  const manifest: ProjectManifest = {
    format: "dropkick-project",
    version: 1,
    title: "시리즈",
    mainScript: "s2",
    tree,
    revisions: [{ id: "r1", name: "1고", note: "", createdAt: "2026-11-01T00:00:00Z", dir: ".dropkick-revisions/x", script: "s2" }],
    notes: [{ id: "n1", from: 0, to: 2, quote: "ab", text: "메모", script: "s2" }],
  };

  it("전용 표시와 스크립트별 메모·수정고가 그대로 돌아온다", () => {
    const back = parseManifest(serializeManifest(manifest));
    expect(back.mainScript).toBe("s2");
    expect(back.notes?.[0].script).toBe("s2");
    expect(back.revisions?.[0].script).toBe("s2");
    expect(JSON.stringify(back.tree)).toContain('"scriptId":"s2"');
  });

  it("스크립트 표시가 없는 예전 프로젝트는 있던 스크립트의 것으로 읽는다", () => {
    const legacy = {
      format: "dropkick-project",
      version: 1,
      title: "옛날",
      mainScript: "s1",
      tree: [doc("s1", "script")],
      revisions: [{ id: "r1", name: "1고", note: "", createdAt: "x", dir: ".dropkick-revisions/x" }],
      notes: [{ id: "n1", from: 0, to: 2, quote: "ab", text: "메모" }],
    };
    const back = parseManifest(JSON.stringify(legacy));
    expect(back.revisions?.[0].script).toBe("s1");
    expect(back.notes?.[0].script).toBe("s1");
  });

  it("없는 스크립트를 가리키는 전용 표시는 공통으로 읽는다", () => {
    const text = JSON.stringify({ ...manifest, tree: [doc("s1", "script"), doc("메모", "memo", "사라진스크립트")], mainScript: "s1", notes: [], revisions: [] });
    const back = parseManifest(text);
    expect(JSON.stringify(back.tree)).not.toContain("scriptId");
  });
});

/** 메모리 속 가짜 파일 시스템 (저장 → 다시 열기 확인용) */
function memoryFs() {
  const files = new Map<string, string>();
  const fs: ProjectFs = {
    async readText(path) {
      const text = files.get(path);
      if (text === undefined) throw new Error(`없음: ${path}`);
      return text;
    },
    async writeText(path, text) {
      files.set(path, text);
    },
    async ensureDir() {},
    async listFiles(root) {
      return [...files.keys()].filter((p) => p.startsWith(`${root}/`)).map((p) => p.slice(root.length + 1));
    },
    async kind(path) {
      if (files.has(path)) return "file";
      return [...files.keys()].some((p) => p.startsWith(`${path}/`)) ? "dir" : "none";
    },
    async rename(from, to) {
      files.set(to, files.get(from) ?? "");
      files.delete(from);
    },
    async trash(path) {
      files.delete(path);
    },
    async removeDirIfEmpty() {
      return true;
    },
  };
  return { fs, files };
}

describe("스크립트가 여럿인 프로젝트를 저장하고 다시 열기", () => {
  it("스크립트 파일, 전용 표시, 스크립트별 메모와 수정고가 그대로 돌아온다", async () => {
    const { manifest, texts } = createProject("시리즈");
    const first = manifest.mainScript;
    const second = makeDoc(manifest.tree, "script", null);
    const memo = { ...makeDoc(manifest.tree, "memo", null), scriptId: second.id };
    const tree = insertNode(insertNode(manifest.tree, second, null), memo, null);
    texts.set(second.id, "Title: 시리즈\n\n.내부. 학교 - 낮 #1#\n");
    texts.set(memo.id, "2화 메모");
    const full = {
      ...manifest,
      tree,
      mainScript: second.id,
      notes: [{ id: "n1", from: 0, to: 2, quote: "ab", text: "1화 메모", script: first }],
      revisions: [{ id: "r1", name: "1고", note: "", createdAt: "2026-11-01T00:00:00Z", dir: ".dropkick-revisions/x", script: second.id }],
    };

    const { fs, files } = memoryFs();
    await saveProject(fs, "/p/시리즈.dropkick", full, texts);
    expect([...files.keys()].filter((f) => f.endsWith(".fountain")).length).toBe(2);

    const loaded = await loadProject(fs, "/p/시리즈.dropkick");
    expect(loaded.manifest.mainScript).toBe(second.id);
    expect(loaded.texts.get(second.id)).toContain("내부. 학교 - 낮");
    expect(loaded.texts.get(first)).toContain("Title: 시리즈");
    const reloadedMemo = loaded.manifest.tree.find((n) => n.id === memo.id);
    expect(reloadedMemo && "scriptId" in reloadedMemo ? reloadedMemo.scriptId : undefined).toBe(second.id);
    expect(loaded.manifest.notes?.[0]).toMatchObject({ id: "n1", script: first });
    expect(loaded.manifest.revisions?.[0].script).toBe(second.id);
  });
});

describe("같은 이름 판단", () => {
  const siblings: ProjectNode[] = [doc("a", "memo"), doc("b", "character", "s1"), folder("자료", [])];
  const named = (id: string, name: string, scriptId?: string): DocNode => ({ ...doc(id, "character", scriptId), name });

  it("같은 이름이 같은 폴더에 있으면 알아본다", () => {
    expect(findNameConflict(siblings, "a")?.id).toBe("a");
    expect(findNameConflict(siblings, "없는 이름")).toBeUndefined();
    expect(findNameConflict(siblings, "a", "a")).toBeUndefined();
  });

  it("서로 다른 스크립트 전용 문서는 같은 이름이어도 겹치지 않는다", () => {
    const list: ProjectNode[] = [named("x", "민재", "s1"), named("y", "영남", "s2")];
    expect(findNameConflict(list, "민재", undefined, "s2")).toBeUndefined();
    expect(findNameConflict(list, "민재", undefined, "s1")?.id).toBe("x");
    // 공통 문서와는 겹친다
    expect(findNameConflict(list, "민재")?.id).toBe("x");
    expect(findNameConflict([named("c", "민재")], "민재", undefined, "s2")?.id).toBe("c");
    // 폴더끼리는 전용 스크립트가 달라도 겹친다 (실제 폴더 이름이므로)
    expect(findNameConflict([folder("인물", [], "s1")], "인물", undefined, undefined, true)?.id).toBe("인물");
    expect(findNameConflict([folder("인물", [], "s1")], "인물", undefined, "s2", true)?.id).toBe("인물");
  });

  it("폴더와 스크립트·문서는 같은 이름이어도 된다", () => {
    const list: ProjectNode[] = [doc("스크립트", "script"), folder("자료", [])];
    expect(findNameConflict(list, "스크립트", undefined, undefined, true)).toBeUndefined();
    expect(uniqueName(list, "스크립트", undefined, undefined, true)).toBe("스크립트");
    expect(findNameConflict(list, "자료")).toBeUndefined();
    const renamed = renameNode([...list], "자료", "스크립트");
    expect(renamed.find((n) => n.id === "자료")?.name).toBe("스크립트");
    // 같은 종류끼리는 여전히 겹친다
    expect(findNameConflict(list, "자료", undefined, undefined, true)?.id).toBe("자료");
    expect(findNameConflict(list, "스크립트")?.id).toBe("스크립트");
  });

  it("둘 다 보존하면 나중 것에 2가 붙고, 다른 스크립트 전용이면 붙지 않는다", () => {
    const list: ProjectNode[] = [named("x", "민재", "s1")];
    expect(uniqueName(list, "민재", undefined, "s1")).toBe("민재 2");
    expect(uniqueName(list, "민재", undefined, "s2")).toBe("민재");
    const tree: ProjectNode[] = [doc("s1", "script"), named("m1", "민재"), named("m2", "영남")];
    const renamed = renameNode(tree, "m2", "민재");
    expect(renamed.find((n) => n.id === "m2")?.name).toBe("민재 2");
  });

  it("다른 폴더로 옮길 때도 같은 이름이면 2가 붙는다", () => {
    const tree: ProjectNode[] = [folder("f", [named("a1", "민재")]), named("a2", "민재")];
    const moved = moveNode(tree, "a2", "f", "inside");
    const f = moved.find((n) => n.id === "f") as FolderNode;
    expect(f.children.map((n) => n.name)).toEqual(["민재", "민재 2"]);
  });
});

describe("구분선", () => {
  it("문서 목록과 파일 계획에서는 빠지고, 저장하고 다시 읽어도 제자리에 있다", () => {
    const divider = makeDivider();
    const tree: ProjectNode[] = [doc("s1", "script"), divider, doc("메모", "memo")];
    expect(walkDocs(tree).map((d) => d.id)).toEqual(["s1", "메모"]);
    expect(planFiles(tree).find((n) => n.id === divider.id)).toEqual(divider);
    const text = serializeManifest({ format: "dropkick-project", version: 1, title: "x", mainScript: "s1", tree });
    expect(parseManifest(text).tree.map((n) => n.type)).toEqual(["script", "divider", "memo"]);
  });

  it("끌어서 옮길 수 있고, 지워도 지워진 문서 목록에는 들어가지 않으며, 이름이 같아도 겹치지 않는다", () => {
    const divider = makeDivider();
    const tree: ProjectNode[] = [doc("s1", "script"), doc("a", "memo"), divider, doc("b", "memo")];
    const moved = moveNode(tree, divider.id, "a", "before");
    expect(moved.map((n) => n.id)).toEqual(["s1", divider.id, "a", "b"]);
    expect(removeNode(tree, divider.id).removed).toEqual([]);
    expect(findNameConflict([divider], "구분선")).toBeUndefined();
    expect(canScope(divider)).toBe(false);
  });
});
