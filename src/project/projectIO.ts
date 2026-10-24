/**
 * 프로젝트 폴더 읽기/쓰기. 실제 파일 작업은 ProjectFs가 맡는다.
 * (앱에서는 Tauri 명령, 테스트에서는 메모리 속 가짜 파일 시스템)
 */
import {
  MANIFEST_FILE,
  ProjectError,
  folderPaths,
  parseManifest,
  projectTitleFromPath,
  recoverManifest,
  serializeManifest,
  walkDocs,
  type ProjectManifest,
} from "./model";

export interface ProjectFs {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  /** 폴더 안 모든 파일의 상대 경로 (숨김 파일 제외) */
  listFiles(root: string): Promise<string[]>;
  kind(path: string): Promise<"file" | "dir" | "none">;
}

export function joinPath(base: string, relative: string): string {
  return `${base.replace(/\/+$/, "")}/${relative}`;
}

export type LoadedProject = {
  manifest: ProjectManifest;
  /** 문서 id → 내용 */
  texts: Map<string, string>;
  /** project.json이 없거나 깨져서 파일 목록으로 다시 만들었는지 */
  recovered: boolean;
  /** 열 수 없었던 문서 파일 (빈 문서로 열린다) */
  missing: string[];
};

export async function loadProject(fs: ProjectFs, path: string): Promise<LoadedProject> {
  if ((await fs.kind(path)) !== "dir") throw new ProjectError("프로젝트 폴더를 찾을 수 없습니다.");
  const title = projectTitleFromPath(path);

  let manifest: ProjectManifest | null = null;
  let recovered = false;
  const manifestPath = joinPath(path, MANIFEST_FILE);
  if ((await fs.kind(manifestPath)) === "file") {
    try {
      manifest = parseManifest(await fs.readText(manifestPath));
    } catch {
      manifest = null;
    }
  }
  if (!manifest) {
    manifest = recoverManifest(title, await fs.listFiles(path));
    if (!manifest) throw new ProjectError("이 폴더에는 DropKick 프로젝트나 시나리오 파일이 없습니다.");
    recovered = true;
  }
  if (!manifest.title) manifest.title = title;

  const texts = new Map<string, string>();
  const missing: string[] = [];
  for (const doc of walkDocs(manifest.tree)) {
    try {
      texts.set(doc.id, await fs.readText(joinPath(path, doc.file)));
    } catch {
      texts.set(doc.id, "");
      missing.push(doc.file);
    }
  }
  return { manifest, texts, recovered, missing };
}

/**
 * 프로젝트를 저장한다.
 * - only가 있으면 그 문서들만, 없으면 모든 문서를 쓴다.
 * - project.json은 문서를 다 쓴 뒤 마지막에 쓴다.
 */
export async function saveProject(
  fs: ProjectFs,
  path: string,
  manifest: ProjectManifest,
  texts: Map<string, string>,
  only?: Set<string>,
): Promise<void> {
  await fs.ensureDir(path);
  for (const folder of folderPaths(manifest.tree)) await fs.ensureDir(joinPath(path, folder));
  for (const doc of walkDocs(manifest.tree)) {
    if (only && !only.has(doc.id)) continue;
    const dir = doc.file.split("/").slice(0, -1).join("/");
    if (dir) await fs.ensureDir(joinPath(path, dir));
    await fs.writeText(joinPath(path, doc.file), texts.get(doc.id) ?? "");
  }
  await fs.writeText(joinPath(path, MANIFEST_FILE), serializeManifest(manifest));
}
