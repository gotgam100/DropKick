import { useEffect, useState } from "react";
import { LINE_STYLES, STYLE_LABELS, type LineStyle } from "../editor/styles";
import type { Answers, Question } from "./types";

type Props = {
  questions: Question[];
  onAnswer: (answers: Answers | null) => void;
};

/** 분석 전에 확실하지 않은 부분만 골라 작가에게 물어보는 창 */
export function ImportQuestionDialog({ questions, onAnswer }: Props) {
  const cover = questions.find((q) => q.id === "cover");
  const character = questions.find((q) => q.id === "character");
  const subheader = questions.find((q) => q.id === "subheader");

  const [isCover, setIsCover] = useState(true);
  const [title, setTitle] = useState(cover?.title ?? "");
  // 인물 위치: 맨 앞 보기를 미리 고르고, "인물 이름 줄 없음"은 -1
  const [characterX, setCharacterX] = useState<number>(character?.options[0]?.x ?? -1);
  // 헷갈린 줄마다 스타일 고르기 (처음에는 서브 헤더)
  const [lineStyles, setLineStyles] = useState<Record<string, LineStyle>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onAnswer(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onAnswer]);

  const submit = () => {
    const answers: Answers = {};
    if (cover) answers.cover = { isCover, title };
    if (character) answers.characterX = characterX < 0 ? null : characterX;
    if (subheader) answers.lineStyles = Object.fromEntries(subheader.samples.map((t) => [t, lineStyles[t] ?? "subheader"]));
    onAnswer(answers);
  };

  return (
    <div className="dialog-backdrop">
      <form
        className="dialog import-result"
        role="dialog"
        aria-label="가져오기 전 확인"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h2>가져오기 전에 확인할게요</h2>
        <p className="dialog-hint">글자 위치만으로는 확실하지 않은 부분입니다. 답해 주시면 그대로 반영해서 가져옵니다.</p>

        {cover && (
          <section className="import-section">
            <h3>첫 쪽이 표지인가요?</h3>
            <label className="import-choice">
              <input type="radio" name="cover" checked={isCover} onChange={() => setIsCover(true)} />
              <span>네, 표지입니다 (본문에서 뺍니다)</span>
            </label>
            {isCover && (
              <label className="dialog-field import-title">
                <span>제목</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
            )}
            <label className="import-choice">
              <input type="radio" name="cover" checked={!isCover} onChange={() => setIsCover(false)} />
              <span>아니요, 본문에 포함합니다</span>
            </label>
          </section>
        )}

        {character && (
          <section className="import-section">
            <h3>인물 이름은 어느 글인가요?</h3>
            <p className="import-group-hint">대사 앞에 나오는 인물 이름이 적힌 쪽을 골라 주세요.</p>
            {character.options.map((option) => (
              <label className="import-choice" key={option.x}>
                <input type="radio" name="character" checked={characterX === option.x} onChange={() => setCharacterX(option.x)} />
                <span>{option.samples.join(" · ")}</span>
              </label>
            ))}
            <label className="import-choice">
              <input type="radio" name="character" checked={characterX < 0} onChange={() => setCharacterX(-1)} />
              <span>이 중에는 없어요 (인물 이름 줄이 따로 없습니다)</span>
            </label>
          </section>
        )}

        {subheader && (
          <section className="import-section">
            <h3>이 줄들은 어떤 요소인가요?</h3>
            <p className="import-group-hint">본문과 글씨체가 달라서 자동으로 정하기 어려웠던 줄입니다. 줄마다 요소을 골라 주세요.</p>
            {subheader.samples.map((text) => (
              <label className="import-choice import-line" key={text}>
                <span className="import-line-text">{text}</span>
                <select
                  value={lineStyles[text] ?? "subheader"}
                  onChange={(e) => setLineStyles({ ...lineStyles, [text]: e.target.value as LineStyle })}
                >
                  {LINE_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {STYLE_LABELS[style]}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </section>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={() => onAnswer(null)}>
            가져오기 취소
          </button>
          <button type="submit" className="primary" autoFocus>
            이대로 가져오기
          </button>
        </div>
      </form>
    </div>
  );
}
