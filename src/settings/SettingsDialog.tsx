import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { DocPreset } from "../project/presets";
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type AutosaveInterval,
  type ThemeMode,
} from "./settings";

type TabId = "view" | "writing" | "backup" | "reset";

type Props = {
  settings: AppSettings;
  presets: DocPreset[];
  onChangeSettings: (next: AppSettings) => void;
  onUpdatePresets: (next: DocPreset[]) => void;
  onOpenNewPreset: () => void;
  onEditPreset: (preset: DocPreset) => void;
  onFullResetApp: () => Promise<void>;
  onClose: () => void;
};

export function SettingsDialog({
  settings,
  presets,
  onChangeSettings,
  onUpdatePresets,
  onOpenNewPreset,
  onEditPreset,
  onFullResetApp,
  onClose,
}: Props) {
  const [tab, setTab] = useState<TabId>("view");
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [presetNotice, setPresetNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const customPresets = presets.filter((p) => p.id !== "preset-character");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patch = (partial: Partial<AppSettings>) => {
    onChangeSettings({ ...settings, ...partial });
  };

  // 추가한 프리셋 JSON 파일로 내보내기
  const handleExportPresets = async () => {
    if (customPresets.length === 0) {
      setPresetNotice("내보낼 추가 프리셋이 없습니다.");
      return;
    }
    try {
      // 맥 앱 창에서는 브라우저식 다운로드가 되지 않아, 저장 위치를 직접 고르게 한다.
      const chosen = await save({
        defaultPath: "DropKick-프리셋-백업.json",
        filters: [{ name: "프리셋 백업", extensions: ["json"] }],
      });
      if (!chosen) return;
      const path = /\.json$/i.test(chosen) ? chosen : `${chosen}.json`;
      await invoke("write_script", { path, contents: JSON.stringify(customPresets, null, 2) });
      setPresetNotice(`추가한 프리셋 ${customPresets.length}개를 파일로 내보냈습니다.`);
    } catch {
      setPresetNotice("파일을 저장하지 못했습니다.");
    }
  };

  // 프리셋 JSON 파일 가져오기
  const handleImportPresetsFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        setPresetNotice("올바른 프리셋 파일 형식이 아닙니다.");
        return;
      }
      const valid = parsed.filter(
        (p): p is DocPreset =>
          Boolean(p) &&
          typeof p === "object" &&
          typeof p.id === "string" &&
          p.id !== "preset-character" &&
          typeof p.name === "string" &&
          typeof p.body === "string",
      );
      if (valid.length === 0) {
        setPresetNotice("가져올 수 있는 프리셋이 없습니다.");
        return;
      }
      const byId = new Map(presets.map((p) => [p.id, p]));
      for (const item of valid) {
        byId.set(item.id, {
          id: item.id,
          name: item.name,
          defaultDocName: item.defaultDocName || `새 ${item.name}`,
          docType: item.docType === "character" ? "character" : "memo",
          icon: item.icon || "doc.text",
          body: item.body,
        });
      }
      onUpdatePresets(Array.from(byId.values()));
      setPresetNotice(`프리셋 ${valid.length}개를 가져왔습니다.`);
    } catch {
      setPresetNotice("파일을 읽지 못했습니다.");
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-label="설정"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="settings-header">
          <h2>설정</h2>
          <div className="settings-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "view"}
              className={tab === "view" ? "active" : ""}
              onClick={() => setTab("view")}
            >
              화면 · 보기
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "writing"}
              className={tab === "writing" ? "active" : ""}
              onClick={() => setTab("writing")}
            >
              집필 · 원고
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "backup"}
              className={tab === "backup" ? "active" : ""}
              onClick={() => setTab("backup")}
            >
              저장 · 백업
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "reset"}
              className={tab === "reset" ? "active" : ""}
              onClick={() => setTab("reset")}
            >
              프리셋 · 초기화
            </button>
          </div>
        </header>

        <div className="settings-body">
          {tab === "view" && (
            <div className="settings-section">
              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>화면 테마</strong>
                  <span>앱 전체와 원고 종이의 밝기 모드를 선택합니다.</span>
                </div>
                <div className="settings-seg-group">
                  {(
                    [
                      { value: "system", label: "맥 설정 따르기" },
                      { value: "light", label: "밝은 모드" },
                      { value: "dark", label: "어두운 모드" },
                    ] as { value: ThemeMode; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={settings.theme === opt.value ? "active" : ""}
                      onClick={() => patch({ theme: opt.value })}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="settings-toggle-row">
                <div className="settings-item-label">
                  <strong>현재 줄 강조 표시</strong>
                  <span>원고에서 지금 커서가 놓인 줄 배경과 왼쪽 스타일 이름표를 표시합니다.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.highlightCurrentLine}
                  onChange={(e) => patch({ highlightCurrentLine: e.target.checked })}
                />
              </label>
            </div>
          )}

          {tab === "writing" && (
            <div className="settings-section">
              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>표지 기본 작가 정보</strong>
                  <span>
                    미리 적어 두면 새 프로젝트에서 <strong>표지</strong>를 열 때 작가 이름과 연락처가 자동으로 채워집니다.
                  </span>
                </div>
                <div className="settings-fields-grid">
                  <label className="dialog-field">
                    <span>기본 작가 이름</span>
                    <input
                      type="text"
                      value={settings.defaultAuthor}
                      placeholder="예: 홍길동"
                      onChange={(e) => patch({ defaultAuthor: e.target.value })}
                    />
                  </label>
                  <label className="dialog-field">
                    <span>기본 연락처 (이메일 · 전화번호)</span>
                    <textarea
                      rows={2}
                      value={settings.defaultContact}
                      placeholder="예: writer@example.com / 010-0000-0000"
                      onChange={(e) => patch({ defaultContact: e.target.value })}
                    />
                  </label>
                </div>
              </div>

              <label className="settings-toggle-row">
                <div className="settings-item-label">
                  <strong>인물 이름 자동 완성</strong>
                  <span>인물 줄(⌘3)을 입력할 때 원고에 등장했던 인물 이름을 자동으로 추천합니다.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.characterAutocomplete}
                  onChange={(e) => patch({ characterAutocomplete: e.target.checked })}
                />
              </label>

              <label className="settings-toggle-row">
                <div className="settings-item-label">
                  <strong>원고 화면에 씬 번호(S#1, S#2…) 표시</strong>
                  <span>씬헤딩 앞에 자동으로 매겨지는 씬 번호를 화면에 표시합니다.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showSceneNumbers}
                  onChange={(e) => patch({ showSceneNumbers: e.target.checked })}
                />
              </label>
            </div>
          )}

          {tab === "backup" && (
            <div className="settings-section">
              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>자동 저장 간격</strong>
                  <span>저장된 프로젝트에서 입력을 멈춘 뒤 자동으로 저장하기까지의 대기 시간입니다.</span>
                </div>
                <div className="settings-seg-group">
                  {(
                    [
                      { value: 3000, label: "3초 (기본)" },
                      { value: 10000, label: "10초" },
                      { value: 30000, label: "30초" },
                      { value: 0, label: "끄기 (⌘S 수동)" },
                    ] as { value: AutosaveInterval; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={settings.autosaveDelayMs === opt.value ? "active" : ""}
                      onClick={() => patch({ autosaveDelayMs: opt.value })}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>백업 보관 개수 (최대 100개)</strong>
                  <span>
                    프로젝트 폴더 안의 <code>.dropkick-backups</code>에 남겨 둘 최근 백업 개수입니다.
                    원고·3막 구조·인물 설정 등 프로젝트 안의 모든 문서가 함께 백업됩니다.
                  </span>
                </div>
                <div className="settings-backup-control">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={settings.backupKeepCount}
                    onChange={(e) => patch({ backupKeepCount: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="settings-backup-number"
                    value={settings.backupKeepCount}
                    onChange={(e) => {
                      const n = Math.max(1, Math.min(100, Number(e.target.value) || 1));
                      patch({ backupKeepCount: n });
                    }}
                  />
                  <span className="muted">개</span>
                </div>
                <div className="settings-seg-group">
                  {[15, 30, 50, 100].map((count) => (
                    <button
                      key={count}
                      type="button"
                      className={settings.backupKeepCount === count ? "active" : ""}
                      onClick={() => patch({ backupKeepCount: count })}
                    >
                      {count === 30 ? "30개 (기본)" : `${count}개`}
                    </button>
                  ))}
                </div>
              </div>

              <label className="settings-toggle-row">
                <div className="settings-item-label">
                  <strong>앱을 켤 때 마지막으로 작업하던 프로젝트 자동 열기</strong>
                  <span>끄면 앱을 시작할 때 항상 빈 새 프로젝트 화면으로 시작합니다.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.openLastProjectOnStart}
                  onChange={(e) => patch({ openLastProjectOnStart: e.target.checked })}
                />
              </label>
            </div>
          )}

          {tab === "reset" && (
            <div className="settings-section">
              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>추가한 프리셋 관리 ({customPresets.length}개)</strong>
                  <span>
                    기본 프리셋(<code>3막 구조(세이브 더 캣)</code>, <code>인물 양식</code>) 외에 직접 만든 프리셋을 관리하고 백업 파일로 내보내거나 가져올 수 있습니다.
                  </span>
                </div>
                {customPresets.length > 0 && (
                  <div className="settings-preset-list">
                    {customPresets.map((p) => (
                      <div key={p.id} className="settings-preset-row">
                        <span>{p.name}</span>
                        <div className="settings-preset-row-actions">
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onEditPreset(p);
                            }}
                          >
                            편집
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={() =>
                              onUpdatePresets(presets.filter((item) => item.id !== p.id))
                            }
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="settings-inline-actions">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenNewPreset();
                    }}
                  >
                    + 새 프리셋 만들기…
                  </button>
                  <button type="button" onClick={handleExportPresets}>
                    프리셋 파일로 내보내기…
                  </button>
                  <button type="button" onClick={() => fileInputRef.current?.click()}>
                    프리셋 파일 가져오기…
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImportPresetsFile(f);
                      e.target.value = "";
                    }}
                  />
                </div>
                {presetNotice && <p className="settings-sub-notice">{presetNotice}</p>}
              </div>

              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>설정값만 기본값으로 되돌리기</strong>
                  <span>추가한 프리셋과 프로젝트는 그대로 두고, 화면·저장 설정만 기본값으로 되돌립니다.</span>
                </div>
                <div className="settings-inline-actions">
                  <button type="button" onClick={() => onChangeSettings(DEFAULT_SETTINGS)}>
                    설정 기본값 복원
                  </button>
                </div>
              </div>

              <div className="settings-item settings-danger-box">
                <div className="settings-item-label">
                  <strong>프로그램 전체 초기화</strong>
                  <span>
                    프로그램을 처음 다운로드받아 열었을 때의 상태로 완전히 초기화합니다.
                    모든 설정, 추가한 프리셋, 최근 열었던 프로젝트 기록이 초기화되고 새 프로젝트로 시작합니다.
                    (내 맥에 이미 저장해 둔 <code>.dropkick</code> 프로젝트 파일 자체는 지워지지 않습니다.)
                  </span>
                </div>
                {confirmResetAll ? (
                  <div className="settings-reset-confirm">
                    <span>정말 프로그램을 처음 상태로 초기화할까요?</span>
                    <button
                      type="button"
                      className="danger-solid"
                      onClick={async () => {
                        setConfirmResetAll(false);
                        await onFullResetApp();
                      }}
                    >
                      전체 초기화 실행
                    </button>
                    <button type="button" onClick={() => setConfirmResetAll(false)}>
                      취소
                    </button>
                  </div>
                ) : (
                  <div className="settings-inline-actions">
                    <button
                      type="button"
                      className="danger"
                      onClick={() => setConfirmResetAll(true)}
                    >
                      프로그램 전체 초기화…
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button type="button" className="primary" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
