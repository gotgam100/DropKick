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
    // 원고에 커서가 남아 있으면 메모로 친 글이 원고에 들어가 원고가 바뀐다. 먼저 원고에서 커서를 빼고,
    // 우클릭 메뉴가 닫히는 중에는 포커스가 안 들어갈 수 있어서 몇 번 더 시도한다.
    (document.activeElement as HTMLElement | null)?.blur();
    const focus = () => {
      const area = areaRef.current;
      if (!area || document.activeElement === area) return;
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    };
    focus();
    const timers = [30, 120, 300].map((ms) => window.setTimeout(focus, ms));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      // 메모 칸이 아닌 곳(원고)으로 들어가는 글자는 막고, 메모 칸으로 돌린다.
      if (!formRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
        areaRef.current?.focus();
      }
    };
    // 커서가 원고로 돌아가거나 글자가 원고에 들어가려 하면 막고 메모 칸으로 돌린다.
    const onFocusIn = (e: FocusEvent) => {
      if (!formRef.current?.contains(e.target as Node)) areaRef.current?.focus();
    };
    const onBeforeInput = (e: Event) => {
      if (!formRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
        areaRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("focusin", onFocusIn, true);
    window.addEventListener("beforeinput", onBeforeInput, true);
    window.addEventListener("compositionstart", onBeforeInput, true);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("beforeinput", onBeforeInput, true);
      window.removeEventListener("compositionstart", onBeforeInput, true);
    };
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
