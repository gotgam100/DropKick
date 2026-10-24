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
            &item("new", "새 문서", Some("CmdOrCtrl+N"))?,
            &item("open", "열기…", Some("CmdOrCtrl+O"))?,
            &PredefinedMenuItem::separator(app)?,
            &item("save", "저장", Some("CmdOrCtrl+S"))?,
            &item("save_as", "다른 이름으로 저장…", Some("CmdOrCtrl+Shift+S"))?,
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
        &[&app_menu, &file_menu, &edit_menu, &style_menu, &window_menu],
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
        .invoke_handler(tauri::generate_handler![read_script, write_script, quit_app])
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
    fn reports_missing_file() {
        let err = read_script("/no/such/dropkick.fountain".into()).unwrap_err();
        assert!(err.contains("파일을 열 수 없습니다"));
    }
}
