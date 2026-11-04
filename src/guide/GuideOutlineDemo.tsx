/**
 * 가이드 2쪽 표 안에 들어가는 막 · 시퀀스 · 씬 요약 예시 그림.
 * 예시 스크립트 <잃어버린 외장하드를 찾는 이상한 모험>의 첫 씬에 막·시퀀스·요약을 얹은 모습을
 * 원고 화면과 씬 목록으로 나란히 보여 준다. 줄에 마우스를 올리면 양쪽에서 같은 줄이 주황색으로 보인다.
 */
import { useMemo, useState } from "react";
import { fromFountain } from "../fountain/fountain";
import { SAMPLE_KOREAN_SCRIPT_FOUNTAIN } from "./sampleScript";

type Kind = "act" | "chapter" | "synopsis";

const ACT = "1막: 외장하드가 사라졌다";
const CHAPTER = "A. 이상한 아침";
const SYNOPSIS = "미숙이 외장하드가 없어진 것을 알게 된다.";

function Chevron({ open = true }: { open?: boolean }) {
  return (
    <svg className={open ? "tree-chevron open" : "tree-chevron"} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** 예시 스크립트 첫 씬의 씬헤딩과, 이어지는 몇 줄 (액션·인물·대사) */
function sampleScene() {
  const lines = fromFountain(SAMPLE_KOREAN_SCRIPT_FOUNTAIN).lines;
  const start = lines.findIndex((l) => l.style === "scene");
  const heading = lines[start].text;
  const body = lines.slice(start + 1, start + 5).filter((l) => l.style !== "scene");
  return { heading, body };
}

export function GuideOutlineDemo() {
  const [hover, setHover] = useState<Kind | null>(null);
  const { heading, body } = useMemo(sampleScene, []);
  const orange = (kind: Kind) => (hover === kind ? " guide-line-orange" : "");
  const textOrange = (kind: Kind) => (hover === kind ? " text-orange" : "");

  return (
    <div className="guide-outline-demo">
      <div className="guide-quick-cols">
        <div className="guide-quick-pane">
          <div className="guide-quick-label">씬 목록</div>
          <div className="guide-sidebar-demo" aria-label="사이드바 씬 목록 예시">
            <div
              className={`tree-row tree-section tree-section-act${orange("act")}`}
              style={{ paddingLeft: 4 }}
              onMouseEnter={() => setHover("act")}
              onMouseLeave={() => setHover(null)}
            >
              <span className="tree-toggle">
                <Chevron />
              </span>
              <span className="tree-section-tag">막</span>
              <span className={`tree-name${textOrange("act")}`}>{ACT}</span>
            </div>
            <div
              className={`tree-row tree-section tree-section-chapter${orange("chapter")}`}
              style={{ paddingLeft: 14 }}
              onMouseEnter={() => setHover("chapter")}
              onMouseLeave={() => setHover(null)}
            >
              <span className="tree-toggle">
                <Chevron />
              </span>
              <span className="tree-section-tag">시퀀스</span>
              <span className={`tree-name${textOrange("chapter")}`}>{CHAPTER}</span>
            </div>
            <div className="tree-row tree-scene" style={{ paddingLeft: 22 }}>
              <span className="tree-twisty">
                <Chevron />
              </span>
              <span className="scene-number">1.</span>
              <span className="tree-name">{heading}</span>
            </div>
            <div
              className={`tree-synopsis${orange("synopsis")}`}
              style={{ marginLeft: 38 }}
              onMouseEnter={() => setHover("synopsis")}
              onMouseLeave={() => setHover(null)}
            >
              <p>{SYNOPSIS}</p>
            </div>
          </div>
        </div>

        <div className="guide-quick-pane">
          <div className="guide-quick-label">원고</div>
          <div className="guide-paper-col guide-quick-paper">
            <div className="guide-paper-container paper">
              <div className="guide-paper-content">
                <div className={`cm-line sl sl-act${orange("act")}`} onMouseEnter={() => setHover("act")} onMouseLeave={() => setHover(null)}>
                  {ACT}
                </div>
                <div
                  className={`cm-line sl sl-chapter sl-continued${orange("chapter")}`}
                  onMouseEnter={() => setHover("chapter")}
                  onMouseLeave={() => setHover(null)}
                >
                  {CHAPTER}
                </div>
                <div className="cm-line sl sl-scene">
                  <span className="cm-scene-number cm-scene-num-left">1</span>
                  <span className="cm-scene-number cm-scene-num-right">1</span>
                  {heading}
                </div>
                <div
                  className={`cm-line sl sl-synopsis${orange("synopsis")}`}
                  onMouseEnter={() => setHover("synopsis")}
                  onMouseLeave={() => setHover(null)}
                >
                  {SYNOPSIS}
                </div>
                {body.map((line, i) => (
                  <div
                    key={i}
                    className={`cm-line sl sl-${line.style}${line.style === "action" && body[i - 1]?.style === "action" ? " sl-continued" : ""}`}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
