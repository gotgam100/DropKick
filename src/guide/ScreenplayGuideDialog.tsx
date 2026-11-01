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

/** 가이드 가운데 용지에 보여 줄 줄들: 예시 스크립트의 첫 씬 전체 (넘치면 스크롤) */
function firstSceneLines(): InfographicLine[] {
  const lines = fromFountain(SAMPLE_KOREAN_SCRIPT_FOUNTAIN).lines;
  const out: InfographicLine[] = [];
  let scenes = 0;
  for (const [i, line] of lines.entries()) {
    if (line.style === "scene") {
      scenes += 1;
      if (scenes > 1) break;
    }
    out.push({
      id: `l${i}`,
      style: line.style,
      text: line.text,
      ...(line.style === "scene" ? { sceneNum: scenes } : {}),
      ...(line.style === "action" && out[out.length - 1]?.style === "action" ? { continued: true } : {}),
    });
  }
  return out;
}

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

  const infographicLines = useMemo(firstSceneLines, []);

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
                  {infographicLines.map((line) => {
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
