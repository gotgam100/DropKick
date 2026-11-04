import { useRef, type KeyboardEvent, type PointerEvent } from "react";

/** 사이드바 폭: 기본, 가장 좁게, 가장 넓게 (px) */
export const SIDEBAR_DEFAULT = 320;
export const SIDEBAR_MIN = 240;
export const SIDEBAR_MAX = 560;

const STORAGE_KEY = "dropkick.sidebar.width";

export function clampSidebar(width: number, windowWidth = Infinity): number {
  // 창이 좁으면 원고가 너무 좁아지지 않게 창 폭의 절반까지만
  const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, windowWidth * 0.5));
  return Math.round(Math.min(max, Math.max(SIDEBAR_MIN, width)));
}

export function loadSidebarWidth(): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_KEY));
    if (Number.isFinite(n) && n > 0) return clampSidebar(n);
  } catch {
    // 저장소를 못 읽으면 기본 폭
  }
  return SIDEBAR_DEFAULT;
}

export function saveSidebarWidth(width: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // 저장하지 못해도 이번에는 그대로 쓴다
  }
}

type Props = {
  width: number;
  onChange: (width: number) => void;
  /** 끌기를 마쳤을 때 (이때 저장한다) */
  onCommit: (width: number) => void;
};

/** 사이드바 오른쪽 경계선. 끌어서 폭을 바꾼다. 두 번 누르면 기본 폭. (맥 앱에서는 HTML5 드래그가 안 되므로 포인터 이벤트를 쓴다) */
export function SidebarResizer({ width, onChange, onCommit }: Props) {
  const dragging = useRef(false);

  const next = (clientX: number) => clampSidebar(clientX, window.innerWidth);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let to: number;
    if (e.key === "ArrowLeft") to = clampSidebar(width - 16, window.innerWidth);
    else if (e.key === "ArrowRight") to = clampSidebar(width + 16, window.innerWidth);
    else if (e.key === "Home" || e.key === "Enter") to = SIDEBAR_DEFAULT;
    else return;
    e.preventDefault();
    onChange(to);
    onCommit(to);
  };

  return (
    <div className="sidebar-resizer-slot">
      <div
        className="sidebar-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="사이드바 너비 조절"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN}
        aria-valuemax={SIDEBAR_MAX}
        tabIndex={0}
        title="끌어서 사이드바 너비 조절 (두 번 누르면 기본 너비)"
        onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
          dragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          document.body.classList.add("pane-resizing");
        }}
        onPointerMove={(e) => {
          if (dragging.current) onChange(next(e.clientX));
        }}
        onPointerUp={(e) => {
          if (!dragging.current) return;
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
          document.body.classList.remove("pane-resizing");
          onCommit(next(e.clientX));
        }}
        onPointerCancel={() => {
          dragging.current = false;
          document.body.classList.remove("pane-resizing");
        }}
        onDoubleClick={() => {
          onChange(SIDEBAR_DEFAULT);
          onCommit(SIDEBAR_DEFAULT);
        }}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
