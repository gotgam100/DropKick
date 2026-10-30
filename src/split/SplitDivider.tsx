import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { clampRatio } from "./paneTargets";

type Props = {
  ratio: number;
  /** 두 화면을 감싼 영역 (비율을 계산하는 기준) */
  containerRef: React.RefObject<HTMLElement | null>;
  onChange: (ratio: number) => void;
  style?: CSSProperties;
};

/** 두 화면 사이의 경계선. 끌어서 너비를 바꾼다. (맥 앱에서는 HTML5 드래그가 안 되므로 포인터 이벤트를 쓴다) */
export function SplitDivider({ ratio, containerRef, onChange, style }: Props) {
  const dragging = useRef(false);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const box = containerRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return;
    onChange(clampRatio((e.clientX - box.left) / box.width));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") onChange(clampRatio(ratio - 0.02));
    else if (e.key === "ArrowRight") onChange(clampRatio(ratio + 0.02));
    else if (e.key === "Home" || e.key === "Enter") onChange(0.5);
    else return;
    e.preventDefault();
  };

  return (
    <div
      className="pane-divider"
      role="separator"
      aria-orientation="vertical"
      aria-label="화면 너비 조절"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={25}
      aria-valuemax={75}
      tabIndex={0}
      title="끌어서 너비 조절 (두 번 누르면 반반)"
      style={style}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.classList.add("pane-resizing");
      }}
      onPointerMove={move}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
        document.body.classList.remove("pane-resizing");
      }}
      onPointerCancel={() => {
        dragging.current = false;
        document.body.classList.remove("pane-resizing");
      }}
      onDoubleClick={() => onChange(0.5)}
      onKeyDown={onKeyDown}
    />
  );
}
