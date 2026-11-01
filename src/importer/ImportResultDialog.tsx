import { useEffect } from "react";
import type { ImportReport, ReviewItem, ReviewKind } from "./types";

export type ImportResult = {
  /** 가져온 파일 이름 (확장자 없이) */
  fileName: string;
  kind: "pdf" | "docx" | "hwpx";
  report: ImportReport;
};

const GROUPS: { kind: ReviewKind; title: string; hint: string }[] = [
  {
    kind: "no-scene",
    title: "씬헤딩을 찾지 못했습니다",
    hint: "모든 글이 액션으로 들어갔을 수 있습니다. 원고를 처음부터 훑어보며 씬헤딩 줄을 지정해 주세요.",
  },
  {
    kind: "no-character",
    title: "인물 이름을 찾지 못했습니다",
    hint: "대사가 액션으로 들어갔을 수 있습니다. 인물 이름과 대사 줄의 스타일을 확인해 주세요.",
  },
  {
    kind: "orphan-dialogue",
    title: "대사 자리에 있지만 인물 이름이 없는 글",
    hint: "액션으로 넣었습니다. 대사라면 앞에 인물 이름을 적고 줄 스타일을 바꿔 주세요.",
  },
  {
    kind: "lonely-name",
    title: "인물 이름처럼 보이지만 대사가 이어지지 않는 줄",
    hint: "액션으로 넣었습니다. 인물 이름이 맞다면 인물 스타일로 바꿔 주세요.",
  },
];

const SHOWN = 6;

function ReviewList({ items }: { items: ReviewItem[] }) {
  if (items.every((i) => !i.text)) return null;
  return (
    <ul className="import-review-list">
      {items.slice(0, SHOWN).map((item, i) => (
        <li key={i}>
          <span className="import-page">{item.page}쪽</span>
          <span className="import-quote">{item.text}</span>
        </li>
      ))}
      {items.length > SHOWN && <li className="import-more">외 {items.length - SHOWN}곳</li>}
    </ul>
  );
}

/** 외부 시나리오 가져오기가 끝난 뒤 보여 주는 결과 창: 요약 → 확인하면 좋은 곳 → 안내 */
export function ImportResultDialog({ result, onClose }: { result: ImportResult; onClose: () => void }) {
  const { report } = result;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (e.key === "Escape" || e.key === "Enter") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = GROUPS.map((g) => ({ ...g, items: report.review.filter((r) => r.kind === g.kind) })).filter((g) => g.items.length > 0);

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div className="dialog import-result" role="dialog" aria-label="가져오기 결과" onMouseDown={(e) => e.stopPropagation()}>
        <h2>가져오기 결과</h2>
        <p className="import-source">
          {result.fileName} <span className="import-badge">{result.kind === "pdf" ? "PDF" : result.kind === "hwpx" ? "한글" : "Word"}</span>
        </p>

        <section className="import-section">
          <h3>가져온 내용</h3>
          <div className="import-stats">
            <div>
              <strong>{report.scenes}</strong>
              <span>씬</span>
            </div>
            <div>
              <strong>{report.characters.length}</strong>
              <span>인물</span>
            </div>
            <div>
              <strong>{report.dialogues}</strong>
              <span>대사</span>
            </div>
            <div>
              <strong>{report.actions}</strong>
              <span>액션</span>
            </div>
          </div>
          {report.characters.length > 0 && (
            <p className="import-names">
              <span>등장 인물</span> {report.characters.join(", ")}
            </p>
          )}
          {report.removed > 0 && <p className="import-note">쪽 번호·머리말 등 {report.removed}줄은 원고에서 뺐습니다.</p>}
        </section>

        <section className="import-section">
          <h3>
            확인하면 좋은 곳 <span className="import-count">{report.review.length}</span>
          </h3>
          {groups.length === 0 ? (
            <p className="import-ok">어색해 보이는 곳을 찾지 못했습니다.</p>
          ) : (
            groups.map((g) => (
              <div className="import-group" key={g.kind}>
                <p className="import-group-title">
                  {g.title} <span className="import-count">{g.items.length}</span>
                </p>
                <p className="import-group-hint">{g.hint}</p>
                <ReviewList items={g.items} />
              </div>
            ))
          )}
        </section>

        <section className="import-section import-guide">
          <h3>안내</h3>
          <ul>
            <li>글자의 위치와 모양으로 줄 스타일을 짐작한 결과라, 문서에 따라 틀릴 수 있습니다.</li>
            <li>왼쪽 씬 목록과 오른쪽 통계(인물별 대사량)를 보며 한 번 훑어봐 주세요.</li>
            <li>원래 파일은 그대로이고, 저장하면 새 프로젝트로 만들어집니다.</li>
          </ul>
        </section>

        <div className="dialog-actions">
          <button type="button" className="primary" autoFocus onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
