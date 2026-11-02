import { useMemo } from "react";
import { findNode } from "../project/tree";
import { ZOOM_STEPS } from "../settings/settings";
import { visibleDocsFor } from "../project/scripts";
import type { ProjectNode } from "../project/model";
import type { RevisionMeta } from "../project/model";
import type { PaneIndex, PaneTarget } from "./paneTargets";

type Props = {
  index: PaneIndex;
  target: PaneTarget;
  focused: boolean;
  tree: ProjectNode[];
  mainScriptId: string;
  revisions: RevisionMeta[];
  /** 이 화면의 화면 비율(%). 비율을 바꿀 수 없는 화면(통계, 3막 구조 등)이면 없다 */
  zoom?: number;
  onZoom: (direction: 1 | -1) => void;
  onChange: (target: PaneTarget) => void;
  onSwap: () => void;
  onClose: () => void;
};

/** 선택 목록의 값 <-> 화면 내용 */
function encode(target: PaneTarget): string {
  return target.kind === "doc" || target.kind === "revision" ? `${target.kind}:${target.id}` : target.kind;
}

function decode(value: string): PaneTarget {
  if (value === "script" || value === "stats") return { kind: value };
  const at = value.indexOf(":");
  const kind = value.slice(0, at);
  const id = value.slice(at + 1);
  return kind === "revision" ? { kind: "revision", id } : { kind: "doc", id };
}

/** 화면 위쪽 줄: 이 화면에 무엇을 보여줄지 고르고, 두 화면을 바꾸거나 닫는다. */
export function PaneHeader({
  index,
  target,
  focused,
  tree,
  mainScriptId,
  revisions,
  zoom,
  onZoom,
  onChange,
  onSwap,
  onClose,
}: Props) {
  const { structures, documents } = useMemo(() => {
    // 지금 스크립트에서 보이는 문서만 (스크립트 문서와 다른 스크립트 전용 문서는 뺀다)
    const docs = visibleDocsFor(tree, mainScriptId);
    return {
      structures: docs.filter((d) => d.type === "structure"),
      documents: docs.filter((d) => d.type !== "structure"),
    };
  }, [tree, mainScriptId]);

  // 편집기에 열린(활성) 스크립트는 'script' 값으로 쓴다. 이름은 스크립트 이름을 보여 준다.
  const scriptName = findNode(tree, mainScriptId)?.name ?? "스크립트";
  const value = target.kind === "doc" && target.id === mainScriptId ? "script" : encode(target);

  return (
    <div className={focused ? "pane-header focused" : "pane-header"}>
      <label className="pane-select-label">
        <span className="pane-number">화면 {index + 1}</span>
        <select
          className="pane-select"
          value={value}
          aria-label={`화면 ${index + 1}에 보여줄 내용`}
          onChange={(e) => onChange(decode(e.target.value))}
        >
          <option value="script">{scriptName}</option>
          <option value="stats">통계</option>
          {structures.length > 0 && (
            <optgroup label="3막 구조">
              {structures.map((d) => (
                <option key={d.id} value={`doc:${d.id}`}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          )}
          {documents.length > 0 && (
            <optgroup label="문서">
              {documents.map((d) => (
                <option key={d.id} value={`doc:${d.id}`}>
                  {d.name}
                </option>
              ))}
            </optgroup>
          )}
          {revisions.length > 0 && (
            <optgroup label="수정고">
              {revisions.map((r) => (
                <option key={r.id} value={`revision:${r.id}`}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <span className="pane-header-spacer" />
      {zoom !== undefined && (
        <span className="pane-zoom" role="group" aria-label={`화면 ${index + 1} 비율`}>
          <button
            type="button"
            className="pane-header-button"
            title="이 화면만 줄이기"
            disabled={zoom <= ZOOM_STEPS[0]}
            onClick={() => onZoom(-1)}
          >
            −
          </button>
          <span className="pane-zoom-value">{zoom}%</span>
          <button
            type="button"
            className="pane-header-button"
            title="이 화면만 키우기"
            disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
            onClick={() => onZoom(1)}
          >
            +
          </button>
        </span>
      )}
      <button type="button" className="pane-header-button" title="두 화면 서로 바꾸기" onClick={onSwap}>
        ⇄
      </button>
      <button type="button" className="pane-header-button" title="이 화면 닫기" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
