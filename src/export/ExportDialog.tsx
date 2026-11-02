import { useEffect, useState } from "react";
import { DOC_TYPE_LABELS, type DocNode } from "../project/model";

type Props = {
  format: "pdf" | "docx";
  /** 원고 이름 */
  scriptName: string;
  /** 원고 말고 함께 담을 수 있는 문서들 (트리 순서) */
  docs: DocNode[];
  /** reveal이 true이면 내보낸 뒤 Finder에서 그 파일을 보여 준다 */
  onExport: (script: boolean, docIds: string[], reveal: boolean) => void;
  onClose: () => void;
};

/** 내보내기: 무엇을 담을지 고른다. */
export function ExportDialog({ format, scriptName, docs, onExport, onClose }: Props) {
  const [script, setScript] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const label = format === "pdf" ? "PDF" : "Word";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const ids = docs.filter((d) => picked.has(d.id)).map((d) => d.id);
  const allPicked = docs.length > 0 && ids.length === docs.length;

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-label={`${label}로 내보내기`}
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          onExport(script, ids, false);
          onClose();
        }}
      >
        <h2>{label}로 내보내기</h2>
        <p className="dialog-hint">
          담을 것을 고르세요. 고른 문서는 원고 뒤에 한 문서씩 새 페이지로 이어 붙습니다.
        </p>
        <div className="export-list">
          <label className="export-row">
            <input type="checkbox" checked={script} onChange={(e) => setScript(e.target.checked)} />
            <span>{scriptName}</span>
            <em>원고와 표지</em>
          </label>
          {docs.length > 0 && (
            <>
              <div className="export-sep">
                <span>다른 문서</span>
                <button
                  type="button"
                  className="export-all"
                  onClick={() => setPicked(allPicked ? new Set() : new Set(docs.map((d) => d.id)))}
                >
                  {allPicked ? "모두 해제" : "모두 선택"}
                </button>
              </div>
              {docs.map((doc) => (
                <label key={doc.id} className="export-row">
                  <input type="checkbox" checked={picked.has(doc.id)} onChange={() => toggle(doc.id)} />
                  <span>{doc.name}</span>
                  <em>{doc.type === "structure" ? "3막 구조 (표)" : DOC_TYPE_LABELS[doc.type]}</em>
                </label>
              ))}
            </>
          )}
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button
            type="button"
            disabled={!script && ids.length === 0}
            onClick={() => {
              onExport(script, ids, true);
              onClose();
            }}
          >
            내보내고 폴더 열기
          </button>
          <button type="submit" className="primary" disabled={!script && ids.length === 0}>
            내보내기
          </button>
        </div>
      </form>
    </div>
  );
}
