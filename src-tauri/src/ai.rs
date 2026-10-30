//! Claude API 연결. 사용자의 API 키는 맥 키체인에만 두고, 통신은 이쪽(Rust)에서 한다.
//! 화면 코드는 키를 읽을 수 없다. (키가 있는지만 물을 수 있다)

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;

const SERVICE: &str = "com.baekmac.dropkick.anthropic";
const ACCOUNT: &str = "api-key";
const API_URL: &str = "https://api.anthropic.com/v1/messages";
const API_VERSION: &str = "2023-06-01";

/// 진행 중인 요청: 요청 번호 → 취소 표시
#[derive(Default)]
pub struct AiState(Mutex<HashMap<String, Arc<AtomicBool>>>);

/// 키체인은 맥에 기본으로 들어 있는 `security` 명령으로 다룬다.
/// (직접 키체인 라이브러리를 쓰면 개발용 앱처럼 서명이 바뀌는 앱에서 저장이 실패하거나 허용 창이 계속 뜬다)
#[cfg(target_os = "macos")]
fn read_key() -> Option<String> {
    let output = std::process::Command::new("/usr/bin/security")
        .args(["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let key = String::from_utf8(output.stdout).ok()?.trim().to_string();
    (!key.is_empty()).then_some(key)
}

#[cfg(not(target_os = "macos"))]
fn read_key() -> Option<String> {
    None
}

#[tauri::command]
pub fn ai_has_key() -> bool {
    read_key().is_some()
}

#[tauri::command]
pub fn ai_set_key(key: String) -> Result<(), String> {
    let key = key.trim();
    if !key.starts_with("sk-ant-") || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("Anthropic API 키는 sk-ant- 로 시작하는 영문·숫자 글자입니다. 복사한 키를 다시 확인해 주세요.".into());
    }
    #[cfg(target_os = "macos")]
    {
        use std::io::Write;
        use std::process::{Command, Stdio};
        // 키가 명령줄(프로세스 목록)에 보이지 않도록 표준 입력으로 넘긴다.
        let mut child = Command::new("/usr/bin/security")
            .arg("-i")
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("키체인을 열지 못했습니다: {e}"))?;
        let command = format!("add-generic-password -U -s {SERVICE} -a {ACCOUNT} -w {key}\n");
        child
            .stdin
            .take()
            .ok_or("키체인에 연결하지 못했습니다.")?
            .write_all(command.as_bytes())
            .map_err(|e| format!("키체인에 쓰지 못했습니다: {e}"))?;
        let output = child.wait_with_output().map_err(|e| format!("키체인 작업이 끝나지 않았습니다: {e}"))?;
        let detail = String::from_utf8_lossy(&output.stderr);
        if !output.status.success() || detail.contains("security:") {
            return Err(format!("키체인에 저장하지 못했습니다. {}", detail.trim()));
        }
        // 실제로 저장되었는지 다시 읽어 확인한다.
        if read_key().as_deref() != Some(key) {
            return Err("키체인에 저장했지만 다시 읽지 못했습니다. 키체인 접근 허용 창이 떴다면 '항상 허용'을 눌러 주세요.".into());
        }
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("이 기능은 맥에서만 쓸 수 있습니다.".into())
    }
}

#[tauri::command]
pub fn ai_delete_key() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // 없는 키를 지우려는 경우는 오류로 보지 않는다.
        let _ = std::process::Command::new("/usr/bin/security")
            .args(["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT])
            .output();
    }
    Ok(())
}

#[derive(Deserialize)]
pub struct SystemBlock {
    text: String,
    /// true면 이 블록까지를 캐시해, 같은 원고로 다시 물을 때 입력 비용을 줄인다.
    #[serde(default)]
    cache: bool,
}

#[derive(Deserialize, Serialize)]
pub struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Serialize, Clone)]
#[serde(tag = "event", content = "data", rename_all = "camelCase")]
pub enum AiEvent {
    /// 답의 일부분이 도착했다
    Delta { text: String },
    /// 끝났다. 쓴 토큰 수를 함께 알린다.
    Done {
        #[serde(rename = "inputTokens")]
        input_tokens: u64,
        #[serde(rename = "outputTokens")]
        output_tokens: u64,
        #[serde(rename = "cachedTokens")]
        cached_tokens: u64,
    },
    Error { message: String },
}

fn friendly_error(status: u16, body: &str) -> String {
    let detail = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|v| v["error"]["message"].as_str().map(str::to_string))
        .unwrap_or_default();
    let base = match status {
        401 => "API 키가 올바르지 않습니다. 설정 > AI에서 키를 다시 확인해 주세요.",
        403 => "이 키로는 사용할 수 없습니다. 키의 권한을 확인해 주세요.",
        404 => "선택한 모델을 찾을 수 없습니다. 설정 > AI에서 다른 모델을 골라 보세요.",
        429 => "요청이 너무 많거나 사용 한도에 도달했습니다. 잠시 뒤에 다시 해 보세요.",
        500..=599 => "Anthropic 서버에 문제가 있습니다. 잠시 뒤에 다시 해 보세요.",
        _ => "요청을 처리하지 못했습니다.",
    };
    if detail.is_empty() || matches!(status, 401 | 403 | 429) {
        base.to_string()
    } else {
        format!("{base} ({detail})")
    }
}

fn request_body(model: &str, max_tokens: u32, system: &[SystemBlock], messages: &[ChatMessage], stream: bool) -> Value {
    let system: Vec<Value> = system
        .iter()
        .map(|b| {
            let mut block = json!({ "type": "text", "text": b.text });
            if b.cache {
                block["cache_control"] = json!({ "type": "ephemeral" });
            }
            block
        })
        .collect();
    let mut body = json!({ "model": model, "max_tokens": max_tokens, "messages": messages, "stream": stream });
    if !system.is_empty() {
        body["system"] = Value::Array(system);
    }
    body
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("연결을 준비하지 못했습니다: {e}"))
}

/// 키와 모델이 잘 연결되는지 아주 짧게 한 번 물어 본다.
#[tauri::command]
pub async fn ai_test(model: String) -> Result<(), String> {
    let key = read_key().ok_or("저장된 API 키가 없습니다.")?;
    let body = request_body(
        &model,
        8,
        &[],
        &[ChatMessage { role: "user".into(), content: "ping".into() }],
        false,
    );
    let response = client()?
        .post(API_URL)
        .header("x-api-key", key)
        .header("anthropic-version", API_VERSION)
        .json(&body)
        .send()
        .await
        .map_err(|_| "인터넷에 연결되지 않았거나 서버에 닿지 못했습니다.".to_string())?;
    let status = response.status().as_u16();
    if response.status().is_success() {
        return Ok(());
    }
    Err(friendly_error(status, &response.text().await.unwrap_or_default()))
}

/// 질문을 보내고 답을 조금씩 `on_event`로 전한다. 끝나면 `Done`, 실패하면 `Error`를 한 번 보낸다.
#[tauri::command]
pub async fn ai_ask(
    state: tauri::State<'_, AiState>,
    request_id: String,
    model: String,
    max_tokens: u32,
    system: Vec<SystemBlock>,
    messages: Vec<ChatMessage>,
    on_event: Channel<AiEvent>,
) -> Result<(), String> {
    let cancel = Arc::new(AtomicBool::new(false));
    state.0.lock().unwrap().insert(request_id.clone(), cancel.clone());
    let result = stream_answer(&model, max_tokens, &system, &messages, &on_event, &cancel).await;
    state.0.lock().unwrap().remove(&request_id);
    if let Err(message) = result {
        let _ = on_event.send(AiEvent::Error { message });
    }
    Ok(())
}

#[tauri::command]
pub fn ai_cancel(state: tauri::State<'_, AiState>, request_id: String) {
    if let Some(flag) = state.0.lock().unwrap().get(&request_id) {
        flag.store(true, Ordering::SeqCst);
    }
}

async fn stream_answer(
    model: &str,
    max_tokens: u32,
    system: &[SystemBlock],
    messages: &[ChatMessage],
    on_event: &Channel<AiEvent>,
    cancel: &AtomicBool,
) -> Result<(), String> {
    let key = read_key().ok_or("저장된 API 키가 없습니다. 설정 > AI에서 키를 입력해 주세요.")?;
    let response = client()?
        .post(API_URL)
        .header("x-api-key", key)
        .header("anthropic-version", API_VERSION)
        .json(&request_body(model, max_tokens, system, messages, true))
        .send()
        .await
        .map_err(|_| "인터넷에 연결되지 않았거나 서버에 닿지 못했습니다.".to_string())?;
    let status = response.status().as_u16();
    if !response.status().is_success() {
        return Err(friendly_error(status, &response.text().await.unwrap_or_default()));
    }

    let (mut input, mut output, mut cached) = (0u64, 0u64, 0u64);
    let mut pending = String::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            return Ok(());
        }
        let chunk = chunk.map_err(|_| "받는 도중 연결이 끊어졌습니다.".to_string())?;
        pending.push_str(&String::from_utf8_lossy(&chunk));
        // 줄 단위로 처리하고, 덜 도착한 마지막 줄은 다음에 이어 붙인다.
        while let Some(end) = pending.find('\n') {
            let line: String = pending.drain(..=end).collect();
            let Some(data) = line.trim().strip_prefix("data:") else { continue };
            let Ok(event) = serde_json::from_str::<Value>(data.trim()) else { continue };
            match event["type"].as_str() {
                Some("content_block_delta") => {
                    if let Some(text) = event["delta"]["text"].as_str() {
                        let _ = on_event.send(AiEvent::Delta { text: text.to_string() });
                    }
                }
                Some("message_start") => {
                    let usage = &event["message"]["usage"];
                    input = usage["input_tokens"].as_u64().unwrap_or(0);
                    cached = usage["cache_read_input_tokens"].as_u64().unwrap_or(0);
                }
                Some("message_delta") => output = event["usage"]["output_tokens"].as_u64().unwrap_or(output),
                Some("error") => {
                    let message = event["error"]["message"].as_str().unwrap_or("알 수 없는 오류");
                    return Err(format!("AI 서버 오류: {message}"));
                }
                _ => {}
            }
        }
    }
    let _ = on_event.send(AiEvent::Done { input_tokens: input, output_tokens: output, cached_tokens: cached });
    Ok(())
}
