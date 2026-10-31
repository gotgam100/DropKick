/**
 * 프로젝트 트리 편집 (순수 함수: 새 트리를 돌려준다)
 * 추가, 이름 바꾸기, 삭제, 끌어서 옮기기, 저장할 파일 경로 계산.
 */
import {
  newId,
  safeFileName,
  walkDocs,
  type DocNode,
  type DocType,
  type FolderNode,
  type ProjectNode,
} from "./model";

export type DropPosition = "before" | "after" | "inside";

export const NEW_DOC_NAMES: Record<DocType, string> = {
  script: "새 스크립트",
  memo: "새 문서",
  character: "새 인물",
  synopsis: "시놉시스",
  structure: "3막 구조 양식",
};

/** 인물 설정 양식 */
export const CHARACTER_TEMPLATE = (name: string) => `# ${name}

## 기본 정보
- 나이:
- 성별:
- 직업:
- 외모:

## 성격
- 성격:
- 말투:
- 습관·버릇:

## 이야기 속 역할
- 원하는 것 (목표):
- 필요한 것 (결핍):
- 두려워하는 것:
- 비밀:

## 관계
- 

## 변화 (아크)
- 처음:
- 끝:

## 메모
`;

export function findNode(tree: ProjectNode[], id: string): ProjectNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    if (node.type === "folder") {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** id가 들어 있는 부모 폴더 (맨 위면 null) */
export function findParent(tree: ProjectNode[], id: string, parent: FolderNode | null = null): FolderNode | null | undefined {
  for (const node of tree) {
    if (node.id === id) return parent;
    if (node.type === "folder") {
      const found = findParent(node.children, id, node);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function isDescendant(node: ProjectNode, id: string): boolean {
  if (node.type !== "folder") return false;
  return node.children.some((c) => c.id === id || isDescendant(c, id));
}

/** 같은 폴더 안에서 겹치지 않는 이름 ("새 메모", "새 메모 2", ...) */
export function uniqueName(siblings: ProjectNode[], base: string, exceptId?: string): string {
  const taken = new Set(siblings.filter((n) => n.id !== exceptId).map((n) => n.name));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`;
}

function mapTree(tree: ProjectNode[], fn: (nodes: ProjectNode[], parentId: string | null) => ProjectNode[], parentId: string | null = null): ProjectNode[] {
  const mapped = tree.map((n) =>
    n.type === "folder" ? { ...n, children: mapTree(n.children, fn, n.id) } : n,
  );
  return fn(mapped, parentId);
}

function siblingsOf(tree: ProjectNode[], parentId: string | null): ProjectNode[] {
  if (parentId === null) return tree;
  const parent = findNode(tree, parentId);
  return parent?.type === "folder" ? parent.children : tree;
}

/** 새 노드를 폴더 안(맨 끝)에 넣는다. parentId가 null이면 맨 위 끝 */
export function insertNode(tree: ProjectNode[], node: ProjectNode, parentId: string | null): ProjectNode[] {
  if (parentId === null) return [...tree, node];
  return mapTree(tree, (nodes) => nodes.map((n) => (n.id === parentId && n.type === "folder" ? { ...n, children: [...n.children, node] } : n)));
}

/** 새 문서 노드를 만든다. 이름은 같은 폴더 안에서 겹치지 않게 */
export function makeDoc(tree: ProjectNode[], type: DocType, parentId: string | null): DocNode {
  const name = uniqueName(siblingsOf(tree, parentId), NEW_DOC_NAMES[type]);
  return { id: newId(type), type, name, file: "" };
}

export function makeFolder(tree: ProjectNode[], parentId: string | null): FolderNode {
  return { id: newId("folder"), type: "folder", name: uniqueName(siblingsOf(tree, parentId), "새 폴더"), children: [] };
}

/** 이름으로 맨 위 폴더 찾기 */
export function folderNamed(tree: ProjectNode[], name: string): string | null {
  const folder = tree.find((n) => n.type === "folder" && n.name === name);
  return folder?.id ?? null;
}

export function renameNode(tree: ProjectNode[], id: string, name: string): ProjectNode[] {
  const trimmed = name.trim();
  if (!trimmed) return tree;
  const parent = findParent(tree, id);
  const siblings = parent ? parent.children : tree;
  const unique = uniqueName(siblings, trimmed, id);
  return mapTree(tree, (nodes) => nodes.map((n) => (n.id === id ? { ...n, name: unique } : n)));
}

/** 폴더나 문서의 커스텀 아이콘을 바꾸거나 기본값(undefined)으로 되돌린다. */
export function setNodeIcon(tree: ProjectNode[], id: string, icon?: string): ProjectNode[] {
  const clean = icon?.trim() || undefined;
  return mapTree(tree, (nodes) =>
    nodes.map((n) => {
      if (n.id !== id) return n;
      const copy = { ...n };
      if (clean) copy.icon = clean;
      else delete copy.icon;
      return copy;
    }),
  );
}

/** 노드를 지운다. 지워진 문서들(폴더면 안의 문서 모두)을 함께 돌려준다. */
export function removeNode(tree: ProjectNode[], id: string): { tree: ProjectNode[]; removed: DocNode[]; node: ProjectNode | null } {
  const node = findNode(tree, id);
  if (!node) return { tree, removed: [], node: null };
  const removed = node.type === "folder" ? walkDocs(node.children) : [node];
  const next = mapTree(tree, (nodes) => nodes.filter((n) => n.id !== id));
  return { tree: next, removed, node };
}

/** 노드를 다른 노드 앞/뒤, 또는 폴더 안으로 옮긴다. 자기 안으로는 못 옮긴다. */
export function moveNode(tree: ProjectNode[], id: string, targetId: string, position: DropPosition): ProjectNode[] {
  if (id === targetId) return tree;
  const node = findNode(tree, id);
  const target = findNode(tree, targetId);
  if (!node || !target) return tree;
  if (isDescendant(node, targetId)) return tree;
  if (position === "inside" && target.type !== "folder") return tree;

  const without = mapTree(tree, (nodes) => nodes.filter((n) => n.id !== id));
  const parentId = position === "inside" ? targetId : (findParent(without, targetId)?.id ?? null);
  const siblings = siblingsOf(without, parentId);
  const moved = { ...node, name: uniqueName(siblings, node.name, node.id) } as ProjectNode;

  if (position === "inside") return insertNode(without, moved, targetId);

  const place = (nodes: ProjectNode[]) => {
    const index = nodes.findIndex((n) => n.id === targetId);
    if (index < 0) return nodes;
    const copy = nodes.slice();
    copy.splice(position === "before" ? index : index + 1, 0, moved);
    return copy;
  };
  if (parentId === null) return place(without);
  return mapTree(without, (nodes, pid) => (pid === parentId ? place(nodes) : nodes));
}

// ---------- 저장할 파일 경로 ----------

const EXTENSION: Record<DocType, string> = {
  script: ".fountain",
  memo: ".md",
  character: ".md",
  synopsis: ".md",
  structure: ".beats",
};

/**
 * 트리 모양 그대로 파일 경로를 정한다. (폴더/이름.확장자)
 * 이름이 바뀌거나 다른 폴더로 옮긴 문서는 경로가 달라지고, 저장할 때 파일 이름을 바꾼다.
 */
export function planFiles(tree: ProjectNode[], base = ""): ProjectNode[] {
  const used = new Set<string>();
  return tree.map((node) => {
    const name = safeFileName(node.name);
    if (node.type === "folder") {
      const dir = base ? `${base}/${name}` : name;
      return { ...node, children: planFiles(node.children, dir) };
    }
    let fileName = `${name}${EXTENSION[node.type]}`;
    for (let i = 2; used.has(fileName.toLowerCase()); i++) fileName = `${name} ${i}${EXTENSION[node.type]}`;
    used.add(fileName.toLowerCase());
    return { ...node, file: base ? `${base}/${fileName}` : fileName };
  });
}
