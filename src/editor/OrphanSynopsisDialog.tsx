import { useEffect } from "react";

type Props = {
  /** 주인이 없어진 요약 글 (이어진 줄들) */
  texts: string[];
  /** 합칠 앞 씬의 이름 (앞 씬이 없는 덩어리는 일반 글로 남는다) */
  target: string;
  onMerge: () => void;
  onKeep: () => void;
  onUndo: () => void;
};

/** 씬헤딩을 지웠을 때: 그 씬의 요약을 앞 씬의 요약으로 합칠지 묻는다. */
export function OrphanSynopsisDialog({ texts, target, onMerge, onKeep, onUndo }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onKeep();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKeep]);

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="alertdialog" aria-label="씬 요약 정리" onMouseDown={(e) => e.stopPropagation()}>
        <h2>이 요약이 속할 씬이 없어졌습니다</h2>
        <p className="dialog-hint">씬헤딩이 없어져서 아래 요약이 어느 씬에도 속하지 않게 되었습니다.</p>
        <blockquote className="orphan-quote">
          {texts.slice(0, 4).map((text, i) => (
            <div key={i}>{text || " "}</div>
          ))}
          {texts.length > 4 && <div>…</div>}
        </blockquote>
        <p className="dialog-hint">
          앞 씬 <strong>{target}</strong>의 요약으로 합칠까요? 합치지 않으면 요약 글은 일반 글(액션)로 남습니다.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onUndo}>
            되돌리기
          </button>
          <button type="button" onClick={onKeep}>
            합치지 않기
          </button>
          <button type="button" className="primary" onClick={onMerge} autoFocus>
            앞 씬에 합치기
          </button>
        </div>
      </div>
    </div>
  );
}
