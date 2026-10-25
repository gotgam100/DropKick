/**
 * 사이드바 찾기: 문서 이름·본문, 씬 장소·인물·내용에서 찾는다.
 * 본문에서 찾은 경우 앞뒤 문맥(조각)을 함께 돌려준다.
 */
import type { SceneSummary } from "../analysis/analyze";
import type { ProjectNode } from "../project/model";

export type Snippet = { before: string; match: string; after: string };

export type SearchResult = {
  tree: ProjectNode[];
  scenes: SceneSummary[];
  /** 문서 id → 본문에서 찾은 조각 */
  docSnippets: Map<string, Snippet>;
  /** 씬 줄 번호 → 씬 내용에서 찾은 조각 */
  sceneSnippets: Map<number, Snippet>;
  /** 찾은 항목 수 (문서 + 씬) */
  count: number;
};

const norm = (text: string) => text.toUpperCase();

/** text 안에서 query를 찾아 앞뒤 radius 글자와 함께 돌려준다. 줄바꿈은 띄어쓰기로 */
export function makeSnippet(text: string, query: string, radius = 18): Snippet | null {
  if (!query) return null;
  const index = norm(text).indexOf(norm(query));
  if (index < 0) return null;
  const flat = (s: string) => s.replace(/\s+/g, " ");
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + query.length + radius);
  return {
    before: (start > 0 ? "…" : "") + flat(text.slice(start, index)).trimStart(),
    match: text.slice(index, index + query.length),
    after: flat(text.slice(index + query.length, end)).trimEnd() + (end < text.length ? "…" : ""),
  };
}

export function searchProject(
  tree: ProjectNode[],
  scenes: SceneSummary[],
  mainScriptId: string,
  docTexts: Map<string, string>,
  rawQuery: string,
): SearchResult {
  const query = rawQuery.trim();
  const empty = { docSnippets: new Map(), sceneSnippets: new Map(), count: 0 };
  if (!query) return { tree, scenes, ...empty };

  const q = norm(query);
  const has = (text: string) => norm(text).includes(q);

  const sceneSnippets = new Map<number, Snippet>();
  const sceneHits = scenes.filter((scene) => {
    if (has(scene.heading) || scene.characters.some(has)) return true;
    const snip = makeSnippet(scene.text, query);
    if (snip) sceneSnippets.set(scene.line, snip);
    return Boolean(snip);
  });

  const docSnippets = new Map<string, Snippet>();
  let docCount = 0;
  const visit = (nodes: ProjectNode[]): ProjectNode[] =>
    nodes.flatMap((node): ProjectNode[] => {
      if (node.type === "folder") {
        const children = visit(node.children);
        return children.length > 0 || has(node.name) ? [{ ...node, children }] : [];
      }
      if (node.id === mainScriptId) return sceneHits.length > 0 || has(node.name) ? [node] : [];
      if (has(node.name)) {
        docCount++;
        return [node];
      }
      const snip = makeSnippet(docTexts.get(node.id) ?? "", query);
      if (!snip) return [];
      docSnippets.set(node.id, snip);
      docCount++;
      return [node];
    });

  return { tree: visit(tree), scenes: sceneHits, docSnippets, sceneSnippets, count: docCount + sceneHits.length };
}
