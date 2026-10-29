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

function Comparison({
  before,
  after,
  target,
  onChangeTarget,
  otherRevisions,
}: {
  before: Snapshot;
  after: Snapshot;
  target: string;
  onChangeTarget: (id: string) => void;
  otherRevisions: RevisionMeta[];
}) {
  const script = useMemo(() => compareScripts(before.lines, after.lines), [before, after]);
  const [scrollTo, setScrollTo] = useState<{ line: number; seq: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
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
  const label = { added: "새 씬", removed: "삭제 포함", changed: "고친 씬", same: "그대로" } as const;
  const docLabel = { added: "추가", removed: "삭제", changed: "변경" } as const;

  // 막대는 비교 대상 원고(after) 하나를 기준으로: 1씬(S#1~) = 1막대.
  // 첫 씬 앞(FADE IN: 등, number === 0)이나 지운 옛 씬은 해당 자리의 실제 씬 막대에 합쳐서 표시한다.
  const barScenes = useMemo(() => {
    const realScenes = script.scenes.filter((s) => s.kind !== "removed" && s.number > 0);
    const base = realScenes.length > 0 ? realScenes : script.scenes.filter((s) => s.kind !== "removed");
    const present = base.map((s) => ({ ...s, deletedScenes: [] as typeof script.scenes }));
    if (present.length === 0) return present;
    // 첫 씬 앞(number === 0)에 수정이 있으면 S#1 막대에 합친다.
    for (const pre of script.scenes.filter((s) => s.kind !== "removed" && s.number === 0 && realScenes.length > 0)) {
      present[0].added += pre.added;
      present[0].removed += pre.removed;
      if (pre.kind !== "same" && present[0].kind === "same") present[0].kind = "changed";
    }
    for (const rem of script.scenes.filter((s) => s.kind === "removed")) {
      const target = present.find((p) => p.anchor >= rem.anchor) ?? present[present.length - 1];
      target.deletedScenes.push(rem);
    }
    return present;
  }, [script]);

  const barKind = (s: (typeof barScenes)[number]): "added" | "changed" | "removed" | "same" => {
    if (s.kind === "added") return "added";
    if (s.deletedScenes.length > 0 && s.kind === "same") return "removed";
    if (s.kind === "changed" && s.added === 0 && s.removed > 0) return "removed";
    if (s.kind === "changed") return "changed";
    return "same";
  };

  const sizes = barScenes.map((s) => Math.max(1, s.size));
  const maxSize = Math.max(1, ...sizes);
  const changedIdx = barScenes.map((s, i) => (barKind(s) !== "same" ? i : -1)).filter((i) => i >= 0);
  const go = (i: number) => {
    setSelected(i);
    setScrollTo({ line: barScenes[i].anchor, seq: Date.now() });
  };
  const step = (dir: 1 | -1) => {
    if (changedIdx.length === 0) return;
    const from = selected ?? (dir === 1 ? -1 : barScenes.length);
    const next = dir === 1 ? changedIdx.find((i) => i > from) ?? changedIdx[0] : [...changedIdx].reverse().find((i) => i < from) ?? changedIdx[changedIdx.length - 1];
    go(next);
  };
  const delta = (a: number, b: number, unit: string) => {
    const d = b - a;
    return (
      <>
        {a}
        {unit} → {b}
        {unit}
        {d !== 0 && <em className={d > 0 ? "plus" : "minus"}> ({d > 0 ? `+${d}` : `−${-d}`})</em>}
      </>
    );
  };
  const cleanHeading = (h: string) =>
    h.replace(/^\s*(?:S\s*#|#)\s*\d+[A-Z]?\.?\s*/i, "").trim() || "(첫 씬 앞)";
  const sceneTitle = (s: (typeof barScenes)[number]) => {
    const k = barKind(s);
    const num = s.number > 0 ? `#${s.number}. · ` : "";
    const delNote =
      s.deletedScenes.length > 0
        ? ` (앞에서 지운 씬 ${s.deletedScenes.map((d) => `옛 #${d.number}.`).join(", ")})`
        : "";
    const counts = s.added || s.removed ? ` (+${s.added} −${s.removed})` : "";
    return `${num}${cleanHeading(s.heading)} — ${label[k]}${counts}${delNote}`;
  };

  return (
    <>
      <div className="compare-top">
        <div className="compare-summary">
          <div className="compare-stat compare-direction">
            <strong>{before.name}</strong>
            <span className="compare-arrow">→</span>
            {otherRevisions.length === 0 ? (
              <strong>{after.name}</strong>
            ) : (
              <select
                className="compare-target-select"
                aria-label="비교할 대상"
                value={target}
                onChange={(e) => onChangeTarget(e.target.value)}
              >
                <option value="current">지금 원고</option>
                {otherRevisions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="compare-stat">
            <span className="compare-stat-label">씬</span>
            <span className="compare-stat-value">
              추가 {script.addedScenes} · 삭제 {script.removedScenes} · 변경 {script.changedScenes}
            </span>
          </div>
          <div className="compare-stat">
            <span className="compare-stat-label">줄</span>
            <span className="compare-stat-value">
              <em className="plus">+{script.addedLines}</em> <em className="minus">−{script.removedLines}</em>
            </span>
          </div>
          {before.pages !== undefined && after.pages !== undefined && (
            <div className="compare-stat">
              <span className="compare-stat-label">페이지</span>
              <span className="compare-stat-value">{delta(before.pages, after.pages, "")}</span>
            </div>
          )}
          {before.runtime !== undefined && after.runtime !== undefined && (
            <div className="compare-stat">
              <span className="compare-stat-label">러닝타임</span>
              <span className="compare-stat-value">약 {delta(before.runtime, after.runtime, "분")}</span>
            </div>
          )}
          {docChanges.length > 0 && (
            <div className="compare-stat">
              <span className="compare-stat-label">설정 문서</span>
              <span className="compare-stat-value">{docChanges.length}개 변경</span>
            </div>
          )}
        </div>

        <div className="compare-map">
          <div className="compare-map-head">
            <span>
              씬별 수정 위치 ({barScenes.length}씬 중 {changedIdx.length}곳)
            </span>
            <span className="compare-legend">
              <i className="swatch rev-swatch-added" /> 새 씬 <i className="swatch rev-swatch-changed" /> 고친 씬{" "}
              <i className="swatch rev-swatch-removed" /> 삭제 있음
              <span className="compare-hint">· 막대를 누르면 그 씬으로 이동</span>
            </span>
            <span className="compare-step">
              <button type="button" onClick={() => step(-1)} disabled={changedIdx.length === 0} title="이전 바뀐 씬으로">
                ‹ 이전
              </button>
              <button type="button" onClick={() => step(1)} disabled={changedIdx.length === 0} title="다음 바뀐 씬으로">
                다음 ›
              </button>
            </span>
          </div>

          <div className="scene-columns compare-columns" role="list" aria-label="씬별 수정 위치 (막대 하나가 씬 하나)">
            {barScenes.map((s, i) => {
              const k = barKind(s);
              const bothChangedAndDeleted = s.deletedScenes.length > 0 && k !== "removed";
              return (
                <button
                  key={`${s.anchor}-${i}`}
                  type="button"
                  role="listitem"
                  className={`scene-column rev-col-${k}${bothChangedAndDeleted ? " rev-col-has-del" : ""}${selected === i ? " current" : ""}`}
                  onClick={() => go(i)}
                  title={sceneTitle(s)}
                >
                  <span style={{ height: `${Math.max(10, (sizes[i] / maxSize) * 100)}%` }} />
                </button>
              );
            })}
          </div>
        </div>

        {docChanges.length > 0 && (
          <details className="compare-docs">
            <summary>설정 문서 바뀐 곳 {docChanges.length}개</summary>
            {docChanges.map((d, i) => (
              <section key={i} className={`compare-scene compare-${d.kind}`}>
                <header>
                  <span className="compare-badge">{docLabel[d.kind]}</span>
                  <span className="compare-heading">{d.name}</span>
                </header>
                <DiffLines ops={d.ops.map((o) => ({ ...o, line: { ...o.line, style: "action" } }))} />
              </section>
            ))}
          </details>
        )}
      </div>

      <div className="desk compare-desk">
        <ScriptPreview lines={after.lines} marks={script.marks} scrollTo={scrollTo} />
      </div>
    </>
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
  const mine: Snapshot | null = useMemo(
    () => (content ? { name: meta.name, lines, docs: content.docs, pages: meta.stats?.pages, runtime: meta.stats?.runtimeMinutes } : null),
    [content, meta, lines],
  );

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
        <div className="revision-top-row">
          <div className="revision-title">
            <span className="revision-kicker">수정고</span>
            <h2>{meta.name}</h2>
            <span className="revision-when">{when(meta.createdAt)}</span>
            {meta.stats && (
              <span className="revision-when">
                · {meta.stats.pages}페이지 · 씬 {meta.stats.scenes}개 · 약 {meta.stats.runtimeMinutes}분
              </span>
            )}
            {meta.note && <span className="revision-note-inline">· {meta.note}</span>}
          </div>
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
            <span aria-hidden="true">⇄</span> 다른 원고와 비교
          </button>
        </nav>
      </header>

      <div className={tab === "compare" ? "revision-body compare-mode" : "revision-body"}>
        {!content ? (
          <p className="panel-empty">불러오는 중…</p>
        ) : tab === "script" ? (
          <div className="desk revision-desk">
            <ScriptPreview lines={lines} />
          </div>
        ) : tab === "compare" ? (
          <div className="revision-compare">
            {mine && targetSnapshot ? (
              <Comparison
                before={mine}
                after={targetSnapshot}
                target={target}
                onChangeTarget={setTarget}
                otherRevisions={revisions.filter((r) => r.id !== meta.id)}
              />
            ) : (
              <p className="panel-empty">불러오는 중…</p>
            )}
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
