import { useEffect, useMemo, useRef, useState } from "react";
import { aiAsk, aiHasKey } from "./aiClient";
import { CONTEXT_LABELS, buildAskRequest, type ContextKind } from "./context";
import { AI_MODELS, type AiSettings } from "./models";
import type { ScriptLine } from "../editor/lineStyles";
import { useFloatingPosition, type Anchor } from "../editor/useFloatingPosition";

type Props = {
  quote: string;
  anchor: Anchor | null;
  lines: ScriptLine[];
  /** 고른 글이 시작하는 줄 (0부터) */
  lineIndex: number;
  ai: AiSettings;
  onConsent: () => void;
  onOpenSettings: () => void;
  /** 답을 메모로 저장한다 */
  onSaveAsNote: (text: string) => void;
  onClose: () => void;
};

const QUICK_QUESTIONS = ["더 자연스럽게 다듬어 줘", "어색하거나 문제가 되는 점이 있어?", "다른 표현 3가지를 제안해 줘"];

/** 고른 글에 대해 Claude에게 묻는 창 */
export function AskAiDialog({ quote, anchor, lines, lineIndex, ai, onConsent, onOpenSettings, onSaveAsNote, onClose }: Props) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [kind, setKind] = useState<ContextKind>("scene");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState<"idle" | "asking" | "done" | "error">("idle");
  const [error, setError] = useState("");
  const formRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const { style, handleProps } = useFloatingPosition(anchor, formRef);

  useEffect(() => {
    aiHasKey().then(setHasKey).catch(() => setHasKey(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      cancelRef.current?.();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => () => cancelRef.current?.(), []);

  const request = useMemo(
    () => buildAskRequest({ kind, quote, lines, lineIndex, question: question || "(질문)" }),
    [kind, quote, lines, lineIndex, question],
  );

  const send = (text = question) => {
    if (!text.trim() || status === "asking") return;
    const req = buildAskRequest({ kind, quote, lines, lineIndex, question: text });
    setQuestion(text);
    setAnswer("");
    setError("");
    setStatus("asking");
    cancelRef.current = aiAsk(
      { model: ai.model, system: req.system, messages: req.messages },
      {
        onDelta: (t) => setAnswer((a) => a + t),
        onDone: () => setStatus("done"),
        onError: (m) => {
          setError(m);
          setStatus("error");
        },
      },
    );
  };

  const stop = () => {
    cancelRef.current?.();
    setStatus("done");
  };

  let body;
  if (!ai.consented) {
    body = (
      <>
        <p className="ask-notice">
          AI에게 물으면 <strong>고른 글과 선택한 범위의 원고가 Anthropic 서버로 전송</strong>됩니다. 보내기 버튼을 누를 때만 전송되고, 자동으로
          보내지는 일은 없습니다. 이 설정은 설정 &gt; AI에서 언제든 바꿀 수 있어요.
        </p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            취소
          </button>
          <button type="button" className="primary" onClick={onConsent}>
            동의하고 계속
          </button>
        </div>
      </>
    );
  } else if (hasKey === false) {
    body = (
      <>
        <p className="ask-notice">아직 API 키가 없어요. 설정 &gt; AI에서 본인의 Anthropic API 키를 먼저 입력해 주세요.</p>
        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            닫기
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => {
              onOpenSettings();
              onClose();
            }}
          >
            설정 열기
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <div className="ask-row">
          <label>
            함께 보낼 글{" "}
            <select className="settings-select" value={kind} onChange={(e) => setKind(e.target.value as ContextKind)} disabled={status === "asking"}>
              {(Object.keys(CONTEXT_LABELS) as ContextKind[]).map((k) => (
                <option key={k} value={k}>
                  {CONTEXT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <span className="ask-meta">
            약 {request.contextTokens.toLocaleString("ko-KR")} 토큰 · {AI_MODELS[ai.model].label}
          </span>
        </div>
        <div className="ask-chips">
          {QUICK_QUESTIONS.map((q) => (
            <button key={q} type="button" className="settings-btn-inline" disabled={status === "asking"} onClick={() => send(q)}>
              {q}
            </button>
          ))}
        </div>
        <textarea
          className="ask-input"
          rows={3}
          value={question}
          placeholder="궁금한 점을 적으세요 (⌘Enter로 보내기)"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          autoFocus
        />
        {(answer || status === "asking") && (
          <div className="ask-answer" aria-live="polite">
            {answer || "생각하는 중…"}
          </div>
        )}
        {status === "error" && <p className="settings-shortcut-error">{error}</p>}
        <div className="dialog-actions">
          {status === "asking" ? (
            <button type="button" onClick={stop}>
              중단
            </button>
          ) : (
            <button type="button" onClick={onClose}>
              닫기
            </button>
          )}
          {answer && status !== "asking" && (
            <>
              <button type="button" onClick={() => navigator.clipboard?.writeText(answer).catch(() => {})}>
                복사
              </button>
              <button
                type="button"
                onClick={() => {
                  onSaveAsNote(answer);
                  onClose();
                }}
              >
                메모로 저장
              </button>
            </>
          )}
          <button type="button" className="primary" disabled={!question.trim() || status === "asking"} onClick={() => send()}>
            {status === "done" || status === "error" ? "다시 묻기" : "보내기"}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="dialog-backdrop note-backdrop" onMouseDown={onClose}>
      <div className="dialog note-dialog ask-dialog" role="dialog" aria-label="AI에게 묻기" ref={formRef} style={style} onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="note-drag-handle" title="끌어서 위치 옮기기" {...handleProps}>
          AI에게 묻기
        </h2>
        <p className="note-quote">“{quote.length > 80 ? `${quote.slice(0, 80)}…` : quote}”</p>
        {body}
      </div>
    </div>
  );
}
