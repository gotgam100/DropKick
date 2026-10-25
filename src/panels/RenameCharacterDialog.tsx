import { useEffect, useRef, useState } from "react";

type Props = {
  name: string;
  /** 바꿀 곳 수 미리 세기 */
  preview: (newName: string, everywhere: boolean) => { characterLines: number; textHits: number };
  hasProfile: boolean;
  onApply: (newName: string, everywhere: boolean) => void;
  onClose: () => void;
};

/** 원고 전체에서 인물 이름 바꾸기 */
export function RenameCharacterDialog({ name, preview, hasProfile, onApply, onClose }: Props) {
  const [value, setValue] = useState(name);
  const [everywhere, setEverywhere] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const next = value.trim();
  const counts = preview(next || name, everywhere);
  const unchanged = !next || next === name;

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
        aria-label="인물 이름 바꾸기"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (unchanged) return;
          onApply(next, everywhere);
          onClose();
        }}
      >
        <h2>인물 이름 바꾸기</h2>
        <p className="dialog-hint">원고 전체에서 "{name}"을(를) 새 이름으로 바꿉니다. 바꾼 뒤 ⌘Z로 한 번에 되돌릴 수 있습니다.</p>
        <label className="dialog-field">
          <span>새 이름</span>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
        </label>
        <label className="dialog-check">
          <input type="checkbox" checked={everywhere} onChange={(e) => setEverywhere(e.target.checked)} />
          지문과 대사 속 이름도 바꾸기
        </label>
        <p className="dialog-hint">
          인물 이름 줄 {counts.characterLines}곳
          {everywhere && `, 지문·대사 속 ${counts.textHits}곳`}이 바뀝니다.
          {hasProfile && " 같은 이름의 인물 설정 문서 이름도 함께 바뀝니다."}
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary" disabled={unchanged}>
            바꾸기
          </button>
        </div>
      </form>
    </div>
  );
}
