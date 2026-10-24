use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Runtime};

/// 원고 파일을 UTF-8 텍스트로 읽는다.
#[tauri::command]
fn read_script(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("파일을 열 수 없습니다: {e}"))
}

/// 원고 파일을 저장한다. 임시 파일에 먼저 쓰고 바꿔치기해서,
/// 저장 중에 문제가 생겨도 원래 파일이 깨지지 않게 한다.
#[tauri::command]
fn write_script(path: String, contents: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let dir = target.parent().unwrap_or(Path::new("."));
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "script.fountain".into());
    let temp = dir.join(format!(".{name}.dropkick-tmp"));

    let result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, &target)
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| format!("파일을 저장할 수 없습니다: {e}"))
}

/// PDF 같은 바이너리 파일을 저장한다. 내용은 요청 본문(raw), 경로는 "path" 헤더로 받는다.
#[tauri::command]
fn write_binary(request: tauri::ipc::Request) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("잘못된 요청입니다.".into());
    };
    let path = request
        .headers()
        .get("path")
        .and_then(|v| v.to_str().ok())
        .map(|v| percent_decode(v))
        .ok_or("저장할 위치가 없습니다.")?;
    let target = PathBuf::from(&path);
    let dir = target.parent().unwrap_or(Path::new("."));
    let temp = dir.join(".dropkick-export.tmp");
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp)?;
        file.write_all(data)?;
        file.sync_all()?;
        fs::rename(&temp, &target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result.map_err(|e| format!("파일을 저장할 수 없습니다: {e}"))
}

/// encodeURIComponent로 인코딩된 경로를 되돌린다. (한글 경로를 헤더로 보내기 위해)
fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(hi), Some(lo)) = (hi, lo) {
                out.push((hi * 16 + lo) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// 폴더를 만든다. (이미 있으면 그대로)
#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("폴더를 만들 수 없습니다: {e}"))
}

/// 경로가 파일인지, 폴더인지, 없는지
#[tauri::command]
fn path_kind(path: String) -> &'static str {
    match fs::metadata(&path) {
        Ok(meta) if meta.is_dir() => "dir",
        Ok(_) => "file",
        Err(_) => "none",
    }
}

const MAX_LISTED_FILES: usize = 5000;
const MAX_DEPTH: usize = 6;

/// 폴더 안 모든 파일의 상대 경로 ("인물/민재.md"). 숨김 파일과 심볼릭 링크는 건너뛴다.
#[tauri::command]
fn list_files(root: String) -> Result<Vec<String>, String> {
    fn walk(base: &Path, dir: &Path, depth: usize, out: &mut Vec<String>) -> std::io::Result<()> {
        if depth > MAX_DEPTH || out.len() >= MAX_LISTED_FILES {
            return Ok(());
        }
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with('.') {
                continue;
            }
            let file_type = entry.file_type()?;
            let path = entry.path();
            if file_type.is_dir() {
                walk(base, &path, depth + 1, out)?;
            } else if file_type.is_file() {
                if let Ok(rel) = path.strip_prefix(base) {
                    let parts: Vec<String> =
                        rel.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect();
                    out.push(parts.join("/"));
                }
            }
            if out.len() >= MAX_LISTED_FILES {
                break;
            }
        }
        Ok(())
    }
    let base = PathBuf::from(&root);
    let mut out = Vec::new();
    walk(&base, &base, 0, &mut out).map_err(|e| format!("폴더를 읽을 수 없습니다: {e}"))?;
    out.sort();
    Ok(out)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, label: &str, accel: Option<&str>| {
        MenuItem::with_id(app, id, label, true, accel)
    };

    let app_menu = Submenu::with_items(
        app,
        "DropKick",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("DropKick 정보"), None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("서비스"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("DropKick 가리기"))?,
            &PredefinedMenuItem::hide_others(app, Some("기타 가리기"))?,
            &PredefinedMenuItem::show_all(app, Some("모두 보기"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("quit", "DropKick 종료", Some("CmdOrCtrl+Q"))?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "파일",
        true,
        &[
            &item("new_project", "새 프로젝트", Some("CmdOrCtrl+N"))?,
            &item("open", "열기…", Some("CmdOrCtrl+O"))?,
            &item("open_project", "프로젝트 폴더 열기…", Some("CmdOrCtrl+Shift+O"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("save", "저장", Some("CmdOrCtrl+S"))?,
            &item("save_as", "다른 이름으로 저장…", Some("CmdOrCtrl+Shift+S"))?,
            &item("make_project", "프로젝트로 만들기…", None)?,
            &PredefinedMenuItem::separator(app)?,
            &item("export_pdf", "PDF로 내보내기…", Some("CmdOrCtrl+P"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("close", "창 닫기", Some("CmdOrCtrl+W"))?,
        ],
    )?;

    // 되돌리기/다시 실행은 에디터의 기록을 쓰도록 화면 쪽으로 전달한다.
    let edit_menu = Submenu::with_items(
        app,
        "편집",
        true,
        &[
            &item("undo", "실행 취소", Some("CmdOrCtrl+Z"))?,
            &item("redo", "실행 복귀", Some("CmdOrCtrl+Shift+Z"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("오려두기"))?,
            &PredefinedMenuItem::copy(app, Some("복사하기"))?,
            &PredefinedMenuItem::paste(app, Some("붙이기"))?,
            &PredefinedMenuItem::select_all(app, Some("전체 선택"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("find", "찾기…", Some("CmdOrCtrl+F"))?,
        ],
    )?;

    let style_menu = Submenu::with_items(
        app,
        "스타일",
        true,
        &[
            &item("style:scene", "씬헤딩", Some("CmdOrCtrl+1"))?,
            &item("style:action", "액션", Some("CmdOrCtrl+2"))?,
            &item("style:character", "인물", Some("CmdOrCtrl+3"))?,
            &item("style:parenthetical", "괄호지문", Some("CmdOrCtrl+4"))?,
            &item("style:dialogue", "대사", Some("CmdOrCtrl+5"))?,
            &item("style:transition", "전환", Some("CmdOrCtrl+6"))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "보기",
        true,
        &[
            &item("toggle_scenes", "씬 목록 보기/숨기기", Some("CmdOrCtrl+Alt+1"))?,
            &item("toggle_stats", "통계 보기/숨기기", Some("CmdOrCtrl+Alt+2"))?,
        ],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "윈도우",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("최소화"))?,
            &PredefinedMenuItem::maximize(app, Some("확대/축소"))?,
            &PredefinedMenuItem::fullscreen(app, Some("전체 화면"))?,
        ],
    )?;

    Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &style_menu, &view_menu, &window_menu],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .menu(build_menu)
        // 메뉴를 고르면 화면(프론트엔드)에 "menu" 이벤트로 알린다.
        .on_menu_event(|app, event| {
            let _ = app.emit("menu", event.id().0.clone());
        })
        .invoke_handler(tauri::generate_handler![
            read_script,
            write_script,
            write_binary,
            ensure_dir,
            path_kind,
            list_files,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_reads_korean_script() {
        let dir = std::env::temp_dir().join(format!("dropkick-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("테스트 원고.fountain");
        let path_str = path.to_string_lossy().to_string();

        let text = ".내부. 체육관 - 밤 #1#\n\n@민재\n딱 한 번만 더.\n";
        write_script(path_str.clone(), text.into()).unwrap();
        assert_eq!(read_script(path_str.clone()).unwrap(), text);

        // 덮어쓰기 후 임시 파일이 남지 않아야 한다.
        write_script(path_str.clone(), "두 번째".into()).unwrap();
        assert_eq!(read_script(path_str).unwrap(), "두 번째");
        let leftovers: Vec<_> = fs::read_dir(&dir).unwrap().collect();
        assert_eq!(leftovers.len(), 1);

        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn decodes_korean_path() {
        assert_eq!(
            percent_decode("%2FUsers%2F%EB%A7%A5%2F%EB%93%9C%EB%A1%AD%ED%82%A5.pdf"),
            "/Users/맥/드롭킥.pdf"
        );
        assert_eq!(percent_decode("a%20b%"), "a b%");
    }

    #[test]
    fn creates_and_lists_project_folder() {
        let root = std::env::temp_dir().join(format!("dropkick-project-{}", std::process::id()));
        let root_str = root.to_string_lossy().to_string();
        let _ = fs::remove_dir_all(&root);

        assert_eq!(path_kind(root_str.clone()), "none");
        ensure_dir(root.join("인물").to_string_lossy().to_string()).unwrap();
        ensure_dir(root.join("메모").to_string_lossy().to_string()).unwrap();
        assert_eq!(path_kind(root_str.clone()), "dir");

        write_script(root.join("시나리오.fountain").to_string_lossy().to_string(), "원고".into()).unwrap();
        write_script(root.join("인물/민재.md").to_string_lossy().to_string(), "# 민재".into()).unwrap();
        fs::write(root.join(".DS_Store"), "x").unwrap();
        assert_eq!(path_kind(root.join("시나리오.fountain").to_string_lossy().to_string()), "file");

        let files = list_files(root_str).unwrap();
        assert_eq!(files, vec!["시나리오.fountain".to_string(), "인물/민재.md".to_string()]);

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn reports_missing_file() {
        let err = read_script("/no/such/dropkick.fountain".into()).unwrap_err();
        assert!(err.contains("파일을 열 수 없습니다"));
    }
}
