import { useEffect, useRef, useState } from "react";
import { limitCustomQuotes } from "../footer/quoteFlow";
import { LINE_STYLES, STYLE_LABELS, type LineStyle } from "../editor/styles";
import {
  APP_SHORTCUT_IDS,
  APP_SHORTCUT_LABELS,
  DEFAULT_APP_SHORTCUTS,
  checkAppShortcut,
  comboFromEvent,
  formatCombo,
  normalizeCombo,
  type AppShortcutId,
} from "./appShortcuts";
import {
  DEFAULT_SETTINGS,
  DEFAULT_STYLE_SHORTCUTS,
  DEFAULT_NEXT_STYLE_RULES,
  type AppSettings,
  type AutosaveInterval,
  type ThemeMode,
} from "./settings";

type TabId = "view" | "writing" | "shortcuts" | "backup";

type Props = {
  settings: AppSettings;
  onChangeSettings: (next: AppSettings) => void;
  onFullResetApp: () => Promise<void>;
  onClose: () => void;
  isStandalone?: boolean;
};

export function SettingsDialog({
  settings,
  onChangeSettings,
  onFullResetApp,
  onClose,
  isStandalone,
}: Props) {
  const [tab, setTab] = useState<TabId>("view");
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    posX: number;
    posY: number;
  } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // 탭 버튼 등 클릭 시에는 드래그를 시작하지 않음
    const target = e.target as HTMLElement;
    if (target.closest("button, input, a, select, textarea")) {
      return;
    }

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = moveEvent.clientX - dragRef.current.startX;
      const dy = moveEvent.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.posX + dx,
        y: dragRef.current.posY + dy,
      });
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const patch = (partial: Partial<AppSettings>) => {
    onChangeSettings({ ...settings, ...partial });
  };

  // 앱 단축키: "바꾸기"를 누른 뒤 원하는 키를 누르면 지정된다.
  const [recording, setRecording] = useState<AppShortcutId | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        setShortcutError(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) {
        setShortcutError("⌘를 누른 채 글자나 숫자 키를 눌러 주세요.");
        return;
      }
      const problem = checkAppShortcut(
        recording,
        combo,
        settings.appShortcuts,
        Object.values(settings.styleShortcuts ?? DEFAULT_STYLE_SHORTCUTS),
      );
      if (problem) {
        setShortcutError(problem);
        return;
      }
      patch({ appShortcuts: { ...settings.appShortcuts, [recording]: normalizeCombo(combo) } });
      setRecording(null);
      setShortcutError(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, settings]);

  // 추가한 양식 JSON 파일로 내보내기
  const content = (
    <div
      className={`dialog settings-dialog ${isStandalone ? "settings-standalone-dialog" : ""}`}
      role="dialog"
      aria-label="설정"
      style={{
        transform: !isStandalone && (position.x || position.y) ? `translate(${position.x}px, ${position.y}px)` : undefined,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <header
        className="settings-header"
        onPointerDown={!isStandalone ? handlePointerDown : undefined}
      >
          <h2>설정</h2>
          <div className="settings-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "view"}
              className={tab === "view" ? "active" : ""}
              onClick={() => setTab("view")}
            >
              화면
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "writing"}
              className={tab === "writing" ? "active" : ""}
              onClick={() => setTab("writing")}
            >
              집필
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "shortcuts"}
              className={tab === "shortcuts" ? "active" : ""}
              onClick={() => setTab("shortcuts")}
            >
              단축키
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "backup"}
              className={tab === "backup" ? "active" : ""}
              onClick={() => setTab("backup")}
            >
              저장
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

              <div className="settings-item">
                <div className="settings-item-label">
                  <div className="settings-item-head">
                    <strong>하단 명대사</strong>
                    <input
                      type="checkbox"
                      aria-label="하단 명대사 보이기"
                      checked={settings.showFooterQuotes}
                      onChange={(e) => patch({ showFooterQuotes: e.target.checked })}
                    />
                  </div>
                  <span>화면 아래쪽 가운데에 한국 영화 명대사가 가끔 올라왔다 내려갑니다.</span>
                  <span className="settings-source">출처: 한국영상자료원 한국영화박물관 기획전시 &lt;대사극장: 한국영화를 만든 위대한 대사들&gt; 중에서</span>
                </div>
                <div className="settings-item-label settings-custom-head">
                  <span className="settings-subtitle">나만의 명대사</span>
                  <span>
                    최대 두 줄, 한 줄에 하나씩(줄마다 100자까지) 적으면 기본 명대사에 섞여 나옵니다. 적은 그대로 보이니 따옴표나 &lt;작품명&gt;도 직접 적어 주세요.
                  </span>
                </div>
                <textarea
                  className="settings-custom-quotes"
                  rows={2}
                  value={settings.customQuotes}
                  placeholder={'예: "살아있네!" <범죄와의 전쟁>'}
                  disabled={!settings.showFooterQuotes}
                  onChange={(e) => patch({ customQuotes: limitCustomQuotes(e.target.value) })}
                />
              </div>
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
                  <strong>씬헤딩(장소) 자동 완성</strong>
                  <span>씬헤딩(⌘1)을 입력할 때 앞에서 쓴 장소를 자동으로 추천합니다.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.sceneAutocomplete}
                  onChange={(e) => patch({ sceneAutocomplete: e.target.checked })}
                />
              </label>

              <label className="settings-toggle-row">
                <div className="settings-item-label">
                  <strong>원고 화면에 씬 번호 표시</strong>
                  <span>촬영고 표준에 맞춰 씬헤딩 좌우 여백에 씬 번호를 화면에 표시합니다.</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showSceneNumbers}
                  onChange={(e) => patch({ showSceneNumbers: e.target.checked })}
                />
              </label>
            </div>
          )}

          {tab === "shortcuts" && (
            <div className="settings-section">
              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>문장 스타일 단축키 (⌘ + 키)</strong>
                  <span>원고에서 각 문장 스타일로 변경하는 단축키를 설정합니다.</span>
                </div>
                <div className="settings-shortcuts-list">
                  {LINE_STYLES.map((style) => (
                    <div key={style} className="settings-shortcut-row">
                      <div className="settings-shortcut-label">
                        <span className="settings-style-pill">
                          {STYLE_LABELS[style]}
                        </span>
                      </div>
                      <div className="settings-shortcut-input-wrap">
                        <span className="settings-cmd-prefix">⌘</span>
                        <select
                          className="settings-select"
                          value={settings.styleShortcuts?.[style] ?? `${LINE_STYLES.indexOf(style) + 1}`}
                          onChange={(e) => {
                            const next = {
                              ...(settings.styleShortcuts ?? DEFAULT_STYLE_SHORTCUTS),
                              [style]: e.target.value,
                            };
                            patch({ styleShortcuts: next });
                          }}
                        >
                          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="settings-item-action-row">
                  <button
                    type="button"
                    className="settings-btn-inline"
                    onClick={() => patch({ styleShortcuts: DEFAULT_STYLE_SHORTCUTS })}
                  >
                    단축키 기본값(⌘1~⌘7)으로 복원
                  </button>
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>화면 단축키</strong>
                  <span>"바꾸기"를 누른 뒤 원하는 키(⌘와 함께)를 누르세요. 취소는 Esc입니다.</span>
                </div>
                <div className="settings-shortcuts-list">
                  {APP_SHORTCUT_IDS.map((id) => (
                    <div key={id} className="settings-shortcut-row">
                      <div className="settings-shortcut-label">
                        <span className="settings-style-pill">{APP_SHORTCUT_LABELS[id]}</span>
                      </div>
                      <div className="settings-shortcut-input-wrap">
                        <kbd className="settings-kbd">
                          {recording === id ? "키를 누르세요…" : formatCombo(settings.appShortcuts[id])}
                        </kbd>
                        <button
                          type="button"
                          className="settings-btn-inline"
                          onClick={() => {
                            setShortcutError(null);
                            setRecording(recording === id ? null : id);
                          }}
                        >
                          {recording === id ? "취소" : "바꾸기"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {shortcutError && <p className="settings-shortcut-error" role="alert">{shortcutError}</p>}
                <div className="settings-item-action-row">
                  <button
                    type="button"
                    className="settings-btn-inline"
                    onClick={() => {
                      setRecording(null);
                      setShortcutError(null);
                      patch({ appShortcuts: DEFAULT_APP_SHORTCUTS });
                    }}
                  >
                    화면 단축키 기본값으로 복원
                  </button>
                </div>
              </div>

              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>줄바꿈(Enter) 자동 스타일 전환 규칙</strong>
                  <span>줄 끝에서 Enter를 쳤을 때 다음 줄에 자동으로 이어질 스타일을 지정합니다.</span>
                </div>
                <div className="settings-rules-list">
                  {LINE_STYLES.map((style) => (
                    <div key={style} className="settings-rule-row">
                      <div className="settings-rule-source">
                        <span className="settings-style-pill">
                          {STYLE_LABELS[style]}
                        </span>
                        <span className="settings-rule-desc">줄 끝에서 Enter</span>
                      </div>
                      <span className="settings-rule-arrow">→</span>
                      <div className="settings-rule-target">
                        <select
                          className="settings-select"
                          value={settings.nextStyleOnEnter?.[style] ?? DEFAULT_NEXT_STYLE_RULES[style]}
                          onChange={(e) => {
                            const next = {
                              ...(settings.nextStyleOnEnter ?? DEFAULT_NEXT_STYLE_RULES),
                              [style]: e.target.value as LineStyle,
                            };
                            patch({ nextStyleOnEnter: next });
                          }}
                        >
                          {LINE_STYLES.map((targetStyle) => (
                            <option key={targetStyle} value={targetStyle}>
                              {STYLE_LABELS[targetStyle]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="settings-item-action-row">
                  <button
                    type="button"
                    className="settings-btn-inline"
                    onClick={() => patch({ nextStyleOnEnter: DEFAULT_NEXT_STYLE_RULES })}
                  >
                    줄바꿈 규칙 기본값으로 복원
                  </button>
                </div>
              </div>
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

          {tab === "backup" && (
            <div className="settings-section">
              <div className="settings-item">
                <div className="settings-item-label">
                  <strong>설정값만 기본값으로 되돌리기</strong>
                  <span>추가한 양식과 프로젝트는 그대로 두고, 화면·저장 설정만 기본값으로 되돌립니다.</span>
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
                    모든 설정, 추가한 양식, 최근 열었던 프로젝트 기록이 초기화되고 새 프로젝트로 시작합니다.
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
    );

    if (isStandalone) {
      return content;
    }

    return (
      <div className="dialog-backdrop" onMouseDown={onClose}>
        {content}
      </div>
    );
  }
