/**
 * 왼쪽 사이드바 트리: 시나리오(펼치면 씬), 시놉시스, 인물, 메모 문서와 폴더.
 * 누르면 열기, 두 번 누르면 이름 바꾸기, 오른쪽 클릭 메뉴, 끌어서 옮기기, 찾기.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatEighths, type SceneSummary, type SectionSummary } from "../analysis/analyze";
import type { ProjectNode, RevisionMeta } from "../project/model";
import { canScope, hiddenIdsFor, scriptDocs, visibleTreeFor } from "../project/scripts";
import { isDefaultPreset, type DocPreset } from "../project/presets";
import { findParent, type DropPosition } from "../project/tree";
import { searchProject, type Snippet } from "./search";
import { IconPickerDialog, SfSymbolIcon } from "./sfSymbols";

type NewKind = "script" | "doc" | "character" | "structure" | "folder";

type Props = {
  title: string;
  tree: ProjectNode[];
  mainScriptId: string;
  activeDocId: string;
  dirtyDocIds: Set<string>;
  /** 문서 id → 본문 (본문 찾기용) */
  docTexts: Map<string, string>;
  scenes: SceneSummary[];
  /** 막·장 (원고 순서대로) */
  sections?: SectionSummary[];
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
  /** 원고에 씬 요약을 만든다 (씬 우클릭 "+ 요약"). line번 씬헤딩 아래에 들어간다. */
  onAddSynopsis?: (line: number) => void;
  onAdd: (kind: NewKind, parentId: string | null) => string | null;
  presets?: DocPreset[];
  onAddPreset?: (preset: DocPreset, parentId: string | null) => string | null;
  onCreatePreset?: () => void;
  onRename: (id: string, name: string) => void;
  /** 스크립트를 복제해 새 버전으로 만든다. 새 스크립트의 id를 돌려준다. */
  onDuplicateScript?: (id: string) => string | null;
  /** 구분선 추가(우클릭 "+ 구분선"). afterId가 있으면 그 항목 바로 뒤에 둔다. */
  onAddDivider?: (parentId: string | null, afterId?: string) => void;
  /** 문서·폴더를 볼 스크립트를 정한다. scriptId가 없으면 모든 스크립트에서 보인다. */
  onSetScope?: (id: string, scriptId?: string) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, targetId: string, position: DropPosition) => void;
  onSetIcon?: (id: string, icon?: string) => void;
  /** 수정고 (사이드바 맨 아래) */
  revisions: RevisionMeta[];
  openRevisionId: string | null;
  onOpenRevision: (id: string) => void;
  onNewRevision: () => void;
};

/** 막·장 단계마다 들여쓰는 폭. 요약은 단계와 상관없이 같은 자리에서 시작해 가로폭이 줄지 않는다. */
const OUTLINE_INDENT = 10;

// ---------- 아이콘 ----------

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={open ? "tree-chevron open" : "tree-chevron"} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 폴더를 우클릭했을 때 메뉴 글 뒤에 붙는 열린 폴더 아이콘: "이 폴더 안에 만든다"는 뜻 */
function InFolderMark() {
  return (
    <span className="menu-in-folder" title="이 폴더 안에">
      <SfSymbolIcon type="folder" open />
    </span>
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
    sections = [],
    currentSceneLine,
    filter,
    onFilterChange,
    onOpenDoc,
    onSelectScene,
    onMoveScene,
    onAddSynopsis,
    notes = [],
    onOpenNote,
    onAdd,
    presets,
    onAddPreset,
    onCreatePreset,
    onRename,
    onDuplicateScript,
    onAddDivider,
    onSetScope,
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
  // 다른 스크립트 전용 문서를 보이게 할지, 찾을 때 모든 스크립트를 뒤질지
  const [showHidden, setShowHidden] = useState(false);
  const [allScripts, setAllScripts] = useState(false);
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
  // 끌기 상태 사본 (씬 끌기와 같은 이유: 다시 그리기 전에 손을 떼도 지난 끌기 상태로 옮기지 않게)
  const dragRef = useRef<typeof drag>(null);
  const latestRef = useRef<{ onMove: typeof onMove; expand: (id: string) => void }>({ onMove, expand: () => {} });
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
  // 끌기 상태를 화면(state)과 별도로 바로 읽기 위한 사본. 화면이 다시 그려지기 전에 손을 떼도
  // 지난 끌기 상태가 남아 다음 "클릭"에서 씬이 옮겨지는 일이 없게 한다.
  const sceneDragRef = useRef<typeof sceneDrag>(null);
  const sceneMovesRef = useRef<{ scenes: typeof shown.scenes; onMoveScene: typeof onMoveScene }>({ scenes: [], onMoveScene });
  const suppressClickRef = useRef(false);
  // 접어 둔 막·장·씬 요약 (막·장은 이름과 몇 번째인지로, 씬은 씬 번호로 구분한다)
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const toggleFold = (key: string) =>
    setFolded((set) => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  // 씬을 오른쪽 클릭한 메뉴: 원고에 씬 요약을 만든다
  const [outlineMenu, setOutlineMenu] = useState<{ x: number; y: number; line: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const scopeSubmenuRef = useRef<HTMLDivElement>(null);

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

  const adjustSubmenuPosition = (ref: React.RefObject<HTMLDivElement | null> = submenuRef) => {
    const sub = ref.current;
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

  // 스크립트가 여럿이면, 지금 스크립트에서 보이는 문서만 보여 준다. (다른 스크립트 전용은 가린다)
  const scripts = useMemo(() => scriptDocs(tree), [tree]);
  const multi = scripts.length > 1;
  const scriptNames = useMemo(() => new Map(scripts.map((s) => [s.id, s.name])), [scripts]);
  const hiddenIds = useMemo(() => hiddenIdsFor(tree, mainScriptId), [tree, mainScriptId]);
  const visible = useMemo(() => visibleTreeFor(tree, mainScriptId), [tree, mainScriptId]);
  const showAll = showHidden || (query !== "" && allScripts);
  const baseTree = showAll ? tree : visible.tree;
  const shown = useMemo(
    () => searchProject(baseTree, scenes, mainScriptId, docTexts, query, allScripts || !multi),
    [baseTree, scenes, mainScriptId, docTexts, query, allScripts, multi],
  );

  // 스크립트를 바꾸면 씬 목록은 다시 펼친다.
  useEffect(() => setScriptClosed(false), [mainScriptId]);

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

  useEffect(() => {
    if (!outlineMenu) return;
    const close = () => setOutlineMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("blur", close);
    };
  }, [outlineMenu]);

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
    dragRef.current = null;
  };

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      // 버튼이 눌려 있지 않은데 움직임이 오면 손 뗌(pointerup)을 놓친 것이다. (트랙패드 탭에서 생긴다)
      // 그대로 두면 다음 움직임이 끌기가 되어 순서가 바뀌므로 아무것도 옮기지 않고 끝낸다.
      if ((e.buttons & 1) === 0) {
        pressRef.current = null;
        if (dragRef.current) {
          dragRef.current = null;
          setDrag(null);
        }
        return;
      }
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (!dragRef.current && moved < 8) return;
      const target = dropTargetAt(e.clientX, e.clientY, press.id);
      const next = {
        id: press.id,
        name: press.name,
        x: e.clientX,
        y: e.clientY,
        over: target?.id ?? null,
        position: target?.position ?? null,
      };
      dragRef.current = next;
      setDrag(next);
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
      const drag = dragRef.current;
      pressRef.current = null;
      dragRef.current = null;
      if (!drag) return;
      setDrag(null);
      if (!press || press.id !== drag.id) return;
      if (drag.over && drag.position) {
        latestRef.current.onMove(drag.id, drag.over, drag.position);
        if (drag.position === "inside") {
          const target = drag.over;
          latestRef.current.expand(target);
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
        dragRef.current = null;
        setDrag(null);
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  latestRef.current = { onMove, expand };

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
      // 버튼이 눌려 있지 않으면 손 뗌을 놓친 것: 끌기를 시작하지 않고 끝낸다 (위 문서 끌기와 같은 이유)
      if ((e.buttons & 1) === 0) {
        scenePressRef.current = null;
        if (sceneDragRef.current) {
          sceneDragRef.current = null;
          setSceneDrag(null);
        }
        return;
      }
      // 손이 조금 흔들린 것(클릭)은 끌기로 보지 않는다.
      if (!sceneDragRef.current && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 8) return;
      const target = targetAt(e.clientX, e.clientY, press.line);
      const next = {
        line: press.line,
        name: press.name,
        x: e.clientX,
        y: e.clientY,
        over: target?.line ?? null,
        position: target?.position ?? null,
      };
      sceneDragRef.current = next;
      setSceneDrag(next);
      const list = listRef.current;
      if (list) {
        const rect = list.getBoundingClientRect();
        if (e.clientY < rect.top + 28) list.scrollTop -= 10;
        else if (e.clientY > rect.bottom - 28) list.scrollTop += 10;
      }
    };
    const handleUp = () => {
      const press = scenePressRef.current;
      const drag = sceneDragRef.current;
      scenePressRef.current = null;
      sceneDragRef.current = null;
      if (!drag) return;
      setSceneDrag(null);
      if (!press || press.line !== drag.line) return;
      const { scenes, onMoveScene: move } = sceneMovesRef.current;
      if (drag.over !== null && drag.position) {
        const index = scenes.findIndex((sc) => sc.line === drag.over);
        const before = drag.position === "before" ? scenes[index]?.line : scenes[index + 1]?.line;
        move?.(drag.line, before ?? null);
      }
      suppressClickRef.current = true;
      setTimeout(() => (suppressClickRef.current = false), 0);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && scenePressRef.current) {
        scenePressRef.current = null;
        sceneDragRef.current = null;
        setSceneDrag(null);
      }
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  sceneMovesRef.current = { scenes: shown.scenes, onMoveScene };

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

  /** 사이드바의 씬 목록: 막 ▾ 장 ▾ 씬 ▾ 요약. 막·장·요약은 접었다 펼 수 있다. (찾는 중에는 씬만) */
  const renderScenes = (depth: number) => {
    const outline = query === "";
    if (shown.scenes.length === 0 && (!outline || sections.length === 0)) {
      return (
        <div className="tree-empty" style={{ paddingLeft: 12 + depth * 14 }}>
          {query ? "찾는 씬이 없습니다" : "씬헤딩(⌘1)을 쓰면 씬이 나타납니다"}
        </div>
      );
    }

    type Entry = { line: number; section?: SectionSummary; scene?: SceneSummary };
    const entries: Entry[] = [
      ...(outline ? sections.map((section): Entry => ({ line: section.line, section })) : []),
      ...shown.scenes.map((scene): Entry => ({ line: scene.line, scene })),
    ].sort((a, b) => a.line - b.line);

    const rows: ReactNode[] = [];
    const seen = new Map<string, number>();
    let act: string | null = null;
    let chapter: string | null = null;
    const hiddenBy = (...keys: (string | null)[]) => keys.some((k) => k !== null && folded.has(k));

    for (const entry of entries) {
      if (entry.section) {
        const sec = entry.section;
        const nth = (seen.get(`${sec.kind}|${sec.title}`) ?? 0) + 1;
        seen.set(`${sec.kind}|${sec.title}`, nth);
        const key = `${sec.kind}|${sec.title}|${nth}`;
        if (sec.kind === "act") {
          act = key;
          chapter = null;
        } else {
          chapter = key;
          if (hiddenBy(act)) continue;
        }
        const level = sec.kind === "act" ? 0 : act ? 1 : 0;
        const closed = folded.has(key);
        rows.push(
          <button
            key={`sec-${sec.line}`}
            type="button"
            className={`tree-row tree-section tree-section-${sec.kind}`}
            style={{ paddingLeft: 4 + depth * 14 + level * OUTLINE_INDENT }}
            aria-expanded={!closed}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelectScene(sec.line)}
            title={`${sec.kind === "act" ? "막" : "시퀀스"}: ${sec.title || "이름 없음"}`}
          >
            <span
              className="tree-toggle"
              onClick={(e) => {
                e.stopPropagation();
                toggleFold(key);
              }}
            >
              <Chevron open={!closed} />
            </span>
            <span className="tree-section-tag">{sec.kind === "act" ? "막" : "시퀀스"}</span>
            <span className={sec.title ? "tree-name" : "tree-name tree-name-empty"}>{sec.title || "이름 없음"}</span>
          </button>,
        );
        continue;
      }

      const scene = entry.scene!;
      if (outline && hiddenBy(act, chapter)) continue;
      const level = outline ? (act ? 1 : 0) + (chapter ? 1 : 0) : 0;
      const indent = 12 + depth * 14 + level * OUTLINE_INDENT;
      const sceneKey = `scene|${scene.number}`;
      const hasSynopsis = outline && scene.synopsis.length > 0;
      const synopsisOpen = hasSynopsis && !folded.has(sceneKey);
      rows.push(
        <button
          key={scene.line}
          type="button"
          data-scene-line={scene.line}
          className={`tree-row tree-scene${sceneDrag?.line === scene.line ? " dragging" : ""}${
            sceneDrag?.over === scene.line && sceneDrag.position ? ` drop-${sceneDrag.position}` : ""
          }`}
          style={{ paddingLeft: indent }}
          aria-current={activeDocId === mainScriptId && scene.line === currentSceneLine}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            // 검색으로 걸러진 목록에서는 순서를 바꾸지 않는다. (보이지 않는 씬 사이로 옮기게 되므로)
            if (e.button !== 0 || query !== "" || !onMoveScene || scene.number <= 0) return;
            scenePressRef.current = { line: scene.line, name: scene.heading, x: e.clientX, y: e.clientY };
            sceneDragRef.current = null;
          }}
          onClick={() => {
            if (suppressClickRef.current) return;
            onSelectScene(scene.line);
          }}
          onContextMenu={(e) => {
            if (!outline || !onAddSynopsis) return;
            e.preventDefault();
            e.stopPropagation();
            setOutlineMenu({ x: e.clientX, y: e.clientY, line: scene.line });
          }}
          title={`${scene.number}. ${scene.heading.replace(/^\s*(?:(?:S\s*#|#)\s*\d+[A-Z]?\.?|\d+[A-Z]?\.)\s*/i, "")}\n길이 ${formatEighths(scene.eighths)}${scene.characters.length ? ` · ${scene.characters.join(", ")}` : ""}`}
        >
          {outline && (
            <span
              className="tree-twisty"
              title={hasSynopsis ? (synopsisOpen ? "요약 접기" : "요약 펼치기") : undefined}
              onPointerDown={(e) => hasSynopsis && e.stopPropagation()}
              onClick={(e) => {
                if (!hasSynopsis) return;
                e.stopPropagation();
                toggleFold(sceneKey);
              }}
            >
              {hasSynopsis && <Chevron open={synopsisOpen} />}
            </span>
          )}
          <span className="scene-number">{scene.number}.</span>
          <span className="tree-name">{scene.heading.replace(/^\s*(?:(?:S\s*#|#)\s*\d+[A-Z]?\.?|\d+[A-Z]?\.)\s*/i, "")}</span>
        </button>,
      );
      if (synopsisOpen) {
        rows.push(
          <div
            key={`syn-${scene.line}`}
            className="tree-synopsis"
            style={{ marginLeft: 12 + depth * 14 + 16 }}
            onClick={() => onSelectScene(scene.line)}
          >
            {scene.synopsis.map((text, i) => (
              <p key={i}>{text || " "}</p>
            ))}
          </div>,
        );
      }
      const snip = shown.sceneSnippets.get(scene.line);
      if (snip) rows.push(<SnippetLine key={`snip-${scene.line}`} snippet={snip} indent={indent + 4} />);
    }
    return rows;
  };

  const renderNodes = (nodes: ProjectNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      const isFolder = node.type === "folder";
      const isScript = node.id === mainScriptId;
      const isAnyScript = node.type === "script";
      if (node.type === "divider") {
        const dividerDrop = drag && drag.over === node.id && drag.position ? ` drop-${drag.position}` : "";
        return (
          <div key={node.id} className="tree-item">
            <div
              role="separator"
              className={`tree-row tree-divider${dividerDrop}${drag?.id === node.id ? " dragging" : ""}`}
              style={{ paddingLeft: 4 + depth * 14 }}
              data-node-id={node.id}
              data-node-type="divider"
              title="구분선 (끌어서 옮기고, 우클릭으로 지웁니다)"
              onPointerDown={(e) => onRowPointerDown(e, node)}
              onMouseDown={(e) => e.preventDefault()}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ x: e.clientX, y: e.clientY, node });
              }}
            >
              <span className="tree-divider-line" />
            </div>
          </div>
        );
      }
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
            className={`tree-row${node.id === activeDocId && !openRevisionId ? " active" : ""}${dropClass}${drag?.id === node.id ? " dragging" : ""}${
              hiddenIds.has(node.id) ? " scope-hidden" : ""
            }${isAnyScript ? (isScript ? " script-active" : " script-inactive") : ""}`}
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
              // 다른 스크립트 전용 문서는 지금 스크립트에서 열 수 없다.
              else if (!hiddenIds.has(node.id)) onOpenDoc(node.id);
            }}
            title={hiddenIds.has(node.id) ? "다른 스크립트 전용이라 지금은 열 수 없습니다" : undefined}
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
            <span className={`tree-icon icon-${node.icon ?? node.type}${isAnyScript ? (isScript ? " script-active" : " script-inactive") : ""}`}>
              <SfSymbolIcon type={node.type} icon={node.icon} open={open} />
            </span>
            {renderName(node)}
            {node.scriptId && scriptNames.has(node.scriptId) && renaming !== node.id && (
              <span className="tree-scope" title={`"${scriptNames.get(node.scriptId)}" 스크립트에서만 보입니다`}>
                {scriptNames.get(node.scriptId)}
              </span>
            )}
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
        {query && multi && (
          <label className="search-all-scripts">
            <input type="checkbox" checked={allScripts} onChange={(e) => setAllScripts(e.target.checked)} />
            <span>모든 스크립트에서 찾기</span>
          </label>
        )}
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

        {!query && multi && (visible.hidden > 0 || showHidden) && (
          <button
            type="button"
            className="tree-hidden-note"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? "다른 스크립트 전용 항목 다시 가리기" : `다른 스크립트 전용 항목 ${visible.hidden}개 숨김 · 보기`}
          </button>
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
                title="지금 원고를 수정고로 보관"
                aria-label="지금 원고를 수정고로 보관"
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

      {outlineMenu &&
        onAddSynopsis &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="tree-menu"
            role="menu"
            style={{ left: outlineMenu.x, top: outlineMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onAddSynopsis(outlineMenu.line);
                setOutlineMenu(null);
              }}
            >
              + 요약
            </button>
          </div>,
          document.body,
        )}

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
                {menu.node && menu.node.type !== "divider" && (
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
                    {menu.node.type === "script" && onDuplicateScript && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          const id = onDuplicateScript(menu.node!.id);
                          if (id) setRenaming(id);
                          setMenu(null);
                        }}
                      >
                        복제
                      </button>
                    )}
                    <hr />
                  </>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    add("script", menuParent(menu.node));
                    setMenu(null);
                  }}
                >
                  + 새 스크립트{menu.node?.type === "folder" && <InFolderMark />}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    add("folder", menuParent(menu.node));
                    setMenu(null);
                  }}
                >
                  + 새 폴더{menu.node?.type === "folder" && <InFolderMark />}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    add("doc", menuParent(menu.node));
                    setMenu(null);
                  }}
                >
                  + 새 문서{menu.node?.type === "folder" && <InFolderMark />}
                </button>
                {presets && onAddPreset ? (
                  <div
                    className="tree-submenu-trigger"
                    role="menuitem"
                    aria-haspopup="menu"
                    onMouseEnter={() => adjustSubmenuPosition(submenuRef)}
                  >
                    <span>+ 양식{menu.node?.type === "folder" && <InFolderMark />}</span>
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
                    + 새 인물 설정{menu.node?.type === "folder" && <InFolderMark />}
                  </button>
                )}
                {onAddDivider && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const node = menu.node;
                      // 문서·스크립트·구분선을 눌렀으면 그 바로 뒤에, 폴더나 빈 곳이면 그 안(맨 끝)에 둔다.
                      onAddDivider(menuParent(node), node && node.type !== "folder" ? node.id : undefined);
                      setMenu(null);
                    }}
                  >
                    + 구분선{menu.node?.type === "folder" && <InFolderMark />}
                  </button>
                )}
                {menu.node && multi && onSetScope && canScope(menu.node) && (
                  <>
                    <hr />
                    <div
                      className="tree-submenu-trigger"
                      role="menuitem"
                      aria-haspopup="menu"
                      onMouseEnter={() => adjustSubmenuPosition(scopeSubmenuRef)}
                    >
                      <span>전용 스크립트 선택</span>
                      <span className="tree-submenu-arrow" aria-hidden="true">
                        ▸
                      </span>
                      <div ref={scopeSubmenuRef} className="tree-menu tree-submenu" role="menu">
                        <div className="preset-menu-section-label">이 {menu.node.type === "folder" ? "폴더" : "문서"}를 연결할 스크립트</div>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            onSetScope(menu.node!.id, undefined);
                            setMenu(null);
                          }}
                        >
                          {menu.node.scriptId ? "　" : "✓ "}모든 스크립트 (공통)
                        </button>
                        {scripts.map((script) => (
                          <button
                            key={script.id}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onSetScope(menu.node!.id, script.id);
                              setMenu(null);
                            }}
                          >
                            {menu.node!.scriptId === script.id ? "✓ " : "　"}
                            {script.name} 전용
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {menu.node && (menu.node.type !== "script" || multi) && (
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
                      {menu.node.type === "divider" ? "구분선 지우기" : "지우기…"}
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
          {sceneDrag.name.replace(/^\s*(?:(?:S\s*#|#)\s*\d+[A-Z]?\.?|\d+[A-Z]?\.)\s*/i, "")}
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

