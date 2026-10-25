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
  type DocNode,
  type ProjectManifest,
} from "./model";
import { planFiles } from "./tree";

export interface ProjectFs {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  /** 폴더 안 모든 파일의 상대 경로 (숨김 파일 제외) */
  listFiles(root: string): Promise<string[]>;
  kind(path: string): Promise<"file" | "dir" | "none">;
  /** 이름 바꾸기/옮기기. 받는 쪽에 이미 있으면 실패한다. */
  rename(from: string, to: string): Promise<void>;
  /** 휴지통으로 옮기기 (없으면 아무 일도 하지 않는다) */
  trash(path: string): Promise<void>;
  /** 빈 폴더만 지운다 */
  removeDirIfEmpty(path: string): Promise<boolean>;
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

export type SaveOptions = {
  /** 이 문서들만 내용을 쓴다. 없으면 모든 문서를 쓴다. */
  only?: Set<string>;
  /** 디스크에 마지막으로 저장된 프로젝트 (이름 바뀐 파일 옮기기, 빈 폴더 정리에 쓴다) */
  previous?: ProjectManifest;
  /** 트리에서 지운 문서들 (파일을 휴지통으로 옮긴다) */
  deleted?: DocNode[];
  /**
   * 백업 폴더 (프로젝트 안 상대 경로). 주면, 바꾸거나 옮기거나 지우기 전의 파일을
   * 이 폴더에 같은 경로로 복사해 둔다.
   */
  backupDir?: string;
};

export const BACKUP_ROOT = ".dropkick-backups";

/** 백업 폴더 이름: 2026-10-25 14-03-22 (이름순 = 시간순) */
export function backupStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

/**
 * 프로젝트를 저장하고, 실제로 저장된 project.json 내용을 돌려준다.
 * 1. 트리 모양대로 파일 경로를 정한다 (이름/폴더가 바뀐 문서는 경로가 바뀐다)
 * 2. 지운 문서 파일을 휴지통으로 옮긴다 (같은 이름의 새 문서와 부딪히지 않게 먼저)
 * 3. 경로가 바뀐 문서 파일을 옮긴다 (서로 이름을 맞바꿔도 되도록 임시 이름을 거친다)
 * 4. 문서 내용을 쓴다
 * 5. project.json을 마지막에 쓴다
 * 6. 비게 된 옛 폴더를 정리한다
 */
export async function saveProject(
  fs: ProjectFs,
  path: string,
  manifest: ProjectManifest,
  texts: Map<string, string>,
  options: SaveOptions = {},
): Promise<ProjectManifest> {
  const { only, previous, deleted = [], backupDir } = options;
  const planned: ProjectManifest = { ...manifest, tree: planFiles(manifest.tree) };
  const docs = walkDocs(planned.tree);
  const before = new Map(previous ? walkDocs(previous.tree).map((d) => [d.id, d.file]) : []);

  await fs.ensureDir(path);
  for (const folder of folderPaths(planned.tree)) await fs.ensureDir(joinPath(path, folder));

  // 1-1. 백업: 바뀔 파일의 지금 내용을 먼저 복사해 둔다.
  const backedUp = new Set<string>();
  const backup = async (relative: string) => {
    if (!backupDir || backedUp.has(relative)) return;
    backedUp.add(relative);
    const source = joinPath(path, relative);
    if ((await fs.kind(source)) !== "file") return;
    const target = joinPath(path, `${backupDir}/${relative}`);
    const dir = target.split("/").slice(0, -1).join("/");
    await fs.ensureDir(dir);
    await fs.writeText(target, await fs.readText(source));
  };
  if (backupDir) {
    for (const doc of deleted) {
      const file = before.get(doc.id);
      if (file) await backup(file);
    }
    for (const doc of docs) {
      const old = before.get(doc.id);
      const rewritten = !only || only.has(doc.id);
      if (old && (old !== doc.file || rewritten)) await backup(old);
    }
  }

  // 2. 지운 문서는 휴지통으로
  for (const doc of deleted) {
    const file = before.get(doc.id);
    if (file) await fs.trash(joinPath(path, file));
  }

  // 3. 옮길 파일: 먼저 모두 임시 이름으로, 그다음 새 이름으로
  const moves = docs.filter((d) => before.has(d.id) && before.get(d.id) !== d.file);
  const staged: { doc: DocNode; temp: string }[] = [];
  for (const doc of moves) {
    const from = joinPath(path, before.get(doc.id)!);
    if ((await fs.kind(from)) !== "file") continue;
    const temp = joinPath(path, `.dropkick-move-${doc.id}`);
    await fs.rename(from, temp);
    staged.push({ doc, temp });
  }
  for (const { doc, temp } of staged) await fs.rename(temp, joinPath(path, doc.file));

  // 4. 내용 쓰기: 고친 문서 + 새 문서 (디스크에 없던 문서)
  for (const doc of docs) {
    const isNew = !before.has(doc.id);
    if (only && !only.has(doc.id) && !isNew) continue;
    await fs.writeText(joinPath(path, doc.file), texts.get(doc.id) ?? "");
  }

  // 5. project.json
  await fs.writeText(joinPath(path, MANIFEST_FILE), serializeManifest(planned));

  // 6. 비게 된 옛 폴더 정리 (깊은 폴더부터)
  if (previous) {
    const keep = new Set(folderPaths(planned.tree));
    const old = folderPaths(previous.tree)
      .filter((f) => !keep.has(f))
      .sort((a, b) => b.split("/").length - a.split("/").length);
    for (const folder of old) await fs.removeDirIfEmpty(joinPath(path, folder));
  }

  return planned;
}
