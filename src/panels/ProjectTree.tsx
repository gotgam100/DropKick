/**
 * 왼쪽 사이드바 트리: 시나리오(펼치면 씬), 시놉시스, 인물, 메모 문서와 폴더.
 * 누르면 열기, 두 번 누르면 이름 바꾸기, 오른쪽 클릭 메뉴, 끌어서 옮기기, 찾기.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { formatEighths, type SceneSummary } from "../analysis/analyze";
import type { ProjectNode } from "../project/model";
import { findParent, type DropPosition } from "../project/tree";

type NewKind = "doc" | "folder";

type Props = {
  title: string;
  tree: ProjectNode[];
  mainScriptId: string;
  activeDocId: string;
  dirtyDocIds: Set<string>;
  scenes: SceneSummary[];
  currentSceneLine: number | null;
  filter: string;
  onFilterChange: (value: string) => void;
  onOpenDoc: (id: string) => void;
  onSelectScene: (line: number) => void;
  onAdd: (kind: NewKind, parentId: string | null) => string | null;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, targetId: string, position: DropPosition) => void;
};

// ---------- 아이콘 ----------

function Icon({ type, open }: { type: ProjectNode["type"]; open?: boolean }) {
  const common = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, "aria-hidden": true } as const;
  switch (type) {
    case "folder":
      return (
        <svg {...common}>
          {open ? (
            <path d="M1.5 4.5v8h11l2-5.5H4l-2 5.5M1.5 4.5V3h4l1.5 1.5h5.5V7" strokeLinejoin="round" />
          ) : (
            <path d="M1.5 3h4L7 4.5h7.5v8h-13z" strokeLinejoin="round" />
          )}
        </svg>
      );
    case "script":
      return (
        <svg {...common}>
          <rect x="3" y="1.5" width="10" height="13" rx="1" />
          <path d="M5.5 5h5M5.5 7.5h5M7 10h3.5" strokeLinecap="round" />
        </svg>
      );
    case "synopsis":
      return (
        <svg {...common}>
          <path d="M2 3.5c2-1 4-1 6 0v10c-2-1-4-1-6 0zM8 3.5c2-1 4-1 6 0v10c-2-1-4-1-6 0z" strokeLinejoin="round" />
        </svg>
      );
    case "character":
      return (
        <svg {...common}>
          <circle cx="8" cy="5.5" r="2.8" />
          <path d="M2.5 14c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M3 1.5h7l3 3v10H3z" strokeLinejoin="round" />
          <path d="M10 1.5v3h3" strokeLinejoin="round" />
        </svg>
      );
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? "tree-chevron open" : "tree-chevron"} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------- 찾기 ----------

function matches(text: string, query: string) {
  return text.toUpperCase().includes(query);
}

type Filtered = { tree: ProjectNode[]; scenes: SceneSummary[] };

function filterTree(tree: ProjectNode[], scenes: SceneSummary[], mainScriptId: string, query: string): Filtered {
  if (!query) return { tree, scenes };
  const sceneHits = scenes.filter((s) => matches(s.heading, query) || s.characters.some((c) => matches(c, query)));
  const visit = (nodes: ProjectNode[]): ProjectNode[] =>
    nodes.flatMap((node): ProjectNode[] => {
      if (node.type === "folder") {
        const children = visit(node.children);
        return children.length > 0 || matches(node.name, query) ? [{ ...node, children }] : [];
      }
      if (node.id === mainScriptId && sceneHits.length > 0) return [node];
      return matches(node.name, query) ? [node] : [];
    });
  return { tree: visit(tree), scenes: sceneHits };
}

// ---------- 트리 ----------

export function ProjectTree(props: Props) {
  const {
    title,
    tree,
    mainScriptId,
    activeDocId,
    dirtyDocIds,
    scenes,
    currentSceneLine,
    filter,
    onFilterChange,
    onOpenDoc,
    onSelectScene,
    onAdd,
    onRename,
    onRemove,
    onMove,
  } = props;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  // 오른쪽 클릭 메뉴. node가 null이면 빈 곳을 누른 것
  const [menu, setMenu] = useState<{ x: number; y: number; node: ProjectNode | null } | null>(null);
  // 끌어서 옮기기 (마우스를 직접 따라간다. 맥 앱 엔진에서도 똑같이 동작하도록)
  const [drag, setDrag] = useState<{
    id: string;
    name: string;
    x: number;
    y: number;
    over: string | null;
    position: DropPosition | null;
  } | null>(null);
  const pressRef = useRef<{ id: string; name: string; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);

  const query = filter.trim().toUpperCase();
  const shown = useMemo(() => filterTree(tree, scenes, mainScriptId, query), [tree, scenes, mainScriptId, query]);

  // 지금 쓰는 씬이 보이도록
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(".tree-scene[aria-current='true']")?.scrollIntoView({ block: "nearest" });
  }, [currentSceneLine]);

  // 메뉴 바깥을 누르면 닫는다.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const toggle = (id: string) =>
    setCollapsed((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const isOpen = (id: string) => query !== "" || !collapsed.has(id);

  const add = (kindToAdd: NewKind, parentId: string | null) => {
    const id = onAdd(kindToAdd, parentId);
    if (id) {
      if (parentId) setCollapsed((set) => new Set([...set].filter((x) => x !== parentId)));
      setRenaming(id);
    }
  };

  // ---------- 끌어서 옮기기 ----------

  /** 커서 아래 항목과 놓을 위치(앞/뒤/안) */
  const dropTargetAt = (x: number, y: number, draggingId: string) => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-node-id]");
    if (!el) return null;
    const id = el.dataset.nodeId!;
    if (id === draggingId) return null;
    const rect = el.getBoundingClientRect();
    const ratio = (y - rect.top) / rect.height;
    const isFolder = el.dataset.nodeType === "folder";
    const position: DropPosition = isFolder
      ? ratio < 0.25
        ? "before"
        : ratio > 0.75
          ? "after"
          : "inside"
      : ratio < 0.5
        ? "before"
        : "after";
    return { id, position };
  };

  const onRowPointerDown = (e: ReactPointerEvent, node: ProjectNode) => {
    if (e.button !== 0 || renaming === node.id) return;
    pressRef.current = { id: node.id, name: node.name, x: e.clientX, y: e.clientY };
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (!drag && moved < 5) return;
      const target = dropTargetAt(e.clientX, e.clientY, press.id);
      setDrag({
        id: press.id,
        name: press.name,
        x: e.clientX,
        y: e.clientY,
        over: target?.id ?? null,
        position: target?.position ?? null,
      });
      // 목록 위아래 끝 가까이 가면 저절로 스크롤
      const list = listRef.current;
      if (list) {
        const rect = list.getBoundingClientRect();
        if (e.clientY < rect.top + 28) list.scrollTop -= 10;
        else if (e.clientY > rect.bottom - 28) list.scrollTop += 10;
      }
    };
    const handleUp = () => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press || !drag) return;
      if (drag.over && drag.position) {
        onMove(drag.id, drag.over, drag.position);
        if (drag.position === "inside") {
          const target = drag.over;
          setCollapsed((set) => new Set([...set].filter((x) => x !== target)));
        }
      }
      // 끌기를 마친 마우스 떼기는 "누르기"로 치지 않는다.
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 0);
      setDrag(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && pressRef.current) {
        pressRef.current = null;
        setDrag(null);
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, onMove]);

  // ---------- 그리기 ----------

  const renderName = (node: ProjectNode) =>
    renaming === node.id ? (
      <input
        className="tree-rename"
        defaultValue={node.name}
        // 새 문서를 만들면 편집 화면이 먼저 커서를 가져가므로, 그다음에 입력칸으로 커서를 옮긴다.
        ref={(el) => {
          if (el && !el.dataset.focused) {
            el.dataset.focused = "1";
            setTimeout(() => {
              el.focus();
              el.select();
            }, 0);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            onRename(node.id, e.currentTarget.value);
            setRenaming(null);
          }
          if (e.key === "Escape") setRenaming(null);
        }}
        onBlur={(e) => {
          onRename(node.id, e.currentTarget.value);
          setRenaming(null);
        }}
      />
    ) : (
      <span className="tree-name">{node.name}</span>
    );

  const renderScenes = (depth: number) =>
    shown.scenes.length === 0 ? (
      <div className="tree-empty" style={{ paddingLeft: 12 + depth * 14 }}>
        {query ? "찾는 씬이 없습니다" : "씬헤딩(⌘1)을 쓰면 씬이 나타납니다"}
      </div>
    ) : (
      shown.scenes.map((scene) => (
        <button
          key={scene.line}
          type="button"
          className="tree-row tree-scene"
          style={{ paddingLeft: 12 + depth * 14 }}
          aria-current={activeDocId === mainScriptId && scene.line === currentSceneLine}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelectScene(scene.line)}
          title={`${scene.heading}\n${scene.page}페이지 · 길이 ${formatEighths(scene.eighths)}${scene.characters.length ? ` · ${scene.characters.join(", ")}` : ""}`}
        >
          <span className="scene-number">S#{scene.number}</span>
          <span className="tree-name">{scene.heading.replace(/^S#\d+\.\s*/, "")}</span>
          <span className="tree-meta">{scene.page}p</span>
        </button>
      ))
    );

  const renderNodes = (nodes: ProjectNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      const isFolder = node.type === "folder";
      const isScript = node.id === mainScriptId;
      const expandable = isFolder || isScript;
      const open = expandable && isOpen(node.id);
      const dropClass =
        drag && drag.over === node.id && drag.position ? ` drop-${drag.position}` : "";
      return (
        <div key={node.id} className="tree-item">
          <div
            role="treeitem"
            aria-expanded={expandable ? open : undefined}
            aria-selected={node.id === activeDocId}
            tabIndex={-1}
            className={`tree-row${node.id === activeDocId ? " active" : ""}${dropClass}${drag?.id === node.id ? " dragging" : ""}`}
            style={{ paddingLeft: 4 + depth * 14 }}
            data-node-id={node.id}
            data-node-type={node.type}
            onPointerDown={(e) => onRowPointerDown(e, node)}
            onMouseDown={(e) => {
              // 편집기 커서를 지키고, 끄는 동안 글자가 선택되지 않게
              if (renaming !== node.id) e.preventDefault();
            }}
            onClick={() => {
              if (suppressClickRef.current) return;
              if (isFolder) toggle(node.id);
              else onOpenDoc(node.id);
            }}
            onDoubleClick={() => setRenaming(node.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ x: e.clientX, y: e.clientY, node });
            }}
          >
            <span
              className="tree-toggle"
              onClick={(e) => {
                if (!expandable) return;
                e.stopPropagation();
                toggle(node.id);
              }}
            >
              {expandable && <Chevron open={open} />}
            </span>
            <span className={`tree-icon icon-${node.type}`}>
              <Icon type={node.type} open={open} />
            </span>
            {renderName(node)}
            {dirtyDocIds.has(node.id) && <span className="tree-dirty" title="저장하지 않은 변경 사항" />}
            {isFolder && renaming !== node.id && (
              <button
                type="button"
                className="tree-plus"
                title={`"${node.name}"에 새 문서`}
                aria-label={`${node.name}에 새 문서`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  add("doc", node.id);
                }}
              >
                +
              </button>
            )}
          </div>
          {open && isScript && renderScenes(depth + 1)}
          {open && isFolder && (
            node.children.length > 0 ? (
              renderNodes(node.children, depth + 1)
            ) : (
              <div className="tree-empty" style={{ paddingLeft: 26 + (depth + 1) * 14 }}>
                비어 있음
              </div>
            )
          )}
        </div>
      );
    });

  // 새로 만들 위치: 폴더면 그 안, 문서면 그 문서가 있는 폴더, 빈 곳이면 맨 위
  const menuParent = (node: ProjectNode | null): string | null => {
    if (!node) return null;
    if (node.type === "folder") return node.id;
    return findParent(tree, node.id)?.id ?? null;
  };

  return (
    <aside className="panel project-tree" aria-label="프로젝트">
      <header className="panel-header">
        <h2 title={title}>{title}</h2>
      </header>
      <div className="panel-search">
        <input
          type="search"
          placeholder="문서, 씬, 인물 찾기"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          spellCheck={false}
        />
      </div>

      <div
        className="tree-list"
        role="tree"
        ref={listRef}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, node: null });
        }}
      >
        {shown.tree.length === 0 ? (
          <p className="panel-empty">"{filter}"이(가) 들어간 항목이 없습니다.</p>
        ) : (
          renderNodes(shown.tree, 0)
        )}
      </div>

      {menu && (
        <div className="tree-menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.node && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRenaming(menu.node!.id);
                setMenu(null);
              }}
            >
              이름 바꾸기
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              add("doc", menuParent(menu.node));
              setMenu(null);
            }}
          >
            새 문서{menu.node?.type === "folder" ? " (이 폴더 안에)" : ""}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              add("folder", menuParent(menu.node));
              setMenu(null);
            }}
          >
            새 폴더{menu.node?.type === "folder" ? " (이 폴더 안에)" : ""}
          </button>
          {menu.node && menu.node.id !== mainScriptId && (
            <>
              <hr />
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => {
                  const id = menu.node!.id;
                  setMenu(null);
                  onRemove(id);
                }}
              >
                지우기…
              </button>
            </>
          )}
        </div>
      )}
      {drag && (
        <div className="tree-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
          {drag.name}
        </div>
      )}
    </aside>
  );
}

