import { useEffect, useMemo, useRef } from "react";
import { formatEighths, type SceneSummary } from "../analysis/analyze";

type Props = {
  scenes: SceneSummary[];
  currentLine: number;
  filter: string;
  onFilterChange: (value: string) => void;
  onSelect: (line: number) => void;
};

/** 왼쪽 씬 목록. 누르면 그 씬으로 이동하고, 지금 쓰고 있는 씬을 표시한다. */
export function ScenePanel({ scenes, currentLine, filter, onFilterChange, onSelect }: Props) {
  const listRef = useRef<HTMLOListElement>(null);

  const currentNumber = useMemo(() => {
    let found: SceneSummary | null = null;
    for (const scene of scenes) {
      if (scene.line > currentLine) break;
      found = scene;
    }
    return found?.line ?? null;
  }, [scenes, currentLine]);

  const query = filter.trim().toUpperCase();
  const shown = query
    ? scenes.filter(
        (s) =>
          s.heading.toUpperCase().includes(query) ||
          s.characters.some((c) => c.toUpperCase().includes(query)),
      )
    : scenes;

  // 지금 쓰고 있는 씬이 목록에서 보이도록 스크롤한다.
  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>("[aria-current='true']");
    item?.scrollIntoView({ block: "nearest" });
  }, [currentNumber]);

  return (
    <aside className="panel scene-panel" aria-label="씬 목록">
      <header className="panel-header">
        <h2>씬 목록</h2>
        <span className="panel-count">{scenes.length}개</span>
      </header>
      <div className="panel-search">
        <input
          type="search"
          placeholder="장소나 인물로 찾기"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          spellCheck={false}
        />
      </div>
      {scenes.length === 0 ? (
        <p className="panel-empty">씬헤딩(⌘1)을 쓰면 여기에 씬이 나타납니다.</p>
      ) : shown.length === 0 ? (
        <p className="panel-empty">"{filter}"이(가) 나오는 씬이 없습니다.</p>
      ) : (
        <ol className="scene-list" ref={listRef}>
          {shown.map((scene) => {
            const heading = scene.heading.replace(/^S#\d+\.\s*/, "");
            return (
              <li key={scene.line}>
                <button
                  type="button"
                  className="scene-item"
                  aria-current={scene.line === currentNumber}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(scene.line)}
                >
                  <span className="scene-number">S#{scene.number}</span>
                  <span className="scene-heading">{heading}</span>
                  <span className="scene-meta">
                    {scene.page}p · {formatEighths(scene.eighths)}
                    {scene.characters.length > 0 && ` · ${scene.characters.join(", ")}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
