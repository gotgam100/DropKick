import { useEffect, useMemo, useRef, useState } from "react";
import {
  SAMPLE_KOREAN_SCRIPT_TITLE,
  SAMPLE_KOREAN_SCRIPT_FOUNTAIN,
} from "./sampleScript";
import {
  STYLE_LABELS,
  shortcutFor,
  type LineStyle,
} from "../editor/styles";
import { fromFountain } from "../fountain/fountain";
import {
  copyScriptPayloadToClipboard,
  type ScriptClipboardPayload,
} from "../editor/clipboard";

export const GUIDE_SEEN_KEY = "dropkick.guide.seen.v1";

type Props = {
  onClose: () => void;
  onLoadSampleProject?: (title: string, fountainText: string) => void;
  isStandalone?: boolean;
};

const STYLE_EN_NAMES: Record<LineStyle, string> = {
  scene: "SCENE HEADING",
  action: "ACTION",
  character: "CHARACTER",
  parenthetical: "PARENTHETICAL",
  dialogue: "DIALOGUE",
  subheader: "SUBHEADER",
  transition: "TRANSITION",
};

interface InfographicLine {
  id: string;
  style: LineStyle;
  text: string;
  sceneNum?: number;
  continued?: boolean;
}

const INFOGRAPHIC_LINES: InfographicLine[] = [
  { id: "l1", style: "transition", text: "FADE IN:" },
  { id: "l2", style: "scene", text: "외부. 시계 수리점 앞 - 저녁", sceneNum: 1 },
  { id: "l3", style: "action", text: "저녁 노을이 낡은 간판을 붉게 물들인다. 쇼윈도 너머로 수백 개의 시계가 제각각 째깍거린다." },
  { id: "l4", style: "action", text: "문 앞 의자에 앉은 민재(70대)가 돋보기를 끼고 고장 난 손목시계의 뒤판을 연다.", continued: true },
  { id: "l5", style: "character", text: "민재" },
  { id: "l6", style: "dialogue", text: "오래도 버텼다, 이 녀석." },
  { id: "l7", style: "dialogue", text: "그래도 한 번만 더 돌아가 보자." },
  { id: "l8", style: "action", text: "갑자기 골목 끝에서 자전거 벨이 짤랑거린다." },
  { id: "l9", style: "action", text: "민재가 천천히 고개를 든다.", continued: true },
  { id: "l10", style: "transition", text: "CUT TO:" },
  { id: "l11", style: "scene", text: "내부. 수아의 방 - 밤", sceneNum: 2 },
  { id: "l12", style: "action", text: "책상 위 스탠드 불빛만 켜져 있다. 벽에 걸린 낡은 손목시계가 멈춰 있다." },
  { id: "l13", style: "action", text: "수아(30대)가 그 시계를 두 손에 쥐고 한참을 들여다본다.", continued: true },
  { id: "l14", style: "action", text: "책상 위 스마트폰이 진동한다. 수아가 통화 버튼을 누른다.", continued: true },
  { id: "l15", style: "character", text: "수아" },
  { id: "l16", style: "parenthetical", text: "(조심스러운 목소리로)" },
  { id: "l17", style: "dialogue", text: "어르신, 이 시계 아직 고칠 수 있을까요?" },
  { id: "l18", style: "character", text: "민재 (V.O.)" },
  { id: "l19", style: "dialogue", text: "가져오너라. 가게 문은 열려 있다." },
  { id: "l20", style: "subheader", text: "집 안 거실" },
  { id: "l21", style: "action", text: "수아가 외투를 걸치고 방을 나선다. 불 꺼진 거실이 고요하다." },
  { id: "l22", style: "action", text: "벽시계 초침 소리만 어둠 속에서 나직하게 째깍거린다.", continued: true },
  { id: "l23", style: "action", text: "현관 앞에서 수아가 열쇠를 집어 들고 불을 끈다.", continued: true },
  { id: "l24", style: "transition", text: "FADE OUT." },
];

export function ScreenplayGuideDialog({ onClose, onLoadSampleProject, isStandalone }: Props) {
  const [hoveredStyle, setHoveredStyle] = useState<string | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(() => {
    return localStorage.getItem(GUIDE_SEEN_KEY) === "true";
  });
  const [copied, setCopied] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const dragRef = useRef<{
    startX: number;
    startY: number;
    posX: number;
    posY: number;
  } | null>(null);

  const sampleScriptLines = useMemo(() => {
    return fromFountain(SAMPLE_KOREAN_SCRIPT_FOUNTAIN).lines;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dontShowAgain]);

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // 버튼, 입력 요소 등을 클릭할 때는 드래그하지 않음
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

  const handleClose = () => {
    if (dontShowAgain) {
      localStorage.setItem(GUIDE_SEEN_KEY, "true");
    } else {
      localStorage.removeItem(GUIDE_SEEN_KEY);
    }
    onClose();
  };

  const handleCopyScript = async () => {
    try {
      const text = sampleScriptLines.map((l) => l.text).join("\n");
      const styles = sampleScriptLines.map((l) => l.style);
      const payload: ScriptClipboardPayload = {
        version: 1,
        text,
        styles,
        isFullLine: true,
      };
      await copyScriptPayloadToClipboard(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사 권한 등 예외 처리
    }
  };

  const handleLoadSample = () => {
    if (onLoadSampleProject) {
      if (dontShowAgain) localStorage.setItem(GUIDE_SEEN_KEY, "true");
      onLoadSampleProject(SAMPLE_KOREAN_SCRIPT_TITLE, SAMPLE_KOREAN_SCRIPT_FOUNTAIN);
      onClose();
    }
  };

  const content = (
    <div
      className={`dialog guide-dialog ${isStandalone ? "guide-standalone-dialog" : ""}`}
      role="dialog"
      aria-label="시나리오 작성 가이드"
      style={{
        transform: !isStandalone && (position.x || position.y) ? `translate(${position.x}px, ${position.y}px)` : undefined,
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <header
        className="guide-header"
        onPointerDown={!isStandalone ? handlePointerDown : undefined}
      >
          <div className="guide-title-row">
            <div className="guide-title-wrap">
              <h2>📖 시나리오 작성 가이드</h2>
            </div>
            <div
              className="guide-header-actions"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="style-button"
                onClick={handleCopyScript}
                title="예시 스크립트 복사 (붙여넣기 시 7가지 스타일 유지)"
              >
                {copied ? "✓ 복사 완료!" : "📋 예시 스크립트 복사"}
              </button>
              {onLoadSampleProject && (
                <button
                  type="button"
                  className="style-button guide-action-primary"
                  onClick={handleLoadSample}
                  title="이 예시 스크립트로 새 프로젝트를 시작합니다"
                >
                  ✨ 이 예시로 새 프로젝트 시작
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="guide-body">
          <div className="guide-infographic-board">
            {/* 좌측 설명 카드 열 */}
            <div className="guide-callouts-col guide-col-left">
              <div
                className={`guide-callout-card ${hoveredStyle === "scene" ? "active" : ""}`}
                onMouseEnter={() => setHoveredStyle("scene")}
                onMouseLeave={() => setHoveredStyle(null)}
              >
                <div className="guide-card-head">
                  <span className="guide-ko-title">{STYLE_LABELS.scene}</span>
                  <span className="guide-en-sub">{STYLE_EN_NAMES.scene}</span>
                  <kbd className="guide-kbd">{shortcutFor("scene")}</kbd>
                </div>
                <p className="guide-card-desc">장면의 시작 장소와 시간대 표기.</p>
              </div>

              <div
                className={`guide-callout-card ${hoveredStyle === "sceneNum" ? "active" : ""}`}
                onMouseEnter={() => setHoveredStyle("sceneNum")}
                onMouseLeave={() => setHoveredStyle(null)}
              >
                <div className="guide-card-head">
                  <span className="guide-ko-title">씬 번호</span>
                  <span className="guide-en-sub">SCENE NUMBER</span>
                  <span className="guide-auto-tag">자동</span>
                </div>
                <p className="guide-card-desc">할리우드 표준에 따라 씬헤딩의 좌우 양쪽 여백에 일관되게 자동 표시.</p>
              </div>

              <div
                className={`guide-callout-card ${hoveredStyle === "subheader" ? "active" : ""}`}
                onMouseEnter={() => setHoveredStyle("subheader")}
                onMouseLeave={() => setHoveredStyle(null)}
              >
                <div className="guide-card-head">
                  <span className="guide-ko-title">{STYLE_LABELS.subheader}</span>
                  <span className="guide-en-sub">{STYLE_EN_NAMES.subheader}</span>
                  <kbd className="guide-kbd">{shortcutFor("subheader")}</kbd>
                </div>
                <p className="guide-card-desc">씬 장소 내 소구역 이동 및 상황 묘사.</p>
              </div>

              <div
                className={`guide-callout-card ${hoveredStyle === "transition" ? "active" : ""}`}
                onMouseEnter={() => setHoveredStyle("transition")}
                onMouseLeave={() => setHoveredStyle(null)}
              >
                <div className="guide-card-head">
                  <span className="guide-ko-title">{STYLE_LABELS.transition}</span>
                  <span className="guide-en-sub">{STYLE_EN_NAMES.transition}</span>
                  <kbd className="guide-kbd">{shortcutFor("transition")}</kbd>
                </div>
                <p className="guide-card-desc">씬과 씬 사이의 화면 전환 지시어 (우측 정렬).</p>
              </div>
            </div>

            {/* 중앙: 축소된 실제 예시 스크립트 용지 */}
            <div className="guide-paper-col">
              <div className="guide-paper-container paper">
                <div className="guide-paper-content">
                  {INFOGRAPHIC_LINES.map((line) => {
                    const isSceneNumHovered = hoveredStyle === "sceneNum" && line.sceneNum !== undefined;
                    const isStyleHovered = hoveredStyle === line.style;
                    const isLineOrange = isStyleHovered;
                    const isNumOrange = isStyleHovered || isSceneNumHovered;

                    return (
                      <div
                        key={line.id}
                        className={`cm-line sl sl-${line.style} ${
                          line.continued ? "sl-continued" : ""
                        } ${isLineOrange ? "guide-line-orange" : ""}`}
                        onMouseEnter={() => setHoveredStyle(line.style)}
                        onMouseLeave={() => setHoveredStyle(null)}
                      >
                        {line.sceneNum !== undefined && (
                          <>
                            <span
                              className={`cm-scene-number cm-scene-num-left ${
                                isNumOrange ? "text-orange" : ""
                              }`}
                            >
                              {line.sceneNum}
                            </span>
                            <span
                              className={`cm-scene-number cm-scene-num-right ${
                                isNumOrange ? "text-orange" : ""
                              }`}
                            >
                              {line.sceneNum}
                            </span>
                          </>
                        )}
                        <span
                          className={`guide-line-text ${isLineOrange ? "text-orange" : ""}`}
                        >
                          {line.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 우측 설명 카드 열 */}
            <div className="guide-callouts-col guide-col-right">
              <div
                className={`guide-callout-card ${hoveredStyle === "action" ? "active" : ""}`}
                onMouseEnter={() => setHoveredStyle("action")}
                onMouseLeave={() => setHoveredStyle(null)}
              >
                <div className="guide-card-head">
                  <span className="guide-ko-title">{STYLE_LABELS.action}</span>
                  <span className="guide-en-sub">{STYLE_EN_NAMES.action}</span>
                  <kbd className="guide-kbd">{shortcutFor("action")}</kbd>
                </div>
                <p className="guide-card-desc">인물의 행동 및 시각적 장면 묘사.</p>
              </div>

              <div
                className={`guide-callout-card ${hoveredStyle === "character" ? "active" : ""}`}
                onMouseEnter={() => setHoveredStyle("character")}
                onMouseLeave={() => setHoveredStyle(null)}
              >
                <div className="guide-card-head">
                  <span className="guide-ko-title">{STYLE_LABELS.character}</span>
                  <span className="guide-en-sub">{STYLE_EN_NAMES.character}</span>
                  <kbd className="guide-kbd">{shortcutFor("character")}</kbd>
                </div>
                <p className="guide-card-desc">대사를 말하는 등장인물의 이름 (중앙 정렬).</p>
              </div>

              <div
                className={`guide-callout-card ${hoveredStyle === "parenthetical" ? "active" : ""}`}
                onMouseEnter={() => setHoveredStyle("parenthetical")}
                onMouseLeave={() => setHoveredStyle(null)}
              >
                <div className="guide-card-head">
                  <span className="guide-ko-title">{STYLE_LABELS.parenthetical}</span>
                  <span className="guide-en-sub">{STYLE_EN_NAMES.parenthetical}</span>
                  <kbd className="guide-kbd">{shortcutFor("parenthetical")}</kbd>
                </div>
                <p className="guide-card-desc">배우의 어조, 감정 상태, 소소한 행동 지시.</p>
              </div>

              <div
                className={`guide-callout-card ${hoveredStyle === "dialogue" ? "active" : ""}`}
                onMouseEnter={() => setHoveredStyle("dialogue")}
                onMouseLeave={() => setHoveredStyle(null)}
              >
                <div className="guide-card-head">
                  <span className="guide-ko-title">{STYLE_LABELS.dialogue}</span>
                  <span className="guide-en-sub">{STYLE_EN_NAMES.dialogue}</span>
                  <kbd className="guide-kbd">{shortcutFor("dialogue")}</kbd>
                </div>
                <p className="guide-card-desc">등장인물이 말하는 대사 본문 (중앙 블록 정렬).</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="guide-footer">
          <label className="guide-dont-show">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
            />
            <span>다음부터 앱을 시작할 때 자동으로 열지 않기</span>
          </label>

        <div className="guide-footer-buttons">
          <button
            type="button"
            className="style-button guide-footer-close"
            onClick={handleClose}
          >
            닫기
          </button>
        </div>
      </footer>
    </div>
  );

  if (isStandalone) {
    return content;
  }

  return (
    <div className="dialog-backdrop guide-dialog-backdrop" onMouseDown={handleClose}>
      {content}
    </div>
  );
}
