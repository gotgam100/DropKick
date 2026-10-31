/**
 * 양식 만들기·편집 전용 문서 화면.
 * 팝업 대화상자 대신 일반 문서처럼 넓은 종이 화면(TextEditor)에서 양식을 직접 작성한다.
 */
import { useState } from "react";
import { TextEditor } from "../editor/TextEditor";
import {
  DEFAULT_CHARACTER_PRESET,
  createCustomPreset,
  extractPresetBody,
  type DocPreset,
} from "../project/presets";
import { IconPickerDialog, SfSymbolIcon } from "./sfSymbols";

type Props = {
  /** 편집할 기존 양식. null이면 새 양식 만들기 */
  initial: DocPreset | null;
  /** '지금 문서를 양식으로 저장'할 때 초기값 */
  draft?: { name: string; body: string; icon?: string; docType?: "character" | "memo" | "script" };
  canDelete: boolean;
  onSave: (preset: DocPreset) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
};

export function PresetEditorView({ initial, draft, canDelete, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? draft?.name ?? "");
  const [defaultDocName, setDefaultDocName] = useState(initial?.defaultDocName ?? "");
  const [docType, setDocType] = useState<"character" | "memo" | "script">(initial?.docType ?? draft?.docType ?? "memo");
  const [icon, setIcon] = useState<string | undefined>(
    initial?.icon ??
      draft?.icon ??
      ((initial?.docType ?? draft?.docType) === "character"
        ? "person"
        : (initial?.docType ?? draft?.docType) === "script"
          ? "film"
          : "doc.text"),
  );
  const [body, setBody] = useState(() =>
    initial ? initial.body : extractPresetBody(draft?.body ?? "## 항목\n- \n"),
  );
  const [editorResetKey, setEditorResetKey] = useState(0);
  const [pickingIconAt, setPickingIconAt] = useState<{ x: number; y: number } | null>(null);

  const submit = () => {
    const trimmedName = name.trim() || "새 양식";
    const fallbackDocName = `새 ${trimmedName.replace(/\s*설정$/, "") || "문서"}`;
    if (initial) {
      onSave({
        ...initial,
        name: trimmedName,
        defaultDocName: defaultDocName.trim() || fallbackDocName,
        docType,
        icon: icon || (docType === "character" ? "person" : docType === "script" ? "film" : "doc.text"),
        body: extractPresetBody(body),
      });
    } else {
      onSave(
        createCustomPreset({
          name: trimmedName,
          defaultDocName: defaultDocName.trim() || fallbackDocName,
          docType,
          icon,
          body,
        }),
      );
    }
    onClose();
  };

  const docId = `preset-editor-${initial?.id ?? "new"}-${editorResetKey}`;

  return (
    <main className="text-desk preset-editor-desk">
      <div className="preset-editor-bar">
        <div className="preset-editor-fields">
          <button
            type="button"
            className="preset-icon-button"
            title="양식 아이콘 변경"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setPickingIconAt({ x: rect.left, y: rect.bottom + 6 });
            }}
          >
            <SfSymbolIcon type={docType} icon={icon} />
          </button>

          <label className="preset-inline-field">
            <span>양식 이름</span>
            <input
              value={name}
              placeholder="예: 장소 설정, 인물 설정"
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>

          <label className="preset-inline-field">
            <span>기본 문서명</span>
            <input
              value={defaultDocName}
              placeholder={name.trim() ? `새 ${name.trim().replace(/\s*설정$/, "")}` : "예: 새 장소"}
              onChange={(e) => setDefaultDocName(e.target.value)}
            />
          </label>

          <label className="preset-inline-check" title="켜 두면 원고 속 등장인물의 대사 수·등장 씬 통계를 문서 위에 보여 줍니다">
            <input
              type="checkbox"
              checked={docType === "character"}
              onChange={(e) => {
                const nextType = e.target.checked ? "character" : "memo";
                setDocType(nextType);
                if (!icon || icon === "doc.text" || icon === "person") {
                  setIcon(nextType === "character" ? "person" : "doc.text");
                }
              }}
            />
            <span>인물 통계 연결</span>
          </label>
        </div>

        <div className="preset-editor-actions">
          {initial?.id === DEFAULT_CHARACTER_PRESET.id && (
            <button
              type="button"
              onClick={() => {
                setName(DEFAULT_CHARACTER_PRESET.name);
                setDefaultDocName(DEFAULT_CHARACTER_PRESET.defaultDocName);
                setDocType(DEFAULT_CHARACTER_PRESET.docType);
                setIcon(DEFAULT_CHARACTER_PRESET.icon);
                setBody(DEFAULT_CHARACTER_PRESET.body);
                setEditorResetKey((k) => k + 1);
              }}
            >
              기본값 복원
            </button>
          )}
          {initial && canDelete && onDelete && (
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                onDelete(initial.id);
                onClose();
              }}
            >
              지우기
            </button>
          )}
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="button" className="primary" onClick={submit}>
            양식 저장
          </button>
        </div>
      </div>

      <article className="text-page">
        <div className="preset-page-title-preview">
          # {defaultDocName.trim() || (name.trim() ? `새 ${name.trim().replace(/\s*설정$/, "")}` : "문서 이름")}
          <span className="preset-page-title-hint">새 문서를 만들면 첫 줄에 문서 이름이 자동으로 들어갑니다</span>
        </div>
        <TextEditor
          docId={docId}
          text={body}
          onChange={(_, next) => setBody(next)}
        />
      </article>

      {pickingIconAt && (
        <IconPickerDialog
          node={{ id: "preset", type: docType, name: name || "양식", file: "", icon }}
          x={pickingIconAt.x}
          y={pickingIconAt.y}
          onApply={(nextIcon) => setIcon(nextIcon ?? (docType === "character" ? "person" : "doc.text"))}
          onClose={() => setPickingIconAt(null)}
        />
      )}
    </main>
  );
}
