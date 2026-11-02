import { describe, expect, it } from "vitest";
import {
  MANIFEST_FILE,
  ProjectError,
  createProject,
  isSafeRelativePath,
  parseManifest,
  projectTitleFromPath,
  recoverManifest,
  serializeManifest,
  walkDocs,
} from "./model";
import { BACKUP_ROOT, backupStamp, joinPath, loadProject, saveProject, type ProjectFs } from "./projectIO";
import { folderNamed, insertNode, makeDoc, moveNode, removeNode, renameNode } from "./tree";
import { fromFountain } from "../fountain/fountain";

/** 메모리 속 가짜 파일 시스템 */
function memoryFs() {
  const files = new Map<string, string>();
  const dirs = new Set<string>();
  const writes: string[] = [];
  const fs: ProjectFs = {
    async readText(path) {
      const text = files.get(path);
      if (text === undefined) throw new Error(`없음: ${path}`);
      return text;
    },
    async writeText(path, text) {
      files.set(path, text);
      writes.push(path);
    },
    async ensureDir(path) {
      dirs.add(path);
    },
    async listFiles(root) {
      const prefix = `${root}/`;
      return [...files.keys()].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));
    },
    async kind(path) {
      if (files.has(path)) return "file";
      if (dirs.has(path) || [...files.keys()].some((p) => p.startsWith(`${path}/`))) return "dir";
      return "none";
    },
    async rename(from, to) {
      if (files.has(to)) throw new Error(`이미 있음: ${to}`);
      const text = files.get(from);
      if (text === undefined) throw new Error(`없음: ${from}`);
      files.delete(from);
      files.set(to, text);
    },
    async trash(path) {
      if (files.delete(path)) trashed.push(path);
    },
    async removeDirIfEmpty(path) {
      if ([...files.keys()].some((p) => p.startsWith(`${path}/`))) return false;
      return dirs.delete(path);
    },
  };
  const trashed: string[] = [];
  return { fs, files, dirs, writes, trashed };
}

const ROOT = "/Users/me/드롭킥.dropkick";

describe("새 프로젝트", () => {
  it("개요, 메인 스크립트, 인물 설정, 메모, 기타로 시작하고 첫 줄은 씬헤딩", () => {
    const { manifest, texts } = createProject("드롭킥");
    expect(manifest.tree.map((n) => [n.type, n.name])).toEqual([
      ["folder", "개요"],
      ["script", "메인 스크립트"],
      ["folder", "인물 설정"],
      ["folder", "메모"],
      ["folder", "기타"],
    ]);
    const script = fromFountain(texts.get(manifest.mainScript)!);
    expect(script.titlePage).toBe("Title: 드롭킥");
    expect(script.lines).toEqual([{ style: "scene", text: "" }]);
  });

  it("지금 쓰던 원고로 프로젝트를 만들 수 있다", () => {
    const lines = [
      { style: "scene" as const, text: "내부. 체육관 - 밤" },
      { style: "action" as const, text: "민재가 서 있다." },
    ];
    const { manifest, texts } = createProject("드롭킥", { titlePage: null, lines });
    expect(fromFountain(texts.get(manifest.mainScript)!).lines).toEqual(lines);
  });
});

describe("저장하고 다시 열기", () => {
  it("모든 문서와 트리 순서가 그대로 돌아온다", async () => {
    const { fs, files, dirs } = memoryFs();
    const project = createProject("드롭킥");
    await saveProject(fs, ROOT, project.manifest, project.texts);

    expect(files.has(joinPath(ROOT, "메인 스크립트.fountain"))).toBe(true);
    expect(files.has(joinPath(ROOT, MANIFEST_FILE))).toBe(true);
    for (const folder of ["개요", "인물 설정", "메모", "기타"]) expect(dirs.has(joinPath(ROOT, folder))).toBe(true);

    const loaded = await loadProject(fs, ROOT);
    expect(loaded.recovered).toBe(false);
    expect(loaded.missing).toEqual([]);
    expect(loaded.manifest).toEqual(project.manifest);
    expect(loaded.texts).toEqual(project.texts);
  });

  it("project.json은 문서를 다 쓴 뒤 마지막에 쓴다", async () => {
    const { fs, writes } = memoryFs();
    const project = createProject("드롭킥");
    await saveProject(fs, ROOT, project.manifest, project.texts);
    expect(writes.at(-1)).toBe(joinPath(ROOT, MANIFEST_FILE));
  });

  it("고친 문서만 저장할 수 있다", async () => {
    const { fs, writes } = memoryFs();
    const project = createProject("드롭킥");
    await saveProject(fs, ROOT, project.manifest, project.texts);
    writes.length = 0;
    project.texts.set(project.manifest.mainScript, "바뀐 원고");
    await saveProject(fs, ROOT, project.manifest, project.texts, {
      only: new Set([project.manifest.mainScript]),
      previous: project.manifest,
    });
    expect(writes).toEqual([joinPath(ROOT, "메인 스크립트.fountain"), joinPath(ROOT, MANIFEST_FILE)]);
  });

  it("파일이 없어진 문서는 빈 문서로 열고 알려 준다", async () => {
    const { fs, files } = memoryFs();
    const project = createProject("드롭킥");
    const saved = await saveProject(fs, ROOT, project.manifest, project.texts);
    expect(saved.tree.length).toBe(5);
    files.delete(joinPath(ROOT, "메인 스크립트.fountain"));
    const loaded = await loadProject(fs, ROOT);
    expect(loaded.missing).toEqual(["메인 스크립트.fountain"]);
  });
});

describe("트리 변경을 저장", () => {
  async function savedProject() {
    const mem = memoryFs();
    const project = createProject("드롭킥");
    let tree = project.manifest.tree;
    const memos = folderNamed(tree, "메모")!;
    const people = folderNamed(tree, "인물 설정")!;
    const memo = { ...makeDoc(tree, "memo", memos), name: "아이디어" };
    tree = insertNode(tree, memo, memos);
    const minjae = { ...makeDoc(tree, "character", people), name: "민재" };
    tree = insertNode(tree, minjae, people);
    project.texts.set(memo.id, "메모 내용");
    project.texts.set(minjae.id, "# 민재");
    const saved = await saveProject(mem.fs, ROOT, { ...project.manifest, tree }, project.texts);
    return { ...mem, saved, texts: project.texts, ids: { memo: memo.id, minjae: minjae.id, memos, people } };
  }

  it("새 문서는 트리 위치와 이름대로 파일이 생긴다", async () => {
    const { files, saved } = await savedProject();
    expect(files.get(joinPath(ROOT, "메모/아이디어.md"))).toBe("메모 내용");
    expect(files.get(joinPath(ROOT, "인물 설정/민재.md"))).toBe("# 민재");
    expect(walkDocs(saved.tree).map((d) => d.file)).toContain("인물 설정/민재.md");
  });

  it("이름을 바꾸거나 다른 폴더로 옮기면 파일도 옮겨진다 (내용은 그대로)", async () => {
    const { fs, files, saved, texts, ids } = await savedProject();
    let tree = renameNode(saved.tree, ids.memo, "첫 아이디어");
    tree = moveNode(tree, ids.memo, ids.people, "inside");
    await saveProject(fs, ROOT, { ...saved, tree }, texts, { only: new Set(), previous: saved });
    expect(files.has(joinPath(ROOT, "메모/아이디어.md"))).toBe(false);
    expect(files.get(joinPath(ROOT, "인물 설정/첫 아이디어.md"))).toBe("메모 내용");
  });

  it("두 문서가 이름을 맞바꿔도 내용이 섞이지 않는다", async () => {
    const { fs, files, saved, texts, ids } = await savedProject();
    let tree = moveNode(saved.tree, ids.memo, ids.people, "inside");
    tree = renameNode(tree, ids.minjae, "임시");
    tree = renameNode(tree, ids.memo, "민재");
    tree = renameNode(tree, ids.minjae, "아이디어");
    await saveProject(fs, ROOT, { ...saved, tree }, texts, { only: new Set(), previous: saved });
    expect(files.get(joinPath(ROOT, "인물 설정/민재.md"))).toBe("메모 내용");
    expect(files.get(joinPath(ROOT, "인물 설정/아이디어.md"))).toBe("# 민재");
  });

  it("지운 문서는 휴지통으로, 지운 폴더는 비면 정리된다", async () => {
    const { fs, files, dirs, trashed, saved, texts, ids } = await savedProject();
    const result = removeNode(saved.tree, ids.people);
    await saveProject(fs, ROOT, { ...saved, tree: result.tree }, texts, {
      only: new Set(),
      previous: saved,
      deleted: result.removed,
    });
    expect(trashed).toEqual([joinPath(ROOT, "인물 설정/민재.md")]);
    expect(files.has(joinPath(ROOT, "인물 설정/민재.md"))).toBe(false);
    expect(dirs.has(joinPath(ROOT, "인물 설정"))).toBe(false);
  });

  it("지운 문서와 같은 이름으로 새 문서를 만들어도 새 문서가 남는다", async () => {
    const { fs, files, saved, texts, ids } = await savedProject();
    const result = removeNode(saved.tree, ids.memo);
    const again = { ...makeDoc(result.tree, "memo", ids.memos), name: "아이디어" };
    const tree = insertNode(result.tree, again, ids.memos);
    texts.set(again.id, "새로 쓴 메모");
    await saveProject(fs, ROOT, { ...saved, tree }, texts, {
      only: new Set([again.id]),
      previous: saved,
      deleted: result.removed,
    });
    expect(files.get(joinPath(ROOT, "메모/아이디어.md"))).toBe("새로 쓴 메모");
  });
});

describe("백업", () => {
  it("저장하기 전 내용을 백업 폴더에 남긴다 (바뀐 파일, 옮긴 파일, 지운 파일)", async () => {
    const mem = memoryFs();
    const project = createProject("드롭킥");
    let tree = project.manifest.tree;
    const memos = folderNamed(tree, "메모")!;
    const a = { ...makeDoc(tree, "memo", memos), name: "가" };
    tree = insertNode(tree, a, memos);
    const b = { ...makeDoc(tree, "memo", memos), name: "나" };
    tree = insertNode(tree, b, memos);
    project.texts.set(a.id, "가 옛 내용");
    project.texts.set(b.id, "나 옛 내용");
    const saved = await saveProject(mem.fs, ROOT, { ...project.manifest, tree }, project.texts);

    const texts = new Map(project.texts);
    texts.set(project.manifest.mainScript, "새 원고");
    const removed = removeNode(saved.tree, b.id);
    const next = renameNode(removed.tree, a.id, "가나");
    const dir = `${BACKUP_ROOT}/${backupStamp(new Date(2026, 9, 25, 14, 3, 22))}`;
    expect(dir).toBe(".dropkick-backups/2026-10-25 14-03-22");
    await saveProject(mem.fs, ROOT, { ...saved, tree: next }, texts, {
      only: new Set([project.manifest.mainScript]),
      previous: saved,
      deleted: removed.removed,
      backupDir: dir,
    });
    const backupOf = (rel: string) => mem.files.get(joinPath(ROOT, `${dir}/${rel}`));
    expect(backupOf("메인 스크립트.fountain")).toContain("Title: 드롭킥");
    expect(backupOf("메모/가.md")).toBe("가 옛 내용");
    expect(backupOf("메모/나.md")).toBe("나 옛 내용");
    // 바뀌지 않은 파일은 백업하지 않는다
    expect([...mem.files.keys()].filter((k) => k.includes(BACKUP_ROOT))).toHaveLength(3);
  });
});

describe("project.json이 없거나 깨졌을 때", () => {
  it("폴더 안 파일로 트리를 다시 만든다", async () => {
    const { fs, files } = memoryFs();
    files.set(joinPath(ROOT, "시나리오.fountain"), ".내부. 집 #1#\n");
    files.set(joinPath(ROOT, "시놉시스.md"), "# 시놉시스");
    files.set(joinPath(ROOT, "인물/민재.md"), "# 민재");
    files.set(joinPath(ROOT, "메모/아이디어.md"), "메모");
    files.set(joinPath(ROOT, "사진.png"), "");
    files.set(joinPath(ROOT, MANIFEST_FILE), "{ 깨진 파일");

    const loaded = await loadProject(fs, ROOT);
    expect(loaded.recovered).toBe(true);
    expect(loaded.manifest.title).toBe("드롭킥");
    const docs = walkDocs(loaded.manifest.tree).map((d) => [d.type, d.file]);
    expect(docs).toEqual([
      ["script", "시나리오.fountain"],
      ["memo", "메모/아이디어.md"],
      ["synopsis", "시놉시스.md"],
      ["character", "인물/민재.md"],
    ]);
  });

  it("시나리오 파일이 없는 폴더는 열지 않는다", async () => {
    const { fs, files } = memoryFs();
    files.set(joinPath(ROOT, "메모.md"), "메모");
    await expect(loadProject(fs, ROOT)).rejects.toThrow("시나리오 파일이 없습니다");
    expect(recoverManifest("x", ["a.md"])).toBeNull();
  });
});

describe("안전 검사", () => {
  it("프로젝트 폴더 밖을 가리키는 경로는 거부한다", () => {
    expect(isSafeRelativePath("인물/민재.md")).toBe(true);
    expect(isSafeRelativePath("../밖.md")).toBe(false);
    expect(isSafeRelativePath("/etc/passwd")).toBe(false);
    expect(isSafeRelativePath("a/../../b")).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
  });

  it("project.json에 위험한 경로가 있으면 열지 않는다", () => {
    const { manifest } = createProject("드롭킥");
    const bad = JSON.parse(serializeManifest(manifest));
    bad.tree[1].file = "../../밖.md";
    expect(() => parseManifest(JSON.stringify(bad))).toThrow(ProjectError);
  });

  it("다른 프로그램의 JSON이나 다른 버전은 열지 않는다", () => {
    expect(() => parseManifest('{"tree": []}')).toThrow("DropKick 프로젝트 파일이 아닙니다");
    expect(() => parseManifest('{"format":"dropkick-project","version":2,"tree":[]}')).toThrow("버전");
  });

  it("폴더 이름에서 프로젝트 제목을 얻는다", () => {
    expect(projectTitleFromPath("/a/b/드롭킥.dropkick")).toBe("드롭킥");
    expect(projectTitleFromPath("/a/b/드롭킥.dropkick/")).toBe("드롭킥");
    expect(projectTitleFromPath("/a/b/폴더")).toBe("폴더");
  });
});
