/**
 * 수정고 (1고, 2고 …)
 *
 * 작가가 이름을 붙여 남기는 원고의 이정표. 자동 백업과 달리 지우기 전까지 계속 남는다.
 * 고 하나에는 원고와 "설정 문서"가 함께 들어간다.
 *   - 설정 문서: 인물 설정(종류), 그리고 "개요"·"인물 설정" 폴더 안의 문서
 *   - 메모, 기타 문서는 넣지 않는다 (되돌릴 때도 건드리지 않는다)
 *
 * 저장 위치: 프로젝트/.dropkick-revisions/<날짜 시각 이름>/
 *   revision.json   이름, 메모, 만든 때, 설정 문서 목록, 통계
 *   script.fountain 원고 (표지 포함)
 *   docs/<id>.md    설정 문서
 */
import {
  safeFileName,
  type DocNode,
  type DocType,
  type FolderNode,
  type ProjectNode,
  type RevisionMeta,
} from "../project/model";
import { backupStamp, joinPath, type ProjectFs } from "../project/projectIO";
import { findNode, insertNode, uniqueName } from "../project/tree";

export const REVISION_ROOT = ".dropkick-revisions";
export const SETTINGS_FOLDERS = ["개요", "인물 설정"];

export type { RevisionMeta, RevisionStats } from "../project/model";

export type RevisionDoc = {
  id: string;
  type: DocType;
  name: string;
  /** 문서가 있던 폴더 이름들 (맨 위부터) */
  folders: string[];
};

export type RevisionContent = {
  meta: RevisionMeta;
  /** 원고 (Fountain, 표지 포함) */
  script: string;
  docs: { doc: RevisionDoc; text: string }[];
};

/** 고에 함께 넣을 설정 문서들 */
export function settingsDocs(tree: ProjectNode[]): { doc: DocNode; folders: string[] }[] {
  const out: { doc: DocNode; folders: string[] }[] = [];
  const visit = (nodes: ProjectNode[], folders: string[], inSettings: boolean) => {
    for (const node of nodes) {
      if (node.type === "folder") {
        visit(node.children, [...folders, node.name], inSettings || SETTINGS_FOLDERS.includes(node.name));
      } else if (
        node.type !== "script" &&
        (inSettings || node.type === "character" || node.type === "synopsis" || node.type === "structure")
      ) {
        out.push({ doc: node, folders });
      }
    }
  };
  visit(tree, [], false);
  return out;
}

/** 다음 고 이름: 지금까지 "N고"의 가장 큰 번호 + 1 */
export function nextRevisionName(existing: RevisionMeta[]): string {
  const numbers = existing.map((r) => Number(/^(\d+)\s*고/.exec(r.name)?.[1] ?? 0));
  return `${Math.max(0, ...numbers) + 1}고`;
}

export function revisionDir(name: string, date: Date): string {
  return `${REVISION_ROOT}/${backupStamp(date)} ${safeFileName(name)}`;
}

/** 고를 디스크에 쓴다. */
export async function writeRevision(fs: ProjectFs, projectPath: string, content: RevisionContent): Promise<void> {
  const base = joinPath(projectPath, content.meta.dir);
  await fs.ensureDir(joinPath(base, "docs"));
  await fs.writeText(joinPath(base, "script.fountain"), content.script);
  for (const { doc, text } of content.docs) await fs.writeText(joinPath(base, `docs/${doc.id}.md`), text);
  const record = { ...content.meta, docs: content.docs.map((d) => d.doc) };
  await fs.writeText(joinPath(base, "revision.json"), `${JSON.stringify(record, null, 2)}\n`);
}

/** 고를 읽는다. */
export async function readRevision(fs: ProjectFs, projectPath: string, meta: RevisionMeta): Promise<RevisionContent> {
  const base = joinPath(projectPath, meta.dir);
  const record = JSON.parse(await fs.readText(joinPath(base, "revision.json"))) as RevisionMeta & { docs: RevisionDoc[] };
  const script = await fs.readText(joinPath(base, "script.fountain"));
  const docs: RevisionContent["docs"] = [];
  for (const doc of record.docs ?? []) {
    if (!/^[\w-]+$/.test(doc.id)) continue;
    docs.push({ doc, text: await fs.readText(joinPath(base, `docs/${doc.id}.md`)).catch(() => "") });
  }
  return { meta, script, docs };
}

/**
 * 고의 설정 문서를 지금 트리에 되돌린다.
 * - 같은 문서(id)가 있으면 내용과 이름을 고 때로
 * - 지워진 문서는 원래 폴더(없으면 만들어서)에 다시 만든다
 * - 고 이후에 새로 만든 문서는 그대로 둔다
 */
export function restoreSettings(
  tree: ProjectNode[],
  texts: Map<string, string>,
  docs: RevisionContent["docs"],
): { tree: ProjectNode[]; texts: Map<string, string> } {
  let next = tree;
  const nextTexts = new Map(texts);
  for (const { doc, text } of docs) {
    const existing = findNode(next, doc.id);
    nextTexts.set(doc.id, text);
    if (existing && existing.type !== "folder") {
      if (existing.name !== doc.name) next = mapName(next, doc.id, doc.name);
      continue;
    }
    // 폴더 경로를 따라가며, 없는 폴더는 만든다.
    let parentId: string | null = null;
    for (const folderName of doc.folders) {
      const siblings: ProjectNode[] = parentId ? ((findNode(next, parentId) as FolderNode).children ?? []) : next;
      let folder = siblings.find((n): n is FolderNode => n.type === "folder" && n.name === folderName);
      if (!folder) {
        folder = { id: `folder-${Math.random().toString(36).slice(2, 10)}`, type: "folder", name: folderName, children: [] };
        next = insertNode(next, folder, parentId);
      }
      parentId = folder.id;
    }
    const siblings: ProjectNode[] = parentId ? (findNode(next, parentId) as FolderNode).children : next;
    next = insertNode(next, { id: doc.id, type: doc.type, name: uniqueName(siblings, doc.name), file: "" }, parentId);
  }
  return { tree: next, texts: nextTexts };
}

function mapName(tree: ProjectNode[], id: string, name: string): ProjectNode[] {
  return tree.map((n) => {
    if (n.id === id) return { ...n, name };
    if (n.type === "folder") return { ...n, children: mapName(n.children, id, name) };
    return n;
  });
}
