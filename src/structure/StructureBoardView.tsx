/**
 * 3막 구조 보드 화면 (블레이크 스나이더 '세이브 더 캣' 15단계 기준 · 세로 3기둥 칸반 보드형)
 * - 1막 | 2막 | 3막 세로 3기둥 + 오른쪽 원고 씬 서랍
 * - 각 카드 명칭은 기본값이 있으며 클릭해 커스텀 명칭으로 바로 수정 가능
 * - 각 막마다 카드를 자유롭게 추가·삭제할 수 있으며, 상단에서 3막 구조를 기본값으로 초기화 가능
 * - 각 카드의 시놉시스 입력칸은 3줄 높이로 고정되며, 3줄이 넘어가면 스크롤바(슬라이드바)로 확인
 * - 원고 씬 서랍에서 씬을 클릭해 여러 개 선택한 뒤 한꺼번에 카드로 드래그해 옮길 수 있음
 * - 카드에 배치된 씬은 끌어서 카드 내 순서를 바꿀 수 있고, ⌘(커맨드)를 누른 채 다른 카드로 끌면 복제됨
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { formatEighths, type SceneSummary } from "../analysis/analyze";
import {
  ACT_META,
  cleanSceneHeading,
  createCustomBeatCard,
  createDefaultStructureBoard,
  makeSceneRef,
  parseStructureBoard,
  resolveSceneRef,
  serializeStructureBoard,
  type AssignedSceneRef,
  type BeatCardState,
  type StructureBoardData,
} from "./structureModel";

type Props = {
  text: string;
  scenes: SceneSummary[];
  totalPages: number;
  runtimeMinutes: number;
  onChange: (nextText: string) => void;
  onSelectScene: (line: number) => void;
};

type DragSceneState = {
  scenes: SceneSummary[];
  fromBeatId?: string;
  refKey?: string;
  x: number;
  y: number;
  overBeatId: string | null;
  overChipKey: string | null;
  overChipSide: "before" | "after" | null;
  copyMode: boolean;
};

export function StructureBoardView({
  text,
  scenes,
  runtimeMinutes,
  onChange,
  onSelectScene,
}: Props) {
  const board = useMemo(() => parseStructureBoard(text), [text]);
  const validScenes = useMemo(() => scenes.filter((s) => s.number > 0), [scenes]);
  const [drawerFilter, setDrawerFilter] = useState<"unassigned" | "all">("unassigned");
  const [selectedSceneNums, setSelectedSceneNums] = useState<number[]>([]);
  const [lastClickedNum, setLastClickedNum] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [newlyAddedBeatId, setNewlyAddedBeatId] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragSceneState | null>(null);

  const pressRef = useRef<{
    scene: SceneSummary;
    dragScenes: SceneSummary[];
    fromBeatId?: string;
    refKey?: string;
    shiftKey: boolean;
    metaKey: boolean;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);

  const titleInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  const updateBoard = (updater: (prev: StructureBoardData) => StructureBoardData) => {
    const next = updater(board);
    onChange(serializeStructureBoard(next));
  };

  // 새로 추가된 카드가 있으면 제목 입력칸에 포커스 및 전체 선택
  useEffect(() => {
    if (!newlyAddedBeatId) return;
    const el = titleInputRefs.current.get(newlyAddedBeatId);
    if (el) {
      el.focus();
      el.select();
    }
    setNewlyAddedBeatId(null);
  }, [newlyAddedBeatId, board.beats]);

  // 각 비트에 배치된 씬들을 실제 원고 씬과 연결
  const resolvedByBeat = useMemo(() => {
    const map = new Map<
      string,
      Array<{ ref: AssignedSceneRef; scene: SceneSummary | null }>
    >();
    for (const beat of board.beats) {
      map.set(
        beat.id,
        beat.scenes.map((ref) => ({
          ref,
          scene: resolveSceneRef(ref, validScenes),
        })),
      );
    }
    return map;
  }, [board.beats, validScenes]);

  // 어떤 씬이 어느 비트 카드에 등록되어 있는지 추적 (하나의 씬이 여러 카드에 들어갈 수 있음)
  const sceneToBeatLabels = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const beat of board.beats) {
      const list = resolvedByBeat.get(beat.id) ?? [];
      const label = beat.title.trim() || beat.defaultTitle;
      for (const item of list) {
        if (!item.scene) continue;
        const arr = map.get(item.scene.number) ?? [];
        if (!arr.includes(label)) arr.push(label);
        map.set(item.scene.number, arr);
      }
    }
    return map;
  }, [board.beats, resolvedByBeat]);

  const assignedSceneNumbers = useMemo(() => new Set(sceneToBeatLabels.keys()), [sceneToBeatLabels]);

  const drawerScenes = useMemo(
    () =>
      drawerFilter === "unassigned"
        ? validScenes.filter((s) => !assignedSceneNumbers.has(s.number))
        : validScenes,
    [assignedSceneNumbers, drawerFilter, validScenes],
  );

  const selectedSet = useMemo(() => new Set(selectedSceneNums), [selectedSceneNums]);

  /**
   * 씬 배치·순서 변경·다른 카드로 이동·⌘(커맨드) 복제 처리
   */
  const handleSceneDrop = (
    targetBeatId: string,
    scenesToDrop: SceneSummary[],
    options?: {
      fromBeatId?: string;
      refKey?: string;
      copyMode?: boolean;
      targetChipKey?: string | null;
      targetChipSide?: "before" | "after" | null;
    },
  ) => {
    if (scenesToDrop.length === 0) return;
    const fromBeatId = options?.fromBeatId;
    const refKey = options?.refKey;
    const copyMode = Boolean(options?.copyMode);
    const targetChipKey = options?.targetChipKey ?? null;
    const targetChipSide = options?.targetChipSide ?? null;

    // 1. 같은 카드 안에서 드래그한 경우: 순서 변경
    if (fromBeatId && fromBeatId === targetBeatId && refKey) {
      if (targetChipKey === refKey) return;
      updateBoard((prev) => ({
        ...prev,
        beats: prev.beats.map((b) => {
          if (b.id !== targetBeatId) return b;
          const moving = b.scenes.find((r) => r.key === refKey);
          if (!moving) return b;
          const rest = b.scenes.filter((r) => r.key !== refKey);
          if (targetChipKey) {
            const targetIdx = rest.findIndex((r) => r.key === targetChipKey);
            if (targetIdx >= 0) {
              const insertAt = targetChipSide === "after" ? targetIdx + 1 : targetIdx;
              const next = [...rest];
              next.splice(insertAt, 0, moving);
              return { ...b, scenes: next };
            }
          }
          return { ...b, scenes: [...rest, moving] };
        }),
      }));
      return;
    }

    // 2. 다른 카드로 이동하거나(copyMode=false), ⌘를 눌러 다른 카드로 복제(copyMode=true), 또는 서랍에서 추가
    updateBoard((prev) => ({
      ...prev,
      beats: prev.beats.map((b) => {
        let nextScenes = b.scenes;
        // ⌘(커맨드)를 누르지 않고 다른 카드로 옮긴 경우에만 원래 카드에서 뺀다
        if (fromBeatId && !copyMode && fromBeatId === b.id && fromBeatId !== targetBeatId) {
          const movingNumbers = new Set(scenesToDrop.map((s) => s.number));
          nextScenes = nextScenes.filter((r) =>
            refKey ? r.key !== refKey : !movingNumbers.has(r.sceneNumber),
          );
        }
        if (b.id !== targetBeatId) {
          return nextScenes === b.scenes ? b : { ...b, scenes: nextScenes };
        }

        // 같은 카드 안에서는 동일 씬 중복만 막고, 다른 카드에 이미 있는 씬이라도 이 카드에 자유롭게 추가 가능
        const newRefs: AssignedSceneRef[] = [];
        for (const scene of scenesToDrop) {
          const alreadyInThisBeat = nextScenes.some((r) => {
            const resolved = resolveSceneRef(r, validScenes);
            return resolved
              ? resolved.number === scene.number
              : r.sceneNumber === scene.number && r.heading === cleanSceneHeading(scene.heading);
          });
          if (!alreadyInThisBeat) {
            newRefs.push(makeSceneRef(scene));
          }
        }
        if (newRefs.length === 0) return b;

        if (targetChipKey) {
          const targetIdx = nextScenes.findIndex((r) => r.key === targetChipKey);
          if (targetIdx >= 0) {
            const insertAt = targetChipSide === "after" ? targetIdx + 1 : targetIdx;
            const copy = [...nextScenes];
            copy.splice(insertAt, 0, ...newRefs);
            return { ...b, scenes: copy };
          }
        }
        return {
          ...b,
          scenes: [...nextScenes, ...newRefs],
        };
      }),
    }));
  };

  const removeSceneFromBeat = (beatId: string, refKey: string) => {
    updateBoard((prev) => ({
      ...prev,
      beats: prev.beats.map((b) =>
        b.id === beatId ? { ...b, scenes: b.scenes.filter((r) => r.key !== refKey) } : b,
      ),
    }));
  };

  const updateBeatTitle = (beatId: string, title: string) => {
    updateBoard((prev) => ({
      ...prev,
      beats: prev.beats.map((b) => (b.id === beatId ? { ...b, title } : b)),
    }));
  };

  const updateBeatSynopsis = (beatId: string, synopsis: string) => {
    updateBoard((prev) => ({
      ...prev,
      beats: prev.beats.map((b) => (b.id === beatId ? { ...b, synopsis } : b)),
    }));
  };

  const addBeatCardToAct = (act: 1 | 2 | 3) => {
    const newCard = createCustomBeatCard(act, "새 단계");
    updateBoard((prev) => {
      const nextBeats = [...prev.beats];
      let insertIdx = nextBeats.length;
      for (let i = nextBeats.length - 1; i >= 0; i--) {
        if (nextBeats[i].act <= act) {
          insertIdx = i + 1;
          break;
        }
      }
      if (act === 1 && !nextBeats.some((b) => b.act === 1)) {
        insertIdx = 0;
      }
      nextBeats.splice(insertIdx, 0, newCard);
      return { ...prev, beats: nextBeats };
    });
    setNewlyAddedBeatId(newCard.id);
  };

  const deleteBeatCard = (beatId: string) => {
    updateBoard((prev) => ({
      ...prev,
      beats: prev.beats.filter((b) => b.id !== beatId),
    }));
  };

  const handleResetStructure = () => {
    onChange(serializeStructureBoard(createDefaultStructureBoard()));
    setSelectedSceneNums([]);
    setConfirmReset(false);
  };

  // 서랍에서 씬 클릭 시 선택 토글 (Shift 클릭 시 범위 선택)
  const toggleDrawerSceneSelection = (scene: SceneSummary, shiftKey: boolean) => {
    if (shiftKey && lastClickedNum !== null) {
      const idxA = drawerScenes.findIndex((s) => s.number === lastClickedNum);
      const idxB = drawerScenes.findIndex((s) => s.number === scene.number);
      if (idxA >= 0 && idxB >= 0) {
        const [start, end] = idxA < idxB ? [idxA, idxB] : [idxB, idxA];
        const rangeNums = drawerScenes.slice(start, end + 1).map((s) => s.number);
        setSelectedSceneNums((prev) => Array.from(new Set([...prev, ...rangeNums])));
        setLastClickedNum(scene.number);
        return;
      }
    }
    setSelectedSceneNums((prev) =>
      prev.includes(scene.number) ? prev.filter((n) => n !== scene.number) : [...prev, scene.number],
    );
    setLastClickedNum(scene.number);
  };

  // ---------- 포인터 기반 씬 드래그 앤 드롭 (순서 변경 & ⌘ 복제 지원) ----------

  const dropTargetAtPoint = (
    x: number,
    y: number,
  ): {
    overBeatId: string | null;
    overChipKey: string | null;
    overChipSide: "before" | "after" | null;
  } => {
    const pointEl = document.elementFromPoint(x, y);
    const beatEl = pointEl?.closest<HTMLElement>("[data-beat-id]");
    const overBeatId = beatEl?.dataset.beatId ?? null;
    if (!beatEl || !overBeatId) {
      return { overBeatId: null, overChipKey: null, overChipSide: null };
    }

    // 1. 포인터가 씬 칩 바로 위에 있는 경우
    const directChip = pointEl?.closest<HTMLElement>("[data-chip-key]");
    if (directChip && directChip.dataset.chipBeatId === overBeatId) {
      const rect = directChip.getBoundingClientRect();
      const side: "before" | "after" = x < rect.left + rect.width / 2 ? "before" : "after";
      return {
        overBeatId,
        overChipKey: directChip.dataset.chipKey ?? null,
        overChipSide: side,
      };
    }

    // 2. 카드 안의 씬 영역(.beat-scenes-area) 근처에서 칩 사이 빈 공간에 있는 경우 가장 가까운 칩 계산
    const chips = Array.from(beatEl.querySelectorAll<HTMLElement>("[data-chip-key]"));
    if (chips.length > 0) {
      let bestChip: HTMLElement | null = null;
      let bestDist = Infinity;
      for (const chip of chips) {
        const r = chip.getBoundingClientRect();
        if (y >= r.top - 8 && y <= r.bottom + 8) {
          const cx = r.left + r.width / 2;
          const d = Math.abs(x - cx);
          if (d < bestDist) {
            bestDist = d;
            bestChip = chip;
          }
        }
      }
      if (bestChip) {
        const r = bestChip.getBoundingClientRect();
        const side: "before" | "after" = x < r.left + r.width / 2 ? "before" : "after";
        return {
          overBeatId,
          overChipKey: bestChip.dataset.chipKey ?? null,
          overChipSide: side,
        };
      }
    }

    return { overBeatId, overChipKey: null, overChipSide: null };
  };

  const onDrawerScenePointerDown = (e: ReactPointerEvent, scene: SceneSummary) => {
    if (e.button !== 0) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();

    let dragScenes: SceneSummary[];
    if (selectedSet.has(scene.number)) {
      dragScenes = validScenes.filter((s) => selectedSet.has(s.number));
    } else if (selectedSet.size > 0) {
      const combined = new Set([...selectedSceneNums, scene.number]);
      dragScenes = validScenes.filter((s) => combined.has(s.number));
    } else {
      dragScenes = [scene];
    }

    pressRef.current = {
      scene,
      dragScenes,
      shiftKey: e.shiftKey,
      metaKey: e.metaKey,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    };
  };

  const onChipPointerDown = (
    e: ReactPointerEvent,
    scene: SceneSummary,
    fromBeatId: string,
    refKey: string,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    pressRef.current = {
      scene,
      dragScenes: [scene],
      fromBeatId,
      refKey,
      shiftKey: false,
      metaKey: e.metaKey,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const press = pressRef.current;
      if (!press) return;
      const dist = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      if (!press.moved && dist < 5) return;
      press.moved = true;
      press.metaKey = e.metaKey;
      window.getSelection()?.removeAllRanges();
      const target = dropTargetAtPoint(e.clientX, e.clientY);
      setDrag({
        scenes: press.dragScenes,
        fromBeatId: press.fromBeatId,
        refKey: press.refKey,
        x: e.clientX,
        y: e.clientY,
        overBeatId: target.overBeatId,
        overChipKey: target.overChipKey,
        overChipSide: target.overChipSide,
        copyMode: e.metaKey,
      });
    };

    const onUp = (e: PointerEvent) => {
      const press = pressRef.current;
      pressRef.current = null;
      if (!press) return;

      if (press.moved && drag) {
        if (drag.overBeatId) {
          handleSceneDrop(drag.overBeatId, drag.scenes, {
            fromBeatId: drag.fromBeatId,
            refKey: drag.refKey,
            copyMode: e.metaKey || drag.copyMode,
            targetChipKey: drag.overChipKey,
            targetChipSide: drag.overChipSide,
          });
          if (!drag.fromBeatId) {
            setSelectedSceneNums([]);
          }
        }
        setDrag(null);
        return;
      }

      // 드래그하지 않고 클릭한 경우:
      if (!press.fromBeatId) {
        // 원고 씬 서랍에서는 클릭 시 스크립트로 이동하지 않고 선택/해제만 수행
        toggleDrawerSceneSelection(press.scene, press.shiftKey);
      } else {
        // 카드 안에 배치된 씬 칩을 클릭한 경우에만 해당 원고 씬으로 이동
        onSelectScene(press.scene.line);
      }
      setDrag(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        pressRef.current = null;
        setDrag(null);
      } else if (e.key === "Meta") {
        if (pressRef.current) pressRef.current.metaKey = true;
        setDrag((prev) => (prev ? { ...prev, copyMode: true } : null));
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Meta") {
        if (pressRef.current) pressRef.current.metaKey = false;
        setDrag((prev) => (prev ? { ...prev, copyMode: false } : null));
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, board, validScenes, drawerScenes, selectedSceneNums, lastClickedNum]);

  // 전체 보드에서의 순번(1, 2, 3...) 매핑
  const beatNumberMap = useMemo(() => {
    const map = new Map<string, number>();
    let num = 1;
    for (const act of [1, 2, 3] as const) {
      for (const b of board.beats) {
        if (b.act === act) {
          map.set(b.id, num++);
        }
      }
    }
    return map;
  }, [board.beats]);

  const act2Beats = useMemo(() => board.beats.filter((b) => b.act === 2), [board.beats]);

  const getBeatPhase = (beat: BeatCardState): { phase: "act-1" | "act-2a" | "act-2b" | "act-3"; label: string } => {
    if (beat.act === 1) return { phase: "act-1", label: "1막" };
    if (beat.act === 3) return { phase: "act-3", label: "3막" };
    const midIdx = act2Beats.findIndex((b) => b.id === "midpoint" || b.defaultTitle === "중간점");
    const cutOff = midIdx >= 0 ? midIdx : Math.floor(act2Beats.length / 2);
    const myIdx = act2Beats.findIndex((b) => b.id === beat.id);
    return myIdx > cutOff
      ? { phase: "act-2b", label: "2막 후반" }
      : { phase: "act-2a", label: "2막 전반" };
  };

  const renderBeatCard = (state: BeatCardState) => {
    const stepNumber = beatNumberMap.get(state.id) ?? 1;
    const resolvedList = resolvedByBeat.get(state.id) ?? [];
    const activeScenes = resolvedList.map((r) => r.scene).filter((s): s is SceneSummary => s !== null);
    const { phase, label: phaseLabel } = getBeatPhase(state);

    const isCustomTitle =
      state.defaultTitle.trim() !== "" &&
      state.title.trim() !== "" &&
      state.title !== state.defaultTitle;
    const isDropTarget = drag?.overBeatId === state.id;

    // 아직 이 카드에 들어 있지 않은 씬 목록 (다른 카드에 들어 있는 씬도 이 카드에 추가할 수 있음)
    const registeredNumbers = new Set(activeScenes.map((s) => s.number));
    const availableToAdd = validScenes.filter((s) => !registeredNumbers.has(s.number));

    return (
      <section
        key={state.id}
        data-beat-id={state.id}
        className={`beat-card phase-${phase}${isDropTarget ? " drop-over" : ""}`}
      >
        <div className="beat-card-head">
          <span className="beat-number">{stepNumber}.</span>
          <span className={`beat-phase-badge phase-${phase}`}>{phaseLabel}</span>
          <input
            ref={(el) => {
              if (el) titleInputRefs.current.set(state.id, el);
              else titleInputRefs.current.delete(state.id);
            }}
            type="text"
            className="beat-title-input"
            value={state.title}
            placeholder={state.defaultTitle || "단계 이름"}
            aria-label={`${stepNumber}번 단계 명칭`}
            title="클릭해서 카드 명칭을 자유롭게 수정할 수 있습니다"
            onChange={(e) => updateBeatTitle(state.id, e.target.value)}
            onBlur={(e) => {
              if (!e.currentTarget.value.trim()) {
                updateBeatTitle(state.id, state.defaultTitle || "새 단계");
              }
            }}
          />
          {isCustomTitle && (
            <button
              type="button"
              className="beat-title-reset"
              title={`기본 명칭("${state.defaultTitle}")으로 되돌리기`}
              onClick={() => updateBeatTitle(state.id, state.defaultTitle)}
            >
              ↺
            </button>
          )}
          {state.guide && <span className="beat-guide">{state.guide}</span>}
          <button
            type="button"
            className="beat-card-delete"
            aria-label="이 카드 삭제"
            title="이 카드 삭제"
            onClick={() => deleteBeatCard(state.id)}
          >
            ×
          </button>
        </div>

        {/* 1. 시놉시스 및 구상 */}
        <div className="beat-card-synopsis-section">
          <div className="beat-section-label">시놉시스 및 구상</div>
          <textarea
            className="beat-synopsis"
            rows={3}
            value={state.synopsis}
            placeholder="이 단계의 시놉시스나 구상을 적어보세요."
            onChange={(e) => updateBeatSynopsis(state.id, e.target.value)}
          />
        </div>

        {/* 2. 씬 박스 */}
        <div className="beat-card-scenes-section">
          <div className="beat-section-label">
            <span>씬 박스</span>
            {activeScenes.length > 0 && (
              <span className="muted beat-scenes-count">({activeScenes.length}개)</span>
            )}
          </div>
          <div className="beat-scenes-area">
          {resolvedList.map(({ ref, scene }) => {
            const isChipDropTarget =
              drag?.overBeatId === state.id &&
              drag?.overChipKey === ref.key &&
              drag?.refKey !== ref.key;
            const dropClass = isChipDropTarget
              ? drag?.overChipSide === "after"
                ? " chip-drop-after"
                : " chip-drop-before"
              : "";
            const isDraggingSelf = drag?.refKey === ref.key && !drag?.copyMode;

            return scene ? (
              <div
                key={ref.key}
                data-chip-key={ref.key}
                data-chip-beat-id={state.id}
                className={`beat-scene-chip${dropClass}${isDraggingSelf ? " chip-dragging" : ""}`}
                onPointerDown={(e) => onChipPointerDown(e, scene, state.id, ref.key)}
                title={`#${scene.number}. ${cleanSceneHeading(scene.heading)} (${scene.page}p)\n• 클릭: 원고의 이 씬으로 이동\n• 드래그: 순서 변경 또는 다른 카드로 이동\n• ⌘(커맨드) + 드래그: 다른 카드에 복제`}
              >
                <span className="beat-scene-chip-jump">
                  <span className="scene-number">#{scene.number}.</span>
                  <span className="beat-scene-chip-name">
                    {cleanSceneHeading(scene.heading) || "장소 미정"}
                  </span>
                </span>
                <button
                  type="button"
                  className="beat-scene-chip-remove"
                  aria-label="이 카드에서 씬 빼기"
                  title="이 카드에서 씬 빼기"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSceneFromBeat(state.id, ref.key);
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <div
                key={ref.key}
                data-chip-key={ref.key}
                data-chip-beat-id={state.id}
                className={`beat-scene-chip missing${dropClass}`}
                title="원고에서 지워졌거나 찾을 수 없는 씬입니다"
              >
                <span className="beat-scene-chip-name">
                  (#{ref.sceneNumber}. {ref.heading || "삭제된 씬"})
                </span>
                <button
                  type="button"
                  className="beat-scene-chip-remove"
                  aria-label="지우기"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSceneFromBeat(state.id, ref.key);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}

          {availableToAdd.length > 0 ? (
            <select
              className="beat-add-scene-select"
              value=""
              aria-label={`${state.title || state.defaultTitle}에 씬 추가`}
              onChange={(e) => {
                const num = Number(e.currentTarget.value);
                const found = validScenes.find((s) => s.number === num);
                if (found) handleSceneDrop(state.id, [found]);
              }}
            >
              <option value="">+ 씬 등록…</option>
              {availableToAdd.map((s) => (
                <option key={s.number} value={s.number}>
                  #{s.number}. {cleanSceneHeading(s.heading) || "장소 미정"} ({s.page}p)
                </option>
              ))}
            </select>
          ) : (
            resolvedList.length === 0 && (
              <span className="beat-scene-empty-hint">오른쪽 서랍에서 씬을 끌어다 놓으세요</span>
            )
          )}
          </div>
        </div>
      </section>
    );
  };

  return (
    <main className="structure-view">
      {/* 상단 3막 구조 흐름 바 */}
      <header className="structure-timeline-card">
        <div className="structure-timeline-head">
          <strong>전체 3막 구조 흐름</strong>
          <div className="structure-timeline-actions">
            <span className="structure-timeline-summary">
              배치된 씬 <strong>{assignedSceneNumbers.size}</strong> / {validScenes.length}개 · 예상{" "}
              <strong>{runtimeMinutes}</strong>분
            </span>
            {confirmReset ? (
              <span className="structure-reset-confirm">
                <span>기본값으로 초기화할까요?</span>
                <button
                  type="button"
                  className="structure-reset-yes"
                  onClick={handleResetStructure}
                >
                  초기화
                </button>
                <button
                  type="button"
                  className="structure-reset-no"
                  onClick={() => setConfirmReset(false)}
                >
                  취소
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="structure-reset-btn"
                title="세이브 더 캣 15단계 기본 구조로 초기화합니다"
                onClick={() => setConfirmReset(true)}
              >
                ↺ 3막 구조 초기화
              </button>
            )}
          </div>
        </div>
        <div className="structure-timeline-track">
          <div className="timeline-seg seg-act1" style={{ flex: 20 }}>
            <span>1막 · 설정</span>
          </div>
          <div className="timeline-seg seg-act2a" style={{ flex: 30 }}>
            <span>2막 전반 · 재미와 놀이 (상승의 구간)</span>
          </div>
          <div className="timeline-seg seg-act2b" style={{ flex: 30 }}>
            <span>2막 후반 · 위기 고조 (하강의 구간)</span>
          </div>
          <div className="timeline-seg seg-act3" style={{ flex: 20 }}>
            <span>3막 · 해결</span>
          </div>
        </div>
      </header>

      {/* 본문: 분할 없이 1막부터 순서대로 가로형 카드로 세로 배치 + 오른쪽 원고 씬 서랍 */}
      <div className="structure-board-body">
        <div className="structure-cards-stream">
          {([1, 2, 3] as const).map((act) => {
            const meta = ACT_META[act];
            const actBeats = board.beats.filter((b) => b.act === act);
            return (
              <section key={act} className={`structure-act-section ${meta.colorClass}`}>
                <div className="structure-act-header">
                  <div className="structure-act-header-left">
                    <h2 className="structure-act-title">{meta.title}</h2>
                    <span className="structure-act-count muted">{actBeats.length}단계</span>
                  </div>
                  <button
                    type="button"
                    className="structure-add-card-btn"
                    title={`${meta.title}에 새 카드 추가`}
                    onClick={() => addBeatCardToAct(act)}
                  >
                    + 카드 추가
                  </button>
                </div>
                <div className="structure-act-cards">
                  {actBeats.map((state) => renderBeatCard(state))}
                  <button
                    type="button"
                    className="structure-add-card-bottom"
                    onClick={() => addBeatCardToAct(act)}
                  >
                    + {meta.title}에 카드 추가
                  </button>
                </div>
              </section>
            );
          })}
        </div>

        {/* 오른쪽: 원고 씬 서랍 */}
        <aside className="structure-drawer" aria-label="원고 씬 서랍">
          <div className="structure-drawer-header">
            <div className="structure-drawer-title-row">
              <h2>원고 씬 서랍</h2>
              <div className="structure-drawer-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={drawerFilter === "unassigned"}
                  className={drawerFilter === "unassigned" ? "active" : ""}
                  onClick={() => setDrawerFilter("unassigned")}
                >
                  미배치 {validScenes.length - assignedSceneNumbers.size}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={drawerFilter === "all"}
                  className={drawerFilter === "all" ? "active" : ""}
                  onClick={() => setDrawerFilter("all")}
                >
                  전체 {validScenes.length}
                </button>
              </div>
            </div>
            {selectedSceneNums.length > 0 ? (
              <div className="structure-drawer-selection-bar">
                <span>
                  <strong>{selectedSceneNums.length}개 씬</strong> 선택됨 · 끌어서 카드로 이동
                </span>
                <button
                  type="button"
                  className="structure-drawer-clear-sel"
                  onClick={() => setSelectedSceneNums([])}
                >
                  선택 해제
                </button>
              </div>
            ) : (
              <p className="structure-drawer-hint">
                클릭해 여러 씬을 한꺼번에 옮기거나, 카드의 씬을 ⌘+드래그해 다른 카드에 복제할 수 있습니다
              </p>
            )}
          </div>

          <div className="structure-drawer-list">
            {validScenes.length === 0 ? (
              <p className="panel-empty">
                아직 원고에 씬헤딩(⌘1)이 없습니다. 시놉시스만 먼저 적어 두고 나중에 씬을 배치해도 됩니다.
              </p>
            ) : drawerScenes.length === 0 ? (
              <p className="panel-empty">모든 씬이 카드에 배치되었습니다.</p>
            ) : (
              drawerScenes.map((scene) => {
                const placedIn = sceneToBeatLabels.get(scene.number) ?? [];
                const isSelected = selectedSet.has(scene.number);
                return (
                  <div
                    key={scene.line}
                    className={`drawer-scene-card${isSelected ? " selected" : ""}`}
                    onPointerDown={(e) => onDrawerScenePointerDown(e, scene)}
                    title={`${scene.heading}\n클릭하면 선택/해제되고, 여러 개 선택한 뒤 한꺼번에 왼쪽 카드로 끌어 옮길 수 있습니다.`}
                  >
                    <div className="drawer-scene-top">
                      <div className="drawer-scene-select-row">
                        <span
                          className={`drawer-scene-check${isSelected ? " checked" : ""}`}
                          aria-hidden="true"
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                        <span className="scene-number">#{scene.number}.</span>
                        <span className="drawer-scene-name">
                          {cleanSceneHeading(scene.heading) || "장소 미정"}
                        </span>
                      </div>
                    </div>
                    <div className="drawer-scene-meta">
                      <span>
                        {scene.page}p · {formatEighths(scene.eighths)}
                      </span>
                      {placedIn.length > 0 && (
                        <span className="drawer-scene-placed" title={placedIn.join(", ")}>
                          {placedIn[0]}
                          {placedIn.length > 1 ? ` 외 ${placedIn.length - 1}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {drag && drag.scenes.length > 0 && (
        <div className="tree-drag-ghost" style={{ left: drag.x + 12, top: drag.y + 8 }}>
          {drag.fromBeatId && drag.copyMode && (
            <span className="drag-copy-badge">+ 복제</span>
          )}
          {drag.scenes.length === 1 ? (
            <>
              <strong>#{drag.scenes[0].number}.</strong>{" "}
              {cleanSceneHeading(drag.scenes[0].heading)}
            </>
          ) : (
            <>
              <strong>#{drag.scenes[0].number}.</strong> 외 {drag.scenes.length - 1}개 씬 (
              {drag.scenes.length}개 한꺼번에 이동)
            </>
          )}
        </div>
      )}
    </main>
  );
}
