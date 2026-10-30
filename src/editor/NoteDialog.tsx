import { useEffect, useRef, useState } from "react";
import { useFloatingPosition, type Anchor } from "./useFloatingPosition";

type Props = {
  /** 메모를 붙인 글 */
  quote: string;
  /** 메모를 붙인 글이 화면에서 차지하는 곳. 창은 이 글을 가리지 않게 그 아래(자리가 없으면 위)에 뜬다. */
  anchor: Anchor | null;
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
  const formRef = useRef<HTMLFormElement>(null);
  const { style, handleProps } = useFloatingPosition(anchor, formRef);

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
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2
          className="note-drag-handle"
          title="끌어서 위치 옮기기"
          {...handleProps}
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
