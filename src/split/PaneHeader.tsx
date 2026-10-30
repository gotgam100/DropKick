import { useMemo } from "react";
import { walkDocs, type ProjectNode } from "../project/model";
import type { RevisionMeta } from "../project/model";
import type { PaneIndex, PaneTarget } from "./paneTargets";

type Props = {
  index: PaneIndex;
  target: PaneTarget;
  focused: boolean;
  tree: ProjectNode[];
  mainScriptId: string;
  revisions: RevisionMeta[];
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
  onChange,
  onSwap,
  onClose,
}: Props) {
  const { structures, documents } = useMemo(() => {
    const docs = walkDocs(tree).filter((d) => d.id !== mainScriptId);
    return {
      structures: docs.filter((d) => d.type === "structure"),
      documents: docs.filter((d) => d.type !== "structure"),
    };
  }, [tree, mainScriptId]);

  // 원고 문서(주 스크립트)는 'script' 값으로 쓴다.
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
          <option value="script">스크립트</option>
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
      <button type="button" className="pane-header-button" title="두 화면 서로 바꾸기" onClick={onSwap}>
        ⇄
      </button>
      <button type="button" className="pane-header-button" title="이 화면 닫기" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
