/**
 * 수정고 보기: 원고(읽기 전용), 설정 문서, 다른 고나 지금 원고와 비교.
 * 이 고로 되돌리기, PDF로 내보내기, 지우기.
 */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import type { ScriptLine } from "../editor/lineStyles";
import { STYLE_LABELS } from "../editor/styles";
import { ScriptPreview } from "../editor/ScriptPreview";
import { fromFountain } from "../fountain/fountain";
import { isLineStyle } from "../editor/styles";
import type { RevisionMeta } from "../project/model";
import { compareScripts, diffText, type LineOp } from "./diff";
import type { RevisionContent } from "./revisions";

export type Snapshot = { name: string; lines: ScriptLine[]; docs: RevisionContent["docs"]; pages?: number; runtime?: number };

type Props = {
  meta: RevisionMeta;
  revisions: RevisionMeta[];
  load: (meta: RevisionMeta) => Promise<RevisionContent | null>;
  current: () => Snapshot;
  onRestore: () => void;
  onExportPdf: (script: string) => void;
  onDelete: () => void;
};

const linesOf = (script: string) => fromFountain(script).lines.filter((l) => isLineStyle(l.style));
const when = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

function DiffLines({ ops, context = 1 }: { ops: LineOp[]; context?: number }) {
  // 바뀐 줄 앞뒤 context줄만 보여 주고, 나머지 같은 줄은 접는다.
  const keep = ops.map((op, i) => op.kind !== "same" || ops.slice(Math.max(0, i - context), i + context + 1).some((o) => o.kind !== "same"));
  const rows: ReactElement[] = [];
  let hidden = 0;
  ops.forEach((op, i) => {
    if (!keep[i]) {
      hidden++;
      return;
    }
    if (hidden > 0) {
      rows.push(<div key={`h${i}`} className="diff-fold">… 같은 줄 {hidden}개</div>);
      hidden = 0;
    }
    rows.push(
      <div key={i} className={`diff-line diff-${op.kind}`}>
        <span className="diff-mark">{op.kind === "add" ? "+" : op.kind === "del" ? "−" : ""}</span>
        <span className="diff-style">{STYLE_LABELS[op.line.style]}</span>
        <span className="diff-text">{op.line.text || " "}</span>
      </div>,
    );
  });
  if (hidden > 0) rows.push(<div key="h-end" className="diff-fold">… 같은 줄 {hidden}개</div>);
  return <div className="diff-lines">{rows}</div>;
}

function Comparison({ before, after }: { before: Snapshot; after: Snapshot }) {
  const script = useMemo(() => compareScripts(before.lines, after.lines), [before, after]);
  const docChanges = useMemo(() => {
    const beforeById = new Map(before.docs.map((d) => [d.doc.id, d]));
    const afterById = new Map(after.docs.map((d) => [d.doc.id, d]));
    const out: { name: string; kind: "added" | "removed" | "changed"; ops: LineOp[] }[] = [];
    for (const d of after.docs) {
      const old = beforeById.get(d.doc.id);
      if (!old) out.push({ name: d.doc.name, kind: "added", ops: diffText("", d.text) });
      else if (old.text !== d.text || old.doc.name !== d.doc.name)
        out.push({ name: d.doc.name, kind: "changed", ops: diffText(old.text, d.text) });
    }
    for (const d of before.docs) if (!afterById.has(d.doc.id)) out.push({ name: d.doc.name, kind: "removed", ops: diffText(d.text, "") });
    return out;
  }, [before, after]);
  const same = script.scenes.filter((s) => s.kind === "same").length;
  const label = { added: "추가", removed: "삭제", changed: "변경", same: "같음" } as const;

  return (
    <div className="compare">
      <div className="compare-summary">
        <strong>{before.name}</strong> → <strong>{after.name}</strong>
        <span>씬 추가 {script.addedScenes}</span>
        <span>삭제 {script.removedScenes}</span>
        <span>변경 {script.changedScenes}</span>
        <span>
          줄 <em className="plus">+{script.addedLines}</em> <em className="minus">−{script.removedLines}</em>
        </span>
        {before.pages !== undefined && after.pages !== undefined && (
          <span>
            페이지 {before.pages} → {after.pages}
          </span>
        )}
        {before.runtime !== undefined && after.runtime !== undefined && (
          <span>
            러닝타임 약 {before.runtime}분 → {after.runtime}분
          </span>
        )}
      </div>

      <h3>원고</h3>
      {script.scenes.every((s) => s.kind === "same") && <p className="panel-empty">원고는 바뀐 곳이 없습니다.</p>}
      {script.scenes
        .filter((s) => s.kind !== "same")
        .map((scene, i) => (
          <section key={`${scene.key}-${i}`} className={`compare-scene compare-${scene.kind}`}>
            <header>
              <span className="compare-badge">{label[scene.kind]}</span>
              {scene.number > 0 && (
                <span className="scene-number">
                  {scene.kind === "removed" ? "옛 " : ""}S#{scene.number}
                </span>
              )}
              <span className="compare-heading">{scene.heading.replace(/^\s*S\s*#\s*\d+\.?\s*/i, "") || "(첫 씬 앞)"}</span>
              <span className="compare-counts">
                {scene.added > 0 && <em className="plus">+{scene.added}</em>} {scene.removed > 0 && <em className="minus">−{scene.removed}</em>}
              </span>
            </header>
            <DiffLines ops={scene.ops} />
          </section>
        ))}
      {same > 0 && <p className="compare-same">바뀌지 않은 씬 {same}개</p>}

      <h3>설정 문서</h3>
      {docChanges.length === 0 ? (
        <p className="panel-empty">설정 문서는 바뀐 곳이 없습니다.</p>
      ) : (
        docChanges.map((d, i) => (
          <section key={i} className={`compare-scene compare-${d.kind}`}>
            <header>
              <span className="compare-badge">{label[d.kind]}</span>
              <span className="compare-heading">{d.name}</span>
            </header>
            <DiffLines ops={d.ops.map((o) => ({ ...o, line: { ...o.line, style: "action" } }))} />
          </section>
        ))
      )}
    </div>
  );
}

export function RevisionView({ meta, revisions, load, current, onRestore, onExportPdf, onDelete }: Props) {
  const [content, setContent] = useState<RevisionContent | null>(null);
  const [tab, setTab] = useState<string>("script");
  const [target, setTarget] = useState<string>("current");
  const [targetSnapshot, setTargetSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    let alive = true;
    setContent(null);
    setTab("script");
    load(meta).then((c) => alive && setContent(c));
    return () => {
      alive = false;
    };
  }, [meta, load]);

  const lines = useMemo(() => (content ? linesOf(content.script) : []), [content]);
  const mine: Snapshot | null = content
    ? { name: meta.name, lines, docs: content.docs, pages: meta.stats?.pages, runtime: meta.stats?.runtimeMinutes }
    : null;

  // 비교 대상 불러오기
  useEffect(() => {
    if (tab !== "compare") return;
    if (target === "current") {
      setTargetSnapshot({ ...current(), name: "지금 원고" });
      return;
    }
    const other = revisions.find((r) => r.id === target);
    if (!other) return;
    let alive = true;
    load(other).then((c) => {
      if (alive && c)
        setTargetSnapshot({ name: other.name, lines: linesOf(c.script), docs: c.docs, pages: other.stats?.pages, runtime: other.stats?.runtimeMinutes });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, target, load, revisions]);

  const doc = content?.docs.find((d) => d.doc.id === tab);

  return (
    <main className="revision-view">
      <header className="revision-header">
        <div className="revision-title">
          <span className="revision-kicker">수정고</span>
          <h2>{meta.name}</h2>
          <span className="revision-when">{when(meta.createdAt)}</span>
          {meta.stats && (
            <span className="revision-when">
              · {meta.stats.pages}페이지 · 씬 {meta.stats.scenes}개 · 약 {meta.stats.runtimeMinutes}분
            </span>
          )}
        </div>
        {meta.note && <p className="revision-note">{meta.note}</p>}
        <div className="revision-actions">
          <button type="button" className="primary" onClick={onRestore} disabled={!content}>
            이 고로 되돌리기
          </button>
          <button type="button" onClick={() => content && onExportPdf(content.script)} disabled={!content}>
            PDF로 내보내기
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            지우기
          </button>
        </div>
        <nav className="revision-tabs">
          <button type="button" className={tab === "script" ? "active" : ""} onClick={() => setTab("script")}>
            원고
          </button>
          {content?.docs.map((d) => (
            <button key={d.doc.id} type="button" className={tab === d.doc.id ? "active" : ""} onClick={() => setTab(d.doc.id)}>
              {d.doc.name}
            </button>
          ))}
          <button type="button" className={tab === "compare" ? "active compare-tab" : "compare-tab"} onClick={() => setTab("compare")}>
            비교
          </button>
        </nav>
      </header>

      <div className="revision-body">
        {!content ? (
          <p className="panel-empty">불러오는 중…</p>
        ) : tab === "script" ? (
          <div className="desk revision-desk">
            <ScriptPreview lines={lines} />
          </div>
        ) : tab === "compare" ? (
          <div className="revision-compare">
            <label className="compare-target">
              비교할 대상
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="current">지금 원고</option>
                {revisions
                  .filter((r) => r.id !== meta.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
            {mine && targetSnapshot ? <Comparison before={mine} after={targetSnapshot} /> : <p className="panel-empty">불러오는 중…</p>}
          </div>
        ) : doc ? (
          <article className="text-page revision-doc">
            <pre>{doc.text}</pre>
          </article>
        ) : null}
      </div>
    </main>
  );
}
