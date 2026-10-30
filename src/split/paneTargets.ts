/**
 * 화면 나누기: 두 화면(화면 1 = 왼쪽, 화면 2 = 오른쪽)에 무엇을 보여줄지에 대한 규칙.
 * 화면 1과 2는 같은 역할이며, 원고와 같은 문서는 한 번에 한 화면에만 열 수 있다.
 * (원고 편집기는 앱 전체에 하나뿐이고, 같은 문서를 두 곳에서 고치면 서로 덮어쓰기 때문)
 */

export type PaneTarget =
  | { kind: "script" }
  | { kind: "doc"; id: string }
  | { kind: "revision"; id: string }
  | { kind: "stats" };

export type PaneIndex = 0 | 1;

export type PaneState = {
  /** 화면을 둘로 나눴는지. false이면 화면 1만 보인다. */
  split: boolean;
  panes: [PaneTarget, PaneTarget];
  /** 키보드·툴바가 향하는 화면 */
  focus: PaneIndex;
  /** 화면 1이 차지하는 너비 비율 (0.25 ~ 0.75) */
  ratio: number;
};

export const MIN_RATIO = 0.25;
export const MAX_RATIO = 0.75;

export const INITIAL_PANES: PaneState = {
  split: false,
  panes: [{ kind: "script" }, { kind: "stats" }],
  focus: 0,
  ratio: 0.5,
};

export function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio));
}

export function sameTarget(a: PaneTarget, b: PaneTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "doc" || a.kind === "revision") return a.id === (b as { id: string }).id;
  return true;
}

/** 원고가 보이는 화면 번호 (화면을 나누지 않았으면 화면 1만 본다) */
export function scriptPane(state: PaneState): PaneIndex | null {
  if (state.panes[0].kind === "script") return 0;
  if (state.split && state.panes[1].kind === "script") return 1;
  return null;
}

export function visiblePanes(state: PaneState): PaneIndex[] {
  return state.split ? [0, 1] : [0];
}

/** 보이는 화면 중 이 대상을 열어 둔 화면 */
export function paneShowing(state: PaneState, target: PaneTarget): PaneIndex | null {
  for (const i of visiblePanes(state)) if (sameTarget(state.panes[i], target)) return i;
  return null;
}

/**
 * 한 화면에 대상을 연다.
 * 다른 화면이 이미 같은 것을 열고 있으면 두 화면의 내용을 서로 바꾼다.
 * (같은 문서를 두 곳에서 열지 않기 위해서)
 */
export function showInPane(state: PaneState, index: PaneIndex, target: PaneTarget): PaneState {
  const other: PaneIndex = index === 0 ? 1 : 0;
  const panes: [PaneTarget, PaneTarget] = [state.panes[0], state.panes[1]];
  if (sameTarget(panes[other], target)) panes[other] = panes[index];
  panes[index] = target;
  return { ...state, panes, focus: index };
}

/** 화면 나누기 켜기/끄기. 켤 때 화면 2에 무엇이 열릴지는 `second`로 정한다. */
export function setSplit(state: PaneState, on: boolean, second?: PaneTarget): PaneState {
  if (on === state.split) return state;
  if (!on) {
    // 포커스가 있던 화면의 내용을 남긴다.
    const keep = state.panes[state.focus];
    return { ...state, split: false, panes: [keep, state.panes[1]], focus: 0 };
  }
  const first = state.panes[0];
  const target = second ?? defaultSecond(first);
  // 나누기만 켰을 뿐이므로 지금 보던 화면(화면 1)에 포커스를 둔다.
  return { ...showInPane({ ...state, split: true }, 1, target), focus: 0 };
}

function defaultSecond(first: PaneTarget): PaneTarget {
  return first.kind === "script" ? { kind: "stats" } : { kind: "script" };
}

/** 한 화면을 닫는다: 화면 나누기를 끄고 남은 화면의 내용을 화면 1에 둔다. */
export function closePane(state: PaneState, index: PaneIndex): PaneState {
  if (!state.split) return state;
  const keep = state.panes[index === 0 ? 1 : 0];
  return { ...state, split: false, panes: [keep, state.panes[index]], focus: 0 };
}

/** 두 화면의 내용을 서로 바꾼다. */
export function swapPanes(state: PaneState): PaneState {
  if (!state.split) return state;
  return { ...state, panes: [state.panes[1], state.panes[0]], focus: state.focus === 0 ? 1 : 0 };
}

/**
 * 원고 곁에 대상(3막 구조, 통계 등)을 연다.
 * - 이미 어느 화면에 열려 있으면 그 화면에 포커스만 준다.
 * - 원고가 보이는 화면의 반대쪽에 연다. 원고가 안 보이면 원고를 화면 1에, 대상을 화면 2에 둔다.
 */
export function openBesideScript(state: PaneState, target: PaneTarget): PaneState {
  const existing = paneShowing(state, target);
  if (existing !== null) return { ...state, focus: existing };
  const script = scriptPane(state);
  if (state.split && script !== null) {
    return showInPane(state, script === 0 ? 1 : 0, target);
  }
  if (!state.split && script === 0) {
    return showInPane({ ...state, split: true }, 1, target);
  }
  // 원고가 안 보이는 상태
  const next = showInPane({ ...state, split: true }, 0, { kind: "script" });
  return showInPane(next, 1, target);
}

/**
 * 원고를 보이게 한다 (구조 보드에서 씬을 눌렀을 때).
 * 이미 보이면 그 화면에 포커스를 주고, 아니면 지금 포커스가 없는 쪽(나누지 않았다면 화면 1)에 연다.
 * `keep`이 true를 돌려주는 내용(3막 구조 보드 등)은 덮어쓰지 않고, 다른 화면에 연다.
 */
export function revealScript(state: PaneState, keep: (target: PaneTarget) => boolean = () => false): PaneState {
  const script = scriptPane(state);
  if (script !== null) return { ...state, focus: script };
  if (!state.split) return showInPane(state, 0, { kind: "script" });
  const other: PaneIndex = state.focus === 0 ? 1 : 0;
  const index = keep(state.panes[other]) && !keep(state.panes[state.focus]) ? state.focus : other;
  return showInPane(state, index, { kind: "script" });
}

/** 저장해 둔 값을 믿지 않고 검사한다. 사라진 문서나 수정고를 가리키면 원고로 바꾼다. */
export function normalizePanes(
  state: PaneState,
  valid: { docIds: ReadonlySet<string>; revisionIds: ReadonlySet<string>; mainScriptId: string },
): PaneState {
  const fix = (t: PaneTarget): PaneTarget => {
    if (t.kind === "doc") {
      if (t.id === valid.mainScriptId) return { kind: "script" };
      return valid.docIds.has(t.id) ? t : { kind: "script" };
    }
    if (t.kind === "revision") return valid.revisionIds.has(t.id) ? t : { kind: "script" };
    return t;
  };
  let first = fix(state.panes[0]);
  let second = fix(state.panes[1]);
  // 같은 것이 두 화면에 열려 있으면 화면 2는 다른 것으로 바꾼다.
  if (sameTarget(first, second)) second = first.kind === "script" ? { kind: "stats" } : { kind: "script" };
  if (first === state.panes[0] && second === state.panes[1]) return state;
  return { ...state, panes: [first, second] };
}

/** 앱 설정에 저장할 값으로 바꾸고 되돌린다. */
export function serializePanes(state: PaneState): string {
  return JSON.stringify({ v: 1, split: state.split, panes: state.panes, focus: state.focus, ratio: state.ratio });
}

function parseTarget(value: unknown): PaneTarget | null {
  if (!value || typeof value !== "object") return null;
  const v = value as { kind?: unknown; id?: unknown };
  if (v.kind === "script" || v.kind === "stats") return { kind: v.kind };
  if ((v.kind === "doc" || v.kind === "revision") && typeof v.id === "string") return { kind: v.kind, id: v.id };
  return null;
}

export function parsePanes(raw: string | null): PaneState {
  if (!raw) return INITIAL_PANES;
  try {
    const data = JSON.parse(raw) as { split?: unknown; panes?: unknown; focus?: unknown; ratio?: unknown };
    const list = Array.isArray(data.panes) ? data.panes.map(parseTarget) : [];
    const a = list[0] ?? INITIAL_PANES.panes[0];
    const b = list[1] ?? INITIAL_PANES.panes[1];
    return {
      split: data.split === true,
      panes: [a, b],
      focus: data.focus === 1 && data.split === true ? 1 : 0,
      ratio: clampRatio(typeof data.ratio === "number" ? data.ratio : 0.5),
    };
  } catch {
    return INITIAL_PANES;
  }
}
