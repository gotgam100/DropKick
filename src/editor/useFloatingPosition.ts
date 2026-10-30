import { useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";

export type Anchor = { top: number; bottom: number; left: number; right: number };

/**
 * 떠 있는 창의 위치. 처음에는 anchor(고른 글)를 가리지 않게 그 아래(자리가 없으면 위)에 놓고,
 * 제목줄을 끌어 옮길 수 있다. (맥 앱에서는 HTML5 드래그가 안 되므로 포인터 이벤트를 쓴다)
 */
export function useFloatingPosition(anchor: Anchor | null, ref: RefObject<HTMLElement | null>) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const gap = 16;
    const margin = 16;
    let y = Math.max(margin, (window.innerHeight - box.height) / 3);
    let x = (window.innerWidth - box.width) / 2;
    if (anchor) {
      x = Math.min(Math.max(margin, (anchor.left + anchor.right) / 2 - box.width / 2), window.innerWidth - box.width - margin);
      const below = anchor.bottom + gap;
      const above = anchor.top - gap - box.height;
      if (below + box.height <= window.innerHeight - margin) y = below;
      else if (above >= margin) y = above;
      else y = Math.max(margin, window.innerHeight - box.height - margin);
    }
    setPos({ x, y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProps = {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (!pos) return;
      drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (d) setPos({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      drag.current = null;
      e.currentTarget.releasePointerCapture(e.pointerId);
    },
  };
  const style = pos ? { left: pos.x, top: pos.y } : { visibility: "hidden" as const };
  return { style, handleProps };
}
