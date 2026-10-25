import { useEffect, useRef, useState } from "react";

type Props = {
  defaultName: string;
  onCreate: (name: string, note: string) => void;
  onClose: () => void;
};

/** 새 고로 보관 */
export function NewRevisionDialog({ defaultName, onCreate, onClose }: Props) {
  const [name, setName] = useState(defaultName);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-label="새 고로 보관"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name, note);
          onClose();
        }}
      >
        <h2>새 고로 보관</h2>
        <p className="dialog-hint">
          지금 원고와 설정 문서(개요, 인물 설정)를 이름을 붙여 남겨 둡니다. 나중에 열어 보고, 지금 원고와 비교하고, 되돌릴 수 있습니다.
        </p>
        <label className="dialog-field">
          <span>이름</span>
          <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="dialog-field">
          <span>메모</span>
          <textarea
            rows={3}
            value={note}
            placeholder="예: 투자 미팅 전, 2막 구조 바꾸기 전"
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary" disabled={!name.trim()}>
            보관
          </button>
        </div>
      </form>
    </div>
  );
}
