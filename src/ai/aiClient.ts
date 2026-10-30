import { Channel, invoke } from "@tauri-apps/api/core";
import { AI_MODELS, type AiModelId } from "./models";
import { recordUsage } from "./usage";

export const aiHasKey = () => invoke<boolean>("ai_has_key");
export const aiSetKey = (key: string) => invoke<void>("ai_set_key", { key });
export const aiDeleteKey = () => invoke<void>("ai_delete_key");
export const aiTest = (model: AiModelId) => invoke<void>("ai_test", { model: AI_MODELS[model].apiId });

type AiEvent =
  | { event: "delta"; data: { text: string } }
  | { event: "done"; data: { inputTokens: number; outputTokens: number; cachedTokens: number } }
  | { event: "error"; data: { message: string } };

export type AskHandlers = {
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
};

export type AskCall = {
  model: AiModelId;
  system: { text: string; cache?: boolean }[];
  messages: { role: "user"; content: string }[];
  maxTokens?: number;
};

/** 질문을 보낸다. 돌려주는 함수를 부르면 중단한다. */
export function aiAsk(call: AskCall, handlers: AskHandlers): () => void {
  const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const channel = new Channel<AiEvent>();
  channel.onmessage = (message) => {
    if (message.event === "delta") handlers.onDelta(message.data.text);
    else if (message.event === "done") {
      recordUsage({ input: message.data.inputTokens, output: message.data.outputTokens, cached: message.data.cachedTokens });
      handlers.onDone();
    } else handlers.onError(message.data.message);
  };
  invoke("ai_ask", {
    requestId,
    model: AI_MODELS[call.model].apiId,
    maxTokens: call.maxTokens ?? 2000,
    system: call.system.map((b) => ({ text: b.text, cache: b.cache === true })),
    messages: call.messages,
    onEvent: channel,
  }).catch((e) => handlers.onError(String(e)));
  return () => {
    invoke("ai_cancel", { requestId }).catch(() => {});
  };
}
