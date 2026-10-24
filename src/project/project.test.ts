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
import { joinPath, loadProject, saveProject, type ProjectFs } from "./projectIO";
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
  };
  return { fs, files, dirs, writes };
}

const ROOT = "/Users/me/드롭킥.dropkick";

describe("새 프로젝트", () => {
  it("시나리오, 시놉시스, 빈 인물/메모 폴더로 시작한다", () => {
    const { manifest, texts } = createProject("드롭킥");
    expect(manifest.tree.map((n) => [n.type, n.name])).toEqual([
      ["script", "시나리오"],
      ["synopsis", "시놉시스"],
      ["folder", "인물"],
      ["folder", "메모"],
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

    expect(files.has(joinPath(ROOT, "시나리오.fountain"))).toBe(true);
    expect(files.has(joinPath(ROOT, "시놉시스.md"))).toBe(true);
    expect(files.has(joinPath(ROOT, MANIFEST_FILE))).toBe(true);
    expect(dirs.has(joinPath(ROOT, "인물"))).toBe(true);
    expect(dirs.has(joinPath(ROOT, "메모"))).toBe(true);

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
    await saveProject(fs, ROOT, project.manifest, project.texts, new Set([project.manifest.mainScript]));
    expect(writes).toEqual([joinPath(ROOT, "시나리오.fountain"), joinPath(ROOT, MANIFEST_FILE)]);
  });

  it("파일이 없어진 문서는 빈 문서로 열고 알려 준다", async () => {
    const { fs, files } = memoryFs();
    const project = createProject("드롭킥");
    await saveProject(fs, ROOT, project.manifest, project.texts);
    files.delete(joinPath(ROOT, "시놉시스.md"));
    const loaded = await loadProject(fs, ROOT);
    expect(loaded.missing).toEqual(["시놉시스.md"]);
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
