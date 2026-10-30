/** AI 기능에서 고를 수 있는 Claude 모델 */
export type AiModelId = "haiku" | "sonnet" | "opus";

export const AI_MODELS: Record<AiModelId, { apiId: string; label: string; hint: string }> = {
  haiku: { apiId: "claude-haiku-5-5", label: "Haiku 5.5", hint: "가장 빠르고 저렴해요. 짧은 질문에 알맞아요." },
  sonnet: { apiId: "claude-sonnet-5-5", label: "Sonnet 5.5", hint: "속도와 품질의 균형. 처음에는 이걸 추천해요." },
  opus: { apiId: "claude-opus-5-5", label: "Opus 5.5", hint: "가장 깊게 읽어요. 느리고 비용이 더 들어요." },
};

export const AI_MODEL_IDS: readonly AiModelId[] = ["haiku", "sonnet", "opus"];

export type AiSettings = {
  model: AiModelId;
  /** 원고가 Anthropic 서버로 전송된다는 안내에 동의했는지 */
  consented: boolean;
};

export const DEFAULT_AI_SETTINGS: AiSettings = { model: "sonnet", consented: false };

export function parseAiSettings(value: unknown): AiSettings {
  if (!value || typeof value !== "object") return DEFAULT_AI_SETTINGS;
  const v = value as Record<string, unknown>;
  const model = typeof v.model === "string" && v.model in AI_MODELS ? (v.model as AiModelId) : DEFAULT_AI_SETTINGS.model;
  return { model, consented: v.consented === true };
}
