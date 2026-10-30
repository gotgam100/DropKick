import { useEffect, useLayoutEffect, useRef, useState } from "react";

type Props = {
  /** 메모를 붙인 글 */
  quote: string;
  /** 메모를 붙인 글이 화면에서 차지하는 곳. 창은 이 글을 가리지 않게 그 아래(자리가 없으면 위)에 뜬다. */
  anchor: { top: number; bottom: number; left: number; right: number } | null;
  /** 새 메모면 비어 있다 */
  initialText: string;
  isNew: boolean;
  onSave: (text: string) => void;
  onDelete: () => void;
  onClose: () => void;
};

/** 원고 글에 붙이는 메모 창 */
export function NoteDialog({ quote, anchor, initialText, isNew, onSave, onDelete, onClose }: Props) {
  const [text, setText] = useState(initialText);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  // 제목줄을 끌어서 창 위치를 옮긴다. (맥 앱에서는 HTML5 드래그가 안 되므로 포인터 이벤트를 쓴다)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // 처음 뜰 위치: 고른 글의 아래쪽. 아래에 자리가 없으면 위쪽.
  useLayoutEffect(() => {
    const box = formRef.current?.getBoundingClientRect();
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

  useEffect(() => {
    areaRef.current?.focus();
    areaRef.current?.setSelectionRange(initialText.length, initialText.length);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const canSave = text.trim() !== "";
  const save = () => {
    if (!canSave) return;
    onSave(text.trim());
    onClose();
  };

  return (
    <div className="dialog-backdrop note-backdrop" onMouseDown={onClose}>
      <form
        className="dialog note-dialog"
        role="dialog"
        aria-label="메모"
        ref={formRef}
        style={pos ? { left: pos.x, top: pos.y } : { visibility: "hidden" }}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2
          className="note-drag-handle"
          title="끌어서 위치 옮기기"
          onPointerDown={(e) => {
            if (pos) drag.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) setPos({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y });
          }}
          onPointerUp={(e) => {
            drag.current = null;
            e.currentTarget.releasePointerCapture(e.pointerId);
          }}
        >
          메모
        </h2>
        <p className="note-quote">“{quote.length > 80 ? `${quote.slice(0, 80)}…` : quote}”</p>
        <label className="dialog-field">
          <textarea
            ref={areaRef}
            rows={8}
            value={text}
            placeholder="이 부분에 대한 메모를 적으세요"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                save();
              }
            }}
          />
        </label>
        <div className="dialog-actions">
          {isNew ? (
            <button type="button" onClick={onClose}>
              취소
            </button>
          ) : (
            <button
              type="button"
              className="danger"
              onClick={() => {
                onDelete();
                onClose();
              }}
            >
              삭제
            </button>
          )}
          <button type="submit" className="primary" disabled={!canSave}>
            저장
          </button>
        </div>
      </form>
    </div>
  );
}
