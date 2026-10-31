/**
 * 왼쪽 사이드바 트리: 시나리오(펼치면 씬), 시놉시스, 인물, 메모 문서와 폴더.
 * 누르면 열기, 두 번 누르면 이름 바꾸기, 오른쪽 클릭 메뉴, 끌어서 옮기기, 찾기.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatEighths, type SceneSummary } from "../analysis/analyze";
import type { ProjectNode, RevisionMeta } from "../project/model";
import { isDefaultPreset, type DocPreset } from "../project/presets";
import { findParent, type DropPosition } from "../project/tree";
import { searchProject, type Snippet } from "./search";
import { IconPickerDialog, SfSymbolIcon } from "./sfSymbols";

type NewKind = "doc" | "character" | "structure" | "folder";

type Props = {
  title: string;
  tree: ProjectNode[];
  mainScriptId: string;
  activeDocId: string;
  dirtyDocIds: Set<string>;
  /** 문서 id → 본문 (본문 찾기용) */
  docTexts: Map<string, string>;
  scenes: SceneSummary[];
  currentSceneLine: number | null;
  filter: string;
  onFilterChange: (value: string) => void;
  onOpenDoc: (id: string) => void;
  onSelectScene: (line: number) => void;
  /** 원고에 붙인 메모 (글 순서대로) */
  notes?: { id: string; quote: string; text: string }[];
  onOpenNote?: (id: string) => void;
  /** 씬을 끌어 다른 씬 앞(null이면 맨 끝)으로 옮겼을 때 */
  onMoveScene?: (fromLine: number, beforeLine: number | null) => void;
  onAdd: (kind: NewKind, parentId: string | null) => string | null;
  presets?: DocPreset[];
  onAddPreset?: (preset: DocPreset, parentId: string | null) => string | null;
  onCreatePreset?: () => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, targetId: string, position: DropPosition) => void;
  onSetIcon?: (id: string, icon?: string) => void;
  /** 수정고 (사이드바 맨 아래) */
  revisions: RevisionMeta[];
  openRevisionId: string | null;
  onOpenRevision: (id: string) => void;
  onNewRevision: () => void;
};

// ---------- 아이콘 ----------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? "tree-chevron open" : "tree-chevron"} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SnippetLine({ snippet, indent }: { snippet: Snippet; indent: number }) {
  return (
    <div className="tree-snippet" style={{ paddingLeft: indent }}>
      {snippet.before}
      <mark>{snippet.match}</mark>
      {snippet.after}
    </div>
  );
}

// ---------- 트리 ----------

export function ProjectTree(props: Props) {
  const {
    title,
    tree,
    mainScriptId,
    activeDocId,
    dirtyDocIds,
    docTexts,
    scenes,
    currentSceneLine,
    filter,
    onFilterChange,
    onOpenDoc,
    onSelectScene,
    onMoveScene,
    notes = [],
    onOpenNote,
    onAdd,
    presets,
    onAddPreset,
    onCreatePreset,
    onRename,
    onRemove,
    onMove,
    onSetIcon,
    revisions,
    openRevisionId,
    onOpenRevision,
    onNewRevision,
  } = props;
  const [revisionsOpen, setRevisionsOpen] = useState(true);
  const [notesOpen, setNotesOpen] = useState(true);

  // 폴더는 처음에 닫혀 있고, 펼친 폴더만 기억한다. 스크립트는 처음에 펼쳐 둔다.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scriptClosed, setScriptClosed] = useState(false);
  const expand = (id: string) => setExpanded((set) => (set.has(id) ? set : new Set(set).add(id)));
  const [renaming, setRenaming] = useState<string | null>(null);
  // 오른쪽 클릭 메뉴. node가 null이면 빈 곳을 누른 것
  const [menu, setMenu] = useState<{ x: number; y: number; node: ProjectNode | null } | null>(null);
  // 아이콘 변경 팝업 대상 노드와 위치
  const [pickingIcon, setPickingIcon] = useState<{ node: ProjectNode; x: number; y: number } | null>(null);
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
  // 씬 끌어서 순서 바꾸기
  const [sceneDrag, setSceneDrag] = useState<{
    line: number;
    name: string;
    x: number;
    y: number;
    over: number | null;
    position: "before" | "after" | null;
  } | null>(null);
  const scenePressRef = useRef<{ line: number; name: string; x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  // 우클릭 메뉴가 창 아래나 오른쪽 밖으로 잘리지 않도록 위치를 보정한다.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el || !menu || typeof window === "undefined") return;
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const nextLeft = Math.max(margin, Math.min(menu.x, window.innerWidth - rect.width - margin));
    const nextTop = Math.max(margin, Math.min(menu.y, window.innerHeight - rect.height - margin));
    el.style.left = `${nextLeft}px`;
    el.style.top = `${nextTop}px`;
  }, [menu]);

  const adjustSubmenuPosition = () => {
    const sub = submenuRef.current;
    if (!sub || typeof window === "undefined") return;
    sub.style.top = "-5px";
    const rect = sub.getBoundingClientRect();
    const margin = 12;
    if (rect.bottom > window.innerHeight - margin) {
      const shift = rect.bottom - (window.innerHeight - margin);
      sub.style.top = `${-5 - shift}px`;
    }
  };

  const query = filter.trim();
  const shown = useMemo(
    () => searchProject(tree, scenes, mainScriptId, docTexts, query),
    [tree, scenes, mainScriptId, docTexts, query],
  );

  // 지금 열린 문서가 보이도록, 그 문서가 들어 있는 폴더들을 펼친다.
  useEffect(() => {
    const ancestors: string[] = [];
    let parent = findParent(tree, activeDocId);
    while (parent) {
      ancestors.push(parent.id);
      parent = findParent(tree, parent.id);
    }
    if (ancestors.length === 0) return;
    setExpanded((set) => (ancestors.every((id) => set.has(id)) ? set : new Set([...set, ...ancestors])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDocId]);

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

  const toggle = (id: string) => {
    if (id === mainScriptId) {
      setScriptClosed((v) => !v);
      return;
    }
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isOpen = (id: string) => query !== "" || (id === mainScriptId ? !scriptClosed : expanded.has(id));

  const add = (kindToAdd: NewKind, parentId: string | null) => {
    const id = onAdd(kindToAdd, parentId);
    if (id) {
      // 새 항목이 보이도록 들어간 폴더를 펼친다.
      if (parentId) expand(parentId);
      setRenaming(id);
    }
  };

  const addPreset = (preset: DocPreset, parentId: string | null) => {
    if (!onAddPreset) return;
    const id = onAddPreset(preset, parentId);
    if (id) {
      if (parentId) expand(parentId);
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
          expand(target);
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

  // 씬을 끌어 순서 바꾸기: 놓을 자리는 눈에 보이는 씬 목록에서 정한다.
  useEffect(() => {
    const targetAt = (x: number, y: number, dragging: number) => {
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-scene-line]");
      if (!el) return null;
      const line = Number(el.dataset.sceneLine);
      if (line === dragging) return null;
      const rect = el.getBoundingClientRect();
      return { line, position: (y - rect.top) / rect.height < 0.5 ? ("before" as const) : ("after" as const) };
    };
    const handleMove = (e: PointerEvent) => {
      const press = scenePressRef.current;
      if (!press) return;
      if (!sceneDrag && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return;
      const target = targetAt(e.clientX, e.clientY, press.line);
      setSceneDrag({
        line: press.line,
        name: press.name,
        x: e.clientX,
        y: e.clientY,
        over: target?.line ?? null,
        position: target?.position ?? null,
      });
      const list = listRef.current;
      if (list) {
        const rect = list.getBoundingClientRect();
        if (e.clientY < rect.top + 28) list.scrollTop -= 10;
        else if (e.clientY > rect.bottom - 28) list.scrollTop += 10;
      }
    };
    const handleUp = () => {
      const press = scenePressRef.current;
      scenePressRef.current = null;
      if (!press || !sceneDrag) return;
      if (sceneDrag.over !== null && sceneDrag.position) {
        const list = shown.scenes;
        const index = list.findIndex((sc) => sc.line === sceneDrag.over);
        const before = sceneDrag.position === "before" ? list[index]?.line : list[index + 1]?.line;
        onMoveScene?.(sceneDrag.line, before ?? null);
      }
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 0);
      setSceneDrag(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && scenePressRef.current) {
        scenePressRef.current = null;
        setSceneDrag(null);
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
  }, [sceneDrag, shown.scenes, onMoveScene]);

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
          data-scene-line={scene.line}
          className={`tree-row tree-scene${sceneDrag?.line === scene.line ? " dragging" : ""}${
            sceneDrag?.over === scene.line && sceneDrag.position ? ` drop-${sceneDrag.position}` : ""
          }`}
          style={{ paddingLeft: 12 + depth * 14 }}
          aria-current={activeDocId === mainScriptId && scene.line === currentSceneLine}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            // 검색으로 걸러진 목록에서는 순서를 바꾸지 않는다. (보이지 않는 씬 사이로 옮기게 되므로)
            if (e.button !== 0 || query !== "" || !onMoveScene || scene.number <= 0) return;
            scenePressRef.current = { line: scene.line, name: scene.heading, x: e.clientX, y: e.clientY };
          }}
          onClick={() => {
            if (suppressClickRef.current) return;
            onSelectScene(scene.line);
          }}
          title={`${scene.heading}\n${scene.page}페이지 · 길이 ${formatEighths(scene.eighths)}${scene.characters.length ? ` · ${scene.characters.join(", ")}` : ""}`}
        >
          <span className="scene-number">#{scene.number}.</span>
          <span className="tree-name">{scene.heading.replace(/^(?:S#|#)\s*\d+\.?\s*/i, "")}</span>
          <span className="tree-meta">{scene.page}p</span>
        </button>
      )).flatMap((button, i) => {
        const snip = shown.sceneSnippets.get(shown.scenes[i].line);
        return snip ? [button, <SnippetLine key={`snip-${shown.scenes[i].line}`} snippet={snip} indent={12 + depth * 14 + 4} />] : [button];
      })
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
            aria-selected={node.id === activeDocId && !openRevisionId}
            tabIndex={-1}
            className={`tree-row${node.id === activeDocId && !openRevisionId ? " active" : ""}${dropClass}${drag?.id === node.id ? " dragging" : ""}`}
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
            <span className={`tree-icon icon-${node.icon ?? node.type}`}>
              <SfSymbolIcon type={node.type} icon={node.icon} open={open} />
            </span>
            {renderName(node)}
            {dirtyDocIds.has(node.id) && <span className="tree-dirty" title="저장하지 않은 변경 사항" />}
            {isFolder && renaming !== node.id && (
              <button
                type="button"
                className="tree-plus"
                title={`"${node.name}"에 ${node.name === "인물 설정" || node.icon === "character" || node.icon === "person" ? "새 인물 설정" : "새 문서"}`}
                aria-label={`${node.name}에 새 문서`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  add(node.name === "인물 설정" || node.icon === "character" || node.icon === "person" ? "character" : "doc", node.id);
                }}
              >
                +
              </button>
            )}
          </div>
          {shown.docSnippets.has(node.id) && (
            <SnippetLine snippet={shown.docSnippets.get(node.id)!} indent={4 + depth * 14 + 40} />
          )}
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
        {query && <div className="search-count">{shown.count > 0 ? `${shown.count}곳에서 찾음` : "찾는 내용이 없습니다"}</div>}
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
          <p className="panel-empty">"{query}"이(가) 들어간 문서나 씬이 없습니다.</p>
        ) : (
          renderNodes(shown.tree, 0)
        )}

        {!query && (
          <div className="tree-revisions">
            <div
              className="tree-row tree-section"
              role="treeitem"
              aria-expanded={revisionsOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setRevisionsOpen((v) => !v)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <span className="tree-toggle">
                <Chevron open={revisionsOpen} />
              </span>
              <span className="tree-icon icon-revisions">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
                  <rect x="2.5" y="4.5" width="9" height="10" rx="1" />
                  <path d="M4.5 4.5V2.5h9v10h-2" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="tree-name">수정고</span>
              <span className="tree-meta">{revisions.length > 0 ? revisions.length : ""}</span>
              <button
                type="button"
                className="tree-plus"
                title="지금 원고를 새 고로 보관 (⌥⌘S)"
                aria-label="새 고로 보관"
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  onNewRevision();
                }}
              >
                +
              </button>
            </div>
            {revisionsOpen &&
              (revisions.length === 0 ? (
                <div className="tree-empty" style={{ paddingLeft: 40 }}>
                  + 를 눌러 지금 원고를 1고로 보관하세요
                </div>
              ) : (
                [...revisions].reverse().map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`tree-row tree-revision${r.id === openRevisionId ? " active" : ""}`}
                    style={{ paddingLeft: 26 }}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onOpenRevision(r.id)}
                    title={r.note || r.name}
                  >
                    <span className="tree-name">{r.name}</span>
                    <span className="tree-meta">
                      {new Date(r.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                    </span>
                  </button>
                ))
              ))}
          </div>
        )}
        {!query && notes.length > 0 && onOpenNote && (
          <div className="tree-revisions">
            <div
              className="tree-row tree-section"
              role="treeitem"
              aria-expanded={notesOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setNotesOpen((v) => !v)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <span className="tree-toggle">
                <Chevron open={notesOpen} />
              </span>
              <span className="tree-name">원고 메모</span>
              <span className="tree-meta">{notes.length}</span>
            </div>
            {notesOpen &&
              notes.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className="tree-row tree-note"
                  style={{ paddingLeft: 26 }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onOpenNote(n.id)}
                  title={`"${n.quote}"\n${n.text}`}
                >
                  <span className="tree-name">{n.text.split("\n")[0] || "(내용 없음)"}</span>
                  <span className="tree-meta tree-note-quote">{n.quote.replace(/\s+/g, " ").trim()}</span>
                </button>
              ))}
          </div>
        )}
      </div>

      {menu &&
        (typeof document !== "undefined"
          ? createPortal(
              <div
                ref={menuRef}
                className="tree-menu"
                role="menu"
                style={{ left: menu.x, top: menu.y }}
                onClick={(e) => e.stopPropagation()}
              >
                {menu.node && (
                  <>
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
                    {onSetIcon && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setPickingIcon({ node: menu.node!, x: menu.x, y: menu.y });
                          setMenu(null);
                        }}
                      >
                        아이콘 변경…
                      </button>
                    )}
                    <hr />
                  </>
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
                {presets && onAddPreset ? (
                  <div
                    className="tree-submenu-trigger"
                    role="menuitem"
                    aria-haspopup="menu"
                    onMouseEnter={adjustSubmenuPosition}
                  >
                    <span>양식{menu.node?.type === "folder" ? " (이 폴더 안에)" : ""}</span>
                    <span className="tree-submenu-arrow" aria-hidden="true">
                      ▸
                    </span>
                    <div ref={submenuRef} className="tree-menu tree-submenu" role="menu">
                      <div className="preset-menu-section-label">기본 양식</div>
                      <button
                        type="button"
                        role="menuitem"
                        className="tree-submenu-item"
                        onClick={() => {
                          add("structure", menuParent(menu.node));
                          setMenu(null);
                        }}
                      >
                        <span className="tree-icon">
                          <SfSymbolIcon type="structure" />
                        </span>
                        <span>3막 구조 양식</span>
                      </button>
                      {presets
                        .filter((p) => isDefaultPreset(p.id))
                        .map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            role="menuitem"
                            className="tree-submenu-item"
                            onClick={() => {
                              addPreset(preset, menuParent(menu.node));
                              setMenu(null);
                            }}
                          >
                            <span className="tree-icon">
                              <SfSymbolIcon type={preset.docType} icon={preset.icon} />
                            </span>
                            <span>{preset.name}</span>
                          </button>
                        ))}
                      {presets.some((p) => !isDefaultPreset(p.id)) && (
                        <>
                          <hr />
                          <div className="preset-menu-section-label">추가한 양식</div>
                          <div className="preset-custom-scroll">
                            {presets
                              .filter((p) => !isDefaultPreset(p.id))
                              .map((preset) => (
                                <button
                                  key={preset.id}
                                  type="button"
                                  role="menuitem"
                                  className="tree-submenu-item"
                                  onClick={() => {
                                    addPreset(preset, menuParent(menu.node));
                                    setMenu(null);
                                  }}
                                >
                                  <span className="tree-icon">
                                    <SfSymbolIcon type={preset.docType} icon={preset.icon} />
                                  </span>
                                  <span>{preset.name}</span>
                                </button>
                              ))}
                          </div>
                        </>
                      )}
                      {onCreatePreset && (
                        <>
                          <hr />
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setMenu(null);
                              onCreatePreset();
                            }}
                          >
                            + 새 양식 만들기…
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      add("character", menuParent(menu.node));
                      setMenu(null);
                    }}
                  >
                    새 인물 설정{menu.node?.type === "folder" ? " (이 폴더 안에)" : ""}
                  </button>
                )}
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
              </div>,
              document.body,
            )
          : null)}
      {drag && (
        <div className="tree-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
          {drag.name}
        </div>
      )}
      {sceneDrag && (
        <div className="tree-drag-ghost" style={{ left: sceneDrag.x + 12, top: sceneDrag.y + 8 }}>
          {sceneDrag.name.replace(/^(?:S#|#)\s*\d+\.?\s*/i, "")}
        </div>
      )}

      {pickingIcon && onSetIcon && (
        <IconPickerDialog
          node={pickingIcon.node}
          x={pickingIcon.x}
          y={pickingIcon.y}
          onApply={(icon) => onSetIcon(pickingIcon.node.id, icon)}
          onClose={() => setPickingIcon(null)}
        />
      )}
    </aside>
  );
}

