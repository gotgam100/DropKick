import { useEffect, useRef, useState } from "react";
import { readTitlePage, writeTitlePage, type TitlePageFields } from "./titlePage";

type Props = {
  titlePage: string | null;
  onSave: (titlePage: string | null) => void;
  onClose: () => void;
};

const FIELDS: { key: keyof TitlePageFields; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "title", label: "제목", placeholder: "드롭킥" },
  { key: "credit", label: "크레딧", placeholder: "각본" },
  { key: "author", label: "작가", placeholder: "이름" },
  { key: "source", label: "원작", placeholder: "원작이 있으면 적습니다" },
  { key: "draftDate", label: "날짜/고", placeholder: "2026-10-25 / 1고" },
  { key: "contact", label: "연락처", placeholder: "전화번호, 이메일 (여러 줄 가능)", multiline: true },
];

/** 표지 편집: PDF 첫 장에 들어간다. */
export function TitlePageDialog({ titlePage, onSave, onClose }: Props) {
  const [fields, setFields] = useState<TitlePageFields>(() => readTitlePage(titlePage));
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    onSave(writeTitlePage(fields, titlePage));
    onClose();
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-label="표지 편집"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2>표지</h2>
        <p className="dialog-hint">PDF로 내보낼 때 첫 장에 들어갑니다. 비워 둔 항목은 표지에 나오지 않습니다.</p>
        {FIELDS.map((field, i) => (
          <label key={field.key} className="dialog-field">
            <span>{field.label}</span>
            {field.multiline ? (
              <textarea
                rows={3}
                value={fields[field.key]}
                placeholder={field.placeholder}
                onChange={(e) => setFields({ ...fields, [field.key]: e.target.value })}
              />
            ) : (
              <input
                ref={i === 0 ? firstRef : undefined}
                value={fields[field.key]}
                placeholder={field.placeholder}
                onChange={(e) => setFields({ ...fields, [field.key]: e.target.value })}
              />
            )}
          </label>
        ))}
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary">
            적용
          </button>
        </div>
      </form>
    </div>
  );
}
