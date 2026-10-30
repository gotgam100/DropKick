import { useEffect, useState } from "react";
import { aiDeleteKey, aiHasKey, aiSetKey, aiTest } from "../ai/aiClient";
import { AI_MODEL_IDS, AI_MODELS, type AiModelId } from "../ai/models";
import { loadUsage } from "../ai/usage";
import type { AppSettings } from "./settings";

type Props = {
  settings: AppSettings;
  patch: (partial: Partial<AppSettings>) => void;
};

/** 설정 > AI: Claude API 키 입력, 모델 고르기, 연결 확인 */
export function AiSettingsSection({ settings, patch }: Props) {
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const usage = loadUsage();

  useEffect(() => {
    aiHasKey().then(setHasKey).catch(() => setHasKey(false));
  }, []);

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ ok: true, text: await task() });
    } catch (e) {
      setMessage({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="settings-item">
        <div className="settings-item-label">
          <strong>Claude API 키</strong>
          <span>
            본인의 Anthropic API 키를 넣으면 원고에 대해 AI에게 물어볼 수 있어요. 키는 이 맥의 키체인에만 저장되고, 프로젝트 파일이나
            설정 파일에는 들어가지 않습니다. 사용 요금은 본인의 Anthropic 계정으로 청구됩니다.
          </span>
          <span className="settings-ai-status">
            {hasKey === null ? "확인 중…" : hasKey ? "✅ 키가 저장되어 있어요" : "키가 아직 없어요"}
          </span>
        </div>
        <div className="settings-ai-key-row">
          <input
            type="password"
            className="settings-ai-key"
            value={keyInput}
            placeholder="sk-ant-…"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button
            type="button"
            className="settings-btn-inline"
            disabled={busy || !keyInput.trim()}
            onClick={() =>
              run(async () => {
                await aiSetKey(keyInput);
                setKeyInput("");
                setHasKey(true);
                return "키를 저장했어요. 아래 '연결 확인'으로 잘 되는지 확인해 보세요.";
              })
            }
          >
            저장
          </button>
          <button
            type="button"
            className="settings-btn-inline"
            disabled={busy || !hasKey}
            onClick={() => run(async () => (await aiTest(settings.ai.model), "연결되었어요."))}
          >
            연결 확인
          </button>
          <button
            type="button"
            className="settings-btn-inline"
            disabled={busy || !hasKey}
            onClick={() =>
              run(async () => {
                await aiDeleteKey();
                setHasKey(false);
                return "키를 지웠어요.";
              })
            }
          >
            키 지우기
          </button>
        </div>
        {message && (
          <p className={message.ok ? "settings-ai-message" : "settings-shortcut-error"} role="status">
            {message.text}
          </p>
        )}
      </div>

      <div className="settings-item">
        <div className="settings-item-label">
          <strong>사용할 모델</strong>
          <span>{AI_MODELS[settings.ai.model].hint}</span>
        </div>
        <select
          className="settings-select"
          value={settings.ai.model}
          onChange={(e) => patch({ ai: { ...settings.ai, model: e.target.value as AiModelId } })}
        >
          {AI_MODEL_IDS.map((id) => (
            <option key={id} value={id}>
              {AI_MODELS[id].label}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-item">
        <div className="settings-item-label">
          <strong>이번 달 사용량 (참고용)</strong>
          <span>
            보낸 글 {usage.input.toLocaleString("ko-KR")} 토큰 · 받은 글 {usage.output.toLocaleString("ko-KR")} 토큰 · 호출 {usage.calls}회
            {usage.cached > 0 && ` · 다시 쓴 캐시 ${usage.cached.toLocaleString("ko-KR")} 토큰`}. 실제 요금은 Anthropic 콘솔에서 확인하세요.
          </span>
        </div>
      </div>

      <div className="settings-item">
        <div className="settings-item-label">
          <strong>원고 전송 동의</strong>
          <span>
            AI에게 물을 때 고른 글(또는 선택한 범위의 원고)이 Anthropic 서버로 전송됩니다. 자동으로 보내지는 일은 없고, 묻기 창에서 보내기를
            눌렀을 때만 전송됩니다.
          </span>
        </div>
        <label className="settings-toggle-row">
          <input
            type="checkbox"
            checked={settings.ai.consented}
            onChange={(e) => patch({ ai: { ...settings.ai, consented: e.target.checked } })}
          />
          <span>원고 일부가 Anthropic으로 전송되는 것에 동의합니다</span>
        </label>
      </div>
    </div>
  );
}
