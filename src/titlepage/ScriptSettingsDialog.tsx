import { useEffect, useRef, useState } from "react";
import { loadSettings } from "../settings/settings";
import { MAX_SCENE_START, sceneStartOf, type ScriptSettings } from "../project/scriptSettings";
import { COVER_FIELDS, readTitlePage, writeTitlePage, type CoverField, type TitlePageFields } from "./titlePage";

type Props = {
  scriptName: string;
  titlePage: string | null;
  settings: ScriptSettings | undefined;
  onSave: (titlePage: string | null, settings: ScriptSettings) => void;
  onClose: () => void;
};

const FIELDS: { key: CoverField; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "title", label: "제목", placeholder: "드롭킥" },
  { key: "credit", label: "크레딧", placeholder: "각본" },
  { key: "author", label: "작가", placeholder: "이름" },
  { key: "source", label: "원작", placeholder: "원작이 있으면 적습니다" },
  { key: "draftDate", label: "날짜/고", placeholder: "2026-10-25 / 1고" },
  { key: "contact", label: "연락처", placeholder: "전화번호, 이메일 (여러 줄 가능)", multiline: true },
];

type Tab = "cover" | "script";

/**
 * 스크립트 설정: 지금 열린 스크립트의 설정.
 *  - 표지: 항목마다 켜고 끌 수 있다. 끈 항목은 PDF·Word 표지에서 빠지고, 모두 끄면 표지가 없다.
 *  - 스크립트 설정: 첫 씬 번호, PDF 워터마크
 */
export function ScriptSettingsDialog({ scriptName, titlePage, settings, onSave, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("cover");
  const [fields, setFields] = useState<TitlePageFields>(() => {
    const parsed = readTitlePage(titlePage);
    const appSettings = loadSettings();
    return {
      ...parsed,
      author: parsed.author || appSettings.defaultAuthor || "",
      contact: parsed.contact || appSettings.defaultContact || "",
    };
  });
  const [off, setOff] = useState<Set<CoverField>>(() => new Set(settings?.coverOff ?? []));
  const [sceneStart, setSceneStart] = useState(String(sceneStartOf(settings)));
  const [watermark, setWatermark] = useState(settings?.watermark ?? "");
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = (key: CoverField) =>
    setOff((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // 켜 둔 항목 중 내용이 있는 게 없으면 표지가 없다.
  const coverCount = COVER_FIELDS.filter((key) => !off.has(key) && fields[key].trim() !== "").length;
  const startNumber = Number(sceneStart);
  const startValid = Number.isInteger(startNumber) && startNumber >= 1 && startNumber <= MAX_SCENE_START;

  const save = () => {
    if (!startValid) {
      setTab("script");
      return;
    }
    onSave(writeTitlePage(fields, titlePage), {
      coverOff: COVER_FIELDS.filter((key) => off.has(key)),
      sceneStart: startNumber,
      watermark,
    });
    onClose();
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <form
        className="dialog script-settings-dialog"
        role="dialog"
        aria-label="스크립트 설정"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h2>스크립트 설정</h2>
        <p className="dialog-hint">"{scriptName}" 스크립트에만 적용됩니다.</p>

        <div className="settings-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "cover"} className={tab === "cover" ? "active" : ""} onClick={() => setTab("cover")}>
            표지
          </button>
          <button type="button" role="tab" aria-selected={tab === "script"} className={tab === "script" ? "active" : ""} onClick={() => setTab("script")}>
            스크립트 설정
          </button>
        </div>

        {tab === "cover" ? (
          <>
            <p className="dialog-hint">
              PDF와 Word의 첫 장에 들어갑니다. 켠 항목만 표지에 나오고, 모두 끄면 표지가 없습니다.
              {coverCount === 0 && <strong className="cover-none"> 지금은 표지가 없습니다.</strong>}
            </p>
            {FIELDS.map((field, i) => (
              <div key={field.key} className={`dialog-field cover-field${off.has(field.key) ? " off" : ""}`}>
                <label className="cover-toggle" title={off.has(field.key) ? "표지에 넣기" : "표지에서 빼기"}>
                  <input type="checkbox" checked={!off.has(field.key)} onChange={() => toggle(field.key)} />
                  <span>{field.label}</span>
                </label>
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
              </div>
            ))}
          </>
        ) : (
          <>
            <label className="dialog-field">
              <span>씬 번호 시작</span>
              <input
                type="number"
                min={1}
                max={MAX_SCENE_START}
                step={1}
                value={sceneStart}
                onChange={(e) => setSceneStart(e.target.value)}
                aria-invalid={!startValid}
              />
            </label>
            <p className="dialog-hint">
              첫 씬이 이 번호로 시작하고 다음 씬부터 하나씩 늘어납니다. (예: 10을 넣으면 10, 11, 12…)
              {!startValid && <strong className="cover-none"> 1 이상의 정수를 넣어 주세요.</strong>}
            </p>
            <label className="dialog-field">
              <span>워터마크</span>
              <input
                value={watermark}
                placeholder="예: 홍길동 전용 · 외부 유출 금지"
                onChange={(e) => setWatermark(e.target.value)}
              />
            </label>
            <p className="dialog-hint">PDF의 모든 쪽 위에 이 글이 기울어진 글씨로 흐리게(불투명도 10%) 반복해서 찍힙니다. 비워 두면 찍지 않습니다.</p>
          </>
        )}

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
