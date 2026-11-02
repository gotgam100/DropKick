/**
 * 프로젝트(폴더) 구조
 *
 *   드롭킥.dropkick/
 *   ├─ project.json        트리 순서, 문서 종류 (이 파일의 형식이 ProjectManifest)
 *   ├─ 시나리오.fountain
 *   ├─ 시놉시스.md
 *   ├─ 인물/               트리의 폴더는 실제 폴더와 이름이 같다
 *   └─ 메모/
 *
 * 문서 내용은 각 파일에 있고, project.json은 순서와 종류만 기억한다.
 * project.json이 없거나 깨져도 폴더 안 파일로 트리를 다시 만들 수 있다.
 */
import { toFountain } from "../fountain/fountain";
import type { ScriptLine } from "../editor/lineStyles";
import { parseNotes, type ScriptNote } from "../editor/notes";
import { parseScriptSettings, type ScriptSettings } from "./scriptSettings";
import { createDefaultStructureBoard, serializeStructureBoard } from "../structure/structureModel";

export const PROJECT_EXTENSION = ".dropkick";
export const MANIFEST_FILE = "project.json";
export const MANIFEST_FORMAT = "dropkick-project";

export type DocType = "script" | "memo" | "character" | "synopsis" | "structure";

/**
 * scriptId: 이 스크립트가 열려 있을 때만 보이는 "전용" 문서·폴더. 없으면 모든 스크립트에서 보이는 공통 항목.
 * (스크립트 문서 자신에게는 쓰지 않는다)
 */
export type DocNode = { id: string; type: DocType; name: string; file: string; icon?: string; scriptId?: string };
export type FolderNode = { id: string; type: "folder"; name: string; children: ProjectNode[]; icon?: string; scriptId?: string };
/** 사이드바의 구분선. 파일이 없고, 끌어서 옮길 수 있다. */
export type DividerNode = { id: string; type: "divider"; name: string; icon?: undefined; scriptId?: undefined };
export type ProjectNode = DocNode | FolderNode | DividerNode;

/** 수정고(1고, 2고 …) 목록 항목. 내용은 dir 폴더에 있다 (src/revisions) */
export type RevisionStats = { pages: number; scenes: number; runtimeMinutes: number };
export type RevisionMeta = {
  id: string;
  name: string;
  note: string;
  /** ISO 시각 */
  createdAt: string;
  /** 프로젝트 안 상대 경로 (.dropkick-revisions/…) */
  dir: string;
  stats?: RevisionStats;
  /** 어느 스크립트의 고인지 (예전 프로젝트는 원고 하나뿐이라 비어 있다) */
  script?: string;
};

export type ProjectManifest = {
  format: typeof MANIFEST_FORMAT;
  version: 1;
  title: string;
  /**
   * 지금 편집기에 열려 있는(활성) 스크립트 문서의 id.
   * 프로젝트에는 스크립트가 여럿일 수 있고, 통계·씬 목록·내보내기·수정고·메모는 이 스크립트를 따른다.
   */
  mainScript: string;
  tree: ProjectNode[];
  /** 마지막으로 연 문서의 id */
  lastOpened?: string;
  /** 수정고 목록 (오래된 것부터) */
  revisions?: RevisionMeta[];
  /** 원고에 붙인 메모 (src/editor/notes.ts). 어느 스크립트의 것인지는 메모마다 script로 적는다. */
  notes?: ScriptNote[];
  /** 스크립트마다 따로 가지는 설정 (표지 항목 켜고 끄기, 씬 번호 시작, 워터마크). 키는 스크립트 id */
  scriptSettings?: Record<string, ScriptSettings>;
};

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  script: "시나리오",
  memo: "문서",
  character: "인물 설정",
  synopsis: "시놉시스",
  structure: "3막 구조",
};

export class ProjectError extends Error {}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 프로젝트 폴더 안쪽만 가리키는 상대 경로인지 (../ 나 절대 경로 금지) */
export function isSafeRelativePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0")) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** 파일·폴더 이름으로 쓸 수 없는 글자를 바꾼다. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[/\\:\0]/g, "-").replace(/^\.+/, "").trim();
  return cleaned || "이름 없음";
}

export function projectTitleFromPath(path: string): string {
  const name = path.replace(/\/+$/, "").split("/").pop() ?? path;
  return name.endsWith(PROJECT_EXTENSION) ? name.slice(0, -PROJECT_EXTENSION.length) : name;
}

export function walkDocs(tree: ProjectNode[]): DocNode[] {
  const docs: DocNode[] = [];
  const visit = (nodes: ProjectNode[]) => {
    for (const node of nodes) {
      if (node.type === "folder") visit(node.children);
      else if (node.type !== "divider") docs.push(node);
    }
  };
  visit(tree);
  return docs;
}

/** 트리의 폴더들을 실제 폴더 경로로 (부모 폴더 이름/자기 이름) */
export function folderPaths(tree: ProjectNode[], base = ""): string[] {
  const paths: string[] = [];
  for (const node of tree) {
    if (node.type !== "folder") continue;
    const path = base ? `${base}/${safeFileName(node.name)}` : safeFileName(node.name);
    paths.push(path, ...folderPaths(node.children, path));
  }
  return paths;
}

// ---------- project.json 읽기/쓰기 ----------

const DOC_TYPES: readonly string[] = ["script", "memo", "character", "synopsis", "structure"];

function parseNode(value: unknown, ids: Set<string>): ProjectNode {
  if (!value || typeof value !== "object") throw new ProjectError("트리 항목 형식이 잘못되었습니다.");
  const node = value as Record<string, unknown>;
  const id = node.id;
  const name = node.name;
  if (typeof id !== "string" || !id || ids.has(id)) throw new ProjectError("트리 항목 id가 없거나 겹칩니다.");
  if (typeof name !== "string") throw new ProjectError("트리 항목 이름이 없습니다.");
  ids.add(id);
  if (node.type === "divider") return { id, type: "divider", name };
  const icon = typeof node.icon === "string" && node.icon.trim() ? node.icon.trim() : undefined;
  const scriptId = typeof node.scriptId === "string" && node.scriptId ? node.scriptId : undefined;
  if (node.type === "folder") {
    if (!Array.isArray(node.children)) throw new ProjectError(`"${name}" 폴더 형식이 잘못되었습니다.`);
    return {
      id,
      type: "folder",
      name,
      children: node.children.map((c) => parseNode(c, ids)),
      ...(icon ? { icon } : {}),
      ...(scriptId ? { scriptId } : {}),
    };
  }
  if (typeof node.type !== "string" || !DOC_TYPES.includes(node.type)) {
    throw new ProjectError(`"${name}"의 문서 종류를 알 수 없습니다.`);
  }
  if (typeof node.file !== "string" || !isSafeRelativePath(node.file)) {
    throw new ProjectError(`"${name}"의 파일 경로가 올바르지 않습니다.`);
  }
  return {
    id,
    type: node.type as DocType,
    name,
    file: node.file,
    ...(icon ? { icon } : {}),
    ...(scriptId && node.type !== "script" ? { scriptId } : {}),
  };
}

export function parseManifest(text: string): ProjectManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError("project.json을 읽을 수 없습니다.");
  }
  const data = raw as Record<string, unknown>;
  if (!data || data.format !== MANIFEST_FORMAT) throw new ProjectError("DropKick 프로젝트 파일이 아닙니다.");
  if (data.version !== 1) throw new ProjectError("이 버전의 DropKick에서 열 수 없는 프로젝트입니다.");
  if (!Array.isArray(data.tree)) throw new ProjectError("트리 정보가 없습니다.");

  const ids = new Set<string>();
  const tree = data.tree.map((n) => parseNode(n, ids));
  const docs = walkDocs(tree);
  const main = docs.find((d) => d.id === data.mainScript && d.type === "script") ?? docs.find((d) => d.type === "script");
  if (!main) throw new ProjectError("프로젝트에 시나리오 문서가 없습니다.");

  // 없는 스크립트를 가리키는 "전용" 표시는 공통으로 되돌린다.
  const scriptIds = new Set(docs.filter((d) => d.type === "script").map((d) => d.id));
  const fixScope = (nodes: ProjectNode[]): ProjectNode[] =>
    nodes.map((n) => {
      const scoped = n.scriptId && !scriptIds.has(n.scriptId);
      const base = scoped ? (({ scriptId: _drop, ...rest }) => rest)(n) : n;
      return base.type === "folder" ? { ...base, children: fixScope(base.children) } : (base as ProjectNode);
    });
  const fixedTree = fixScope(tree);

  const files = new Set<string>();
  for (const doc of docs) {
    if (files.has(doc.file)) throw new ProjectError(`"${doc.file}" 파일을 두 문서가 함께 쓰고 있습니다.`);
    files.add(doc.file);
  }

  const revisions = Array.isArray(data.revisions)
    ? (data.revisions as Record<string, unknown>[]).filter(
        (r): r is RevisionMeta =>
          Boolean(r) &&
          typeof r.id === "string" &&
          typeof r.name === "string" &&
          typeof r.createdAt === "string" &&
          typeof r.dir === "string" &&
          isSafeRelativePath(r.dir) &&
          r.dir.startsWith(".dropkick-revisions/"),
      ).map((r) => ({
        ...r,
        note: typeof r.note === "string" ? r.note : "",
        script: typeof r.script === "string" && scriptIds.has(r.script) ? r.script : main.id,
      }))
    : undefined;

  // 예전 프로젝트(스크립트 하나)의 메모는 그 스크립트의 것이다.
  const notes = parseNotes(data.notes).map((n) => ({
    ...n,
    script: n.script && scriptIds.has(n.script) ? n.script : main.id,
  }));

  const scriptSettings = parseScriptSettings(data.scriptSettings, scriptIds);

  return {
    format: MANIFEST_FORMAT,
    version: 1,
    title: typeof data.title === "string" ? data.title : "",
    mainScript: main.id,
    tree: fixedTree,
    lastOpened: typeof data.lastOpened === "string" && ids.has(data.lastOpened) ? data.lastOpened : undefined,
    ...(revisions && revisions.length > 0 ? { revisions } : {}),
    ...(notes.length > 0 ? { notes } : {}),
    ...(Object.keys(scriptSettings).length > 0 ? { scriptSettings } : {}),
  };
}

export function serializeManifest(manifest: ProjectManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

// ---------- 새 프로젝트 ----------

export type NewProject = { manifest: ProjectManifest; texts: Map<string, string> };

/** 새 프로젝트의 기본 트리: 개요(시놉시스, 3막 구조 양식), 메인 스크립트, 인물 설정, 메모, 기타 (수정고는 사이드바에 따로 있어 트리에 두지 않는다) */
export const DEFAULT_FOLDERS_AFTER_SCRIPT = ["인물 설정", "메모", "기타"];
export const SCRIPT_NAME = "메인 스크립트";

/** 빈 원고: 새 스크립트 작성 시 첫 줄은 씬헤딩으로 시작 */
export const BLANK_SCRIPT_LINES: ScriptLine[] = [{ style: "scene", text: "" }];

/**
 * 새 프로젝트. script를 주면(예: Fountain 가져오기) 그 원고로 시작한다.
 */
export function createProject(title: string, script?: { titlePage: string | null; lines: ScriptLine[] }): NewProject {
  const scriptId = newId("script");
  const synopsisId = newId("synopsis");
  const structureId = newId("structure");
  const folder = (name: string): FolderNode => ({ id: newId("folder"), type: "folder", name, children: [] });
  const manifest: ProjectManifest = {
    format: MANIFEST_FORMAT,
    version: 1,
    title,
    mainScript: scriptId,
    tree: [
      {
        id: newId("folder"),
        type: "folder",
        name: "개요",
        children: [
          { id: synopsisId, type: "synopsis", name: "시놉시스", file: "개요/시놉시스.md" },
          { id: structureId, type: "structure", name: "3막 구조 양식", file: "개요/3막 구조 양식.beats" },
        ],
      },
      { id: scriptId, type: "script", name: SCRIPT_NAME, file: `${SCRIPT_NAME}.fountain` },
      ...DEFAULT_FOLDERS_AFTER_SCRIPT.map(folder),
    ],
    lastOpened: scriptId,
  };
  const scriptText = toFountain({
    titlePage: script ? script.titlePage : `Title: ${title}`,
    lines: script && script.lines.length > 0 ? script.lines : BLANK_SCRIPT_LINES,
  });
  return {
    manifest,
    texts: new Map([
      [scriptId, scriptText],
      [synopsisId, ""],
      [structureId, serializeStructureBoard(createDefaultStructureBoard())],
    ]),
  };
}

// ---------- project.json이 없을 때 다시 만들기 ----------

function typeForFile(path: string): DocType | null {
  const lower = path.toLowerCase();
  if (/\.(fountain|spmd)$/.test(lower)) return "script";
  if (/\.beats$/.test(lower)) return "structure";
  if (!/\.(md|markdown|txt)$/.test(lower)) return null;
  const top = path.split("/")[0];
  if (top === "인물" || /^characters?$/i.test(top)) return "character";
  if (/시놉시스|트리트먼트|synopsis|treatment/i.test(path)) return "synopsis";
  return "memo";
}

/**
 * 폴더 안 파일 목록(상대 경로)으로 트리를 다시 만든다.
 * 시나리오 파일(.fountain)이 하나도 없으면 null.
 */
export function recoverManifest(title: string, files: string[]): ProjectManifest | null {
  const tree: ProjectNode[] = [];
  const folders = new Map<string, FolderNode>();

  const folderFor = (dir: string): ProjectNode[] => {
    if (!dir) return tree;
    const existing = folders.get(dir);
    if (existing) return existing.children;
    const parts = dir.split("/");
    const parent = folderFor(parts.slice(0, -1).join("/"));
    const folder: FolderNode = { id: newId("folder"), type: "folder", name: parts[parts.length - 1], children: [] };
    parent.push(folder);
    folders.set(dir, folder);
    return folder.children;
  };

  const sorted = files.filter(isSafeRelativePath).sort((a, b) => a.localeCompare(b, "ko"));
  for (const file of sorted) {
    if (file === MANIFEST_FILE) continue;
    const type = typeForFile(file);
    if (!type) continue;
    const parts = file.split("/");
    const name = parts[parts.length - 1].replace(/\.[^.]+$/, "");
    folderFor(parts.slice(0, -1).join("/")).push({ id: newId(type), type, name, file });
  }

  // 원고를 맨 위로
  const docs = walkDocs(tree);
  const main = docs.find((d) => d.type === "script" && !d.file.includes("/")) ?? docs.find((d) => d.type === "script");
  if (!main) return null;
  const topIndex = tree.indexOf(main);
  if (topIndex > 0) {
    tree.splice(topIndex, 1);
    tree.unshift(main);
  }
  return { format: MANIFEST_FORMAT, version: 1, title, mainScript: main.id, tree, lastOpened: main.id };
}
