import { useState } from "react";
import { formatEighths, type ScriptAnalysis, type SceneSummary } from "../analysis/analyze";
import { groupScenesByPlace } from "../analysis/places";

type Props = {
  analysis: ScriptAnalysis;
  currentSceneLine: number | null;
  onSelectScene: (line: number) => void;
  onSelectCharacter: (name: string) => void;
  /** 이 인물의 인물 설정 문서가 있는지 */
  hasProfile: (name: string) => boolean;
  /** 인물 설정 열기 (없으면 만든다) */
  onOpenProfile: (name: string) => void;
  onRenameCharacter: (name: string) => void;
};

const fmt = new Intl.NumberFormat("ko-KR");

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** 오른쪽 통계 화면 */
export function StatsPanel({
  analysis,
  currentSceneLine,
  onSelectScene,
  onSelectCharacter,
  hasProfile,
  onOpenProfile,
  onRenameCharacter,
}: Props) {
  const { scenes, characters } = analysis;
  // 인물 · 장소를 눌러 펼친 씬 목록
  const [openCharacters, setOpenCharacters] = useState<Set<string>>(new Set());
  const [openPlaces, setOpenPlaces] = useState<Set<string>>(new Set());
  const places = groupScenesByPlace(scenes);
  const toggleIn = (setter: typeof setOpenCharacters, key: string) =>
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const sceneChips = (list: { line: number; number: number }[]) => (
    <div className="scene-chips">
      {list.map((sc) => (
        <button
          key={sc.line}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelectScene(sc.line)}
        >
          #{sc.number}
        </button>
      ))}
    </div>
  );
  const textTotal = analysis.dialogueChars + analysis.actionChars;
  const dialoguePct = percent(analysis.dialogueChars, textTotal);
  const maxChars = Math.max(1, ...characters.map((c) => c.dialogueChars));
  const maxEighths = Math.max(1, ...scenes.map((s) => s.eighths));
  const longest = [...scenes].sort((a, b) => b.eighths - a.eighths).slice(0, 5);

  return (
    <aside className="panel stats-panel" aria-label="통계">
      <header className="panel-header">
        <h2>통계</h2>
      </header>

      <div className="panel-body">
        <section className="stat-tiles">
          <div className="stat-tile">
            <span className="stat-label">페이지</span>
            <span className="stat-value">{fmt.format(analysis.pages)}</span>
          </div>
          <div className="stat-tile" title="할리우드 표준 형식(1페이지 ≈ 1분)으로 계산한 값입니다.">
            <span className="stat-label">예상 러닝타임</span>
            <span className="stat-value">
              {fmt.format(analysis.runtimeMinutes)}
              <small>분</small>
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">씬</span>
            <span className="stat-value">{fmt.format(scenes.length)}</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">인물</span>
            <span className="stat-value">{fmt.format(characters.length)}</span>
          </div>
        </section>

        <section className="stat-section">
          <h3>대사와 지문</h3>
          {textTotal === 0 ? (
            <p className="panel-empty">아직 글이 없습니다.</p>
          ) : (
            <>
              <div
                className="ratio-bar"
                role="img"
                aria-label={`대사 ${dialoguePct}%, 지문 ${100 - dialoguePct}%`}
              >
                {dialoguePct > 0 && (
                  <span
                    className="ratio-dialogue"
                    style={{ flexGrow: analysis.dialogueChars }}
                    title={`대사 ${fmt.format(analysis.dialogueChars)}자 (${dialoguePct}%)`}
                  />
                )}
                {dialoguePct < 100 && (
                  <span
                    className="ratio-action"
                    style={{ flexGrow: analysis.actionChars }}
                    title={`지문 ${fmt.format(analysis.actionChars)}자 (${100 - dialoguePct}%)`}
                  />
                )}
              </div>
              <div className="ratio-legend">
                <span>
                  <i className="swatch ratio-dialogue" /> 대사 {dialoguePct}%
                </span>
                <span>
                  <i className="swatch ratio-action" /> 지문 {100 - dialoguePct}%
                </span>
              </div>
            </>
          )}
        </section>

        <section className="stat-section">
          <h3>인물별 대사량</h3>
          {characters.length === 0 ? (
            <p className="panel-empty">인물(⌘3)과 대사(⌘5)를 쓰면 나타납니다.</p>
          ) : (
            <ul className="bar-list">
              {characters.map((c) => (
                <li key={c.name}>
                  <button
                    type="button"
                    className="bar-row"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelectCharacter(c.name)}
                    title={`${c.name}: 대사 ${fmt.format(c.speeches)}회, ${fmt.format(c.dialogueChars)}자, ${c.scenes}개 씬 (첫 등장 #${c.firstScene}) — 누르면 사이드바에서 등장 씬 찾기`}
                  >
                    <span className="bar-label">{c.name}</span>
                    <span className="bar-track">
                      <span
                        className="bar-fill"
                        style={{ width: `${Math.max(2, (c.dialogueChars / maxChars) * 100)}%` }}
                      />
                    </span>
                    <span className="bar-value">{fmt.format(c.dialogueChars)}자</span>
                    <span className="bar-sub">
                      대사 {fmt.format(c.speeches)}회 · 씬 {c.scenes}개
                    </span>
                  </button>
                  <div className="bar-actions">
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onOpenProfile(c.name)}
                      title={hasProfile(c.name) ? "인물 설정 문서 열기" : "인물 설정 문서 만들기"}
                    >
                      {hasProfile(c.name) ? "설정 열기" : "+ 설정 만들기"}
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onRenameCharacter(c.name)}
                      title="원고 전체에서 이 인물 이름 바꾸기"
                    >
                      이름 바꾸기
                    </button>
                    <button
                      type="button"
                      aria-expanded={openCharacters.has(c.name)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleIn(setOpenCharacters, c.name)}
                      title="이 인물이 나오는 씬 보기"
                    >
                      {openCharacters.has(c.name) ? "등장 씬 접기" : "등장 씬"}
                    </button>
                  </div>
                  {openCharacters.has(c.name) && sceneChips(scenes.filter((sc) => sc.characters.includes(c.name)))}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="stat-section">
          <h3>장소별 씬</h3>
          {places.length === 0 ? (
            <p className="panel-empty">씬헤딩(⌘1)을 쓰면 나타납니다.</p>
          ) : (
            <ul className="place-list">
              {places.map((g) => (
                <li key={g.place}>
                  <button
                    type="button"
                    className="place-row"
                    aria-expanded={openPlaces.has(g.place)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggleIn(setOpenPlaces, g.place)}
                    title="누르면 이 장소가 나오는 씬을 펼칩니다"
                  >
                    <span className="bar-label">{g.place}</span>
                    <span className="bar-value">씬 {g.scenes.length}개</span>
                  </button>
                  {openPlaces.has(g.place) && sceneChips(g.scenes)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="stat-section">
          <h3>씬 길이</h3>
          {scenes.length === 0 ? (
            <p className="panel-empty">씬헤딩(⌘1)을 쓰면 나타납니다.</p>
          ) : (
            <>
              <div className="scene-columns" role="list" aria-label="씬별 길이 (1/8페이지 단위)">
                {scenes.map((s: SceneSummary) => (
                  <button
                    key={s.line}
                    type="button"
                    role="listitem"
                    className={s.line === currentSceneLine ? "scene-column current" : "scene-column"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onSelectScene(s.line)}
                    title={`#${s.number}. · ${formatEighths(s.eighths)}페이지 · ${s.heading.replace(/^(?:S#|#)\s*\d+\.?\s*/i, "")}`}
                  >
                    <span style={{ height: `${Math.max(4, (s.eighths / maxEighths) * 100)}%` }} />
                  </button>
                ))}
              </div>
              <p className="scene-columns-caption">
                막대 하나가 씬 하나입니다. 누르면 그 씬으로 이동합니다.
              </p>
              <h4>가장 긴 씬</h4>
              <ol className="longest-list">
                {longest.map((s) => (
                  <li key={s.line}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelectScene(s.line)}
                    >
                      <span className="scene-number">#{s.number}.</span>
                      <span className="scene-heading">{s.heading.replace(/^(?:S#|#)\s*\d+\.?\s*/i, "")}</span>
                      <span className="bar-value">{formatEighths(s.eighths)}p</span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </div>
    </aside>
  );
}
