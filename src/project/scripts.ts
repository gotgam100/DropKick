/**
 * 한 프로젝트에 스크립트가 여럿일 때의 규칙 (순수 함수)
 *
 * - 편집기에 열려 있는 스크립트가 "활성 스크립트"다. (manifest.mainScript)
 * - 문서·폴더는 기본이 "공통"이고, scriptId를 정하면 그 스크립트가 활성일 때만 보인다.
 * - 메모와 수정고는 스크립트마다 따로 가진다.
 */
import type { ScriptNote } from "../editor/notes";
import { walkDocs, type DocNode, type ProjectNode, type RevisionMeta } from "./model";
import { findNode, findParent } from "./tree";

export function scriptDocs(tree: ProjectNode[]): DocNode[] {
  return walkDocs(tree).filter((d) => d.type === "script");
}

function containsScript(node: ProjectNode): boolean {
  return node.type === "script" || (node.type === "folder" && node.children.some(containsScript));
}

/** 이 항목에 "전용 스크립트"를 정할 수 있는지 (스크립트와, 스크립트가 들어 있는 폴더는 안 된다) */
export function canScope(node: ProjectNode): boolean {
  return node.type !== "divider" && !containsScript(node);
}

function isHiddenFor(node: ProjectNode, scriptId: string): boolean {
  return Boolean(node.scriptId) && node.scriptId !== scriptId && !containsScript(node);
}

/** 활성 스크립트에서 보이는 트리와, 가려진 항목 수 (빈 폴더는 1개로 센다) */
export function visibleTreeFor(tree: ProjectNode[], scriptId: string): { tree: ProjectNode[]; hidden: number } {
  let hidden = 0;
  const visit = (nodes: ProjectNode[]): ProjectNode[] =>
    nodes.flatMap((node): ProjectNode[] => {
      if (isHiddenFor(node, scriptId)) {
        hidden += node.type === "folder" ? Math.max(1, walkDocs(node.children).length) : 1;
        return [];
      }
      return [node.type === "folder" ? { ...node, children: visit(node.children) } : node];
    });
  const result = visit(tree);
  return { tree: result, hidden };
}

/** 활성 스크립트에서 가려지는 항목 id (폴더 안의 문서까지) */
export function hiddenIdsFor(tree: ProjectNode[], scriptId: string): Set<string> {
  const ids = new Set<string>();
  const mark = (node: ProjectNode) => {
    ids.add(node.id);
    if (node.type === "folder") node.children.forEach(mark);
  };
  const visit = (nodes: ProjectNode[]) => {
    for (const node of nodes) {
      if (isHiddenFor(node, scriptId)) mark(node);
      else if (node.type === "folder") visit(node.children);
    }
  };
  visit(tree);
  return ids;
}

/** 활성 스크립트에서 보이는 문서들 (스크립트 문서 제외) */
export function visibleDocsFor(tree: ProjectNode[], scriptId: string): DocNode[] {
  return walkDocs(visibleTreeFor(tree, scriptId).tree).filter((d) => d.type !== "script");
}

/** 항목과 그 안의 모든 문서·폴더에 같은 전용 표시를 한다 (없으면 모두 공통으로) */
function applyScope(node: ProjectNode, scriptId?: string): ProjectNode {
  const { scriptId: _old, ...rest } = node;
  const base = (scriptId ? { ...rest, scriptId } : rest) as ProjectNode;
  return base.type === "folder" ? { ...base, children: base.children.map((c) => applyScope(c, scriptId)) } : base;
}

/**
 * 항목의 전용 스크립트를 바꾼다. scriptId가 없으면 공통으로 되돌린다.
 * 폴더면 안의 문서와 폴더도 모두 같은 스크립트 전용(또는 공통)이 된다.
 */
export function setNodeScope(tree: ProjectNode[], id: string, scriptId?: string): ProjectNode[] {
  return tree.map((node) => {
    if (node.id === id) return canScope(node) ? applyScope(node, scriptId) : node;
    return node.type === "folder" ? { ...node, children: setNodeScope(node.children, id, scriptId) } : node;
  });
}

/** 이 폴더(또는 그 바깥 폴더)가 정한 전용 스크립트. 새 문서나 옮겨 온 문서가 물려받는다. */
export function inheritedScope(tree: ProjectNode[], parentId: string | null): string | undefined {
  let id = parentId;
  while (id) {
    const node = findNode(tree, id);
    if (node?.scriptId) return node.scriptId;
    id = findParent(tree, id)?.id ?? null;
  }
  return undefined;
}

/** 지워진 스크립트를 가리키던 "전용" 표시를 공통으로 되돌린다. */
export function clearScope(tree: ProjectNode[], scriptId: string): ProjectNode[] {
  return tree.map((node) => {
    const { scriptId: owner, ...rest } = node;
    const base = (owner === scriptId ? rest : node) as ProjectNode;
    return base.type === "folder" ? { ...base, children: clearScope(base.children, scriptId) } : base;
  });
}

// ---------- 메모 ----------

/** 이 스크립트의 메모 (script가 없으면 맨 처음 스크립트의 것으로 본다) */
export function notesOfScript(notes: readonly ScriptNote[] | undefined, scriptId: string, fallback: string): ScriptNote[] {
  return (notes ?? []).filter((n) => (n.script ?? fallback) === scriptId);
}

/** 이 스크립트의 메모를 새 목록으로 바꾸고, 다른 스크립트의 메모는 그대로 둔다. */
export function mergeNotes(
  all: readonly ScriptNote[] | undefined,
  scriptId: string,
  current: readonly ScriptNote[],
  fallback: string,
): ScriptNote[] {
  const others = (all ?? []).filter((n) => (n.script ?? fallback) !== scriptId);
  return [...others, ...current.map((n) => ({ ...n, script: scriptId }))];
}

// ---------- 수정고 ----------

/** 이 스크립트의 수정고 (script가 없으면 맨 처음 스크립트의 것) */
export function revisionsOfScript(revisions: readonly RevisionMeta[] | undefined, scriptId: string, fallback: string): RevisionMeta[] {
  return (revisions ?? []).filter((r) => (r.script ?? fallback) === scriptId);
}
