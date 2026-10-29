use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use std::sync::Mutex;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

/// Finder에서 더블클릭해 연 프로젝트 경로. 화면이 준비되기 전에 들어오면 여기 모아 둔다.
#[derive(Default)]
struct PendingOpens(Mutex<Vec<String>>);

/// 화면이 시작할 때 아직 열지 않은 프로젝트 경로를 가져간다.
#[tauri::command]
fn take_pending_opens(state: tauri::State<PendingOpens>) -> Vec<String> {
    std::mem::take(&mut *state.0.lock().unwrap())
}

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
                    let parts: Vec<String> = rel
                        .components()
                        .map(|c| c.as_os_str().to_string_lossy().to_string())
                        .collect();
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

/// 파일이나 폴더의 이름을 바꾸거나 옮긴다. 받는 쪽에 이미 무언가 있으면 바꾸지 않는다.
#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    let target = PathBuf::from(&to);
    if target.exists() {
        return Err(format!("이미 같은 이름이 있습니다: {to}"));
    }
    if let Some(dir) = target.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("폴더를 만들 수 없습니다: {e}"))?;
    }
    fs::rename(&from, &target).map_err(|e| format!("이름을 바꿀 수 없습니다: {e}"))
}

/// 파일이나 폴더를 맥 휴지통으로 옮긴다. (Finder에서 되살릴 수 있다)
#[tauri::command]
fn trash_path(path: String) -> Result<(), String> {
    if !Path::new(&path).exists() {
        return Ok(());
    }
    trash::delete(&path).map_err(|e| format!("휴지통으로 옮길 수 없습니다: {e}"))
}

/// 비어 있는 폴더만 지운다. 안에 무언가 있으면 그대로 둔다. (.DS_Store만 있으면 빈 폴더로 본다)
#[tauri::command]
fn remove_dir_if_empty(path: String) -> Result<bool, String> {
    let dir = Path::new(&path);
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(false);
    };
    let mut names = Vec::new();
    for entry in entries.flatten() {
        names.push(entry.file_name().to_string_lossy().to_string());
    }
    if names.iter().any(|n| n != ".DS_Store") {
        return Ok(false);
    }
    let _ = fs::remove_file(dir.join(".DS_Store"));
    fs::remove_dir(dir)
        .map(|_| true)
        .map_err(|e| format!("폴더를 정리할 수 없습니다: {e}"))
}

const BACKUP_ROOT: &str = ".dropkick-backups";

/// 프로젝트의 백업 폴더(.dropkick-backups) 안에서 가장 최근 keep개만 남기고 오래된 백업을 지운다.
/// 백업 폴더 밖은 건드리지 않는다.
#[tauri::command]
fn prune_backups(project: String, keep: usize) -> Result<usize, String> {
    let root = Path::new(&project).join(BACKUP_ROOT);
    let Ok(entries) = fs::read_dir(&root) else {
        return Ok(0);
    };
    let mut snapshots: Vec<PathBuf> = entries
        .flatten()
        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
        .map(|e| e.path())
        .collect();
    // 이름이 "2026-10-25 14-03-22" 형식이라 이름순 = 시간순
    snapshots.sort();
    let remove = snapshots.len().saturating_sub(keep);
    for dir in snapshots.iter().take(remove) {
        if dir.parent() == Some(root.as_path()) {
            fs::remove_dir_all(dir)
                .map_err(|e| format!("오래된 백업을 정리할 수 없습니다: {e}"))?;
        }
    }
    Ok(remove)
}

/// 폴더를 Finder에서 연다. (백업 폴더 보기)
#[tauri::command]
fn open_in_finder(path: String) -> Result<(), String> {
    if !Path::new(&path).is_dir() {
        return Err("폴더가 아직 없습니다. 한 번 저장하면 백업이 만들어집니다.".into());
    }
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Finder를 열 수 없습니다: {e}"))
}

/// 프로젝트 파일(.dropkick)이 위치한 로컬 폴더를 Finder에서 열고 프로젝트를 표시한다.
#[tauri::command]
fn reveal_in_finder(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err("프로젝트 파일을 찾을 수 없습니다.".into());
    }
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Finder를 열 수 없습니다: {e}"))
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_auxiliary_window(app: AppHandle, window_type: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&window_type) {
        let _ = win.set_focus();
        let _ = win.unminimize();
        return Ok(());
    }

    let (title, url, width, height, min_w, min_h) = match window_type.as_str() {
        "settings" => ("설정", "index.html?aux=settings", 780.0, 620.0, 640.0, 480.0),
        "guide" => ("시나리오 작성 가이드", "index.html?aux=guide", 1120.0, 780.0, 840.0, 560.0),
        _ => return Err(format!("알 수 없는 창 종류입니다: {window_type}")),
    };

    let builder = WebviewWindowBuilder::new(&app, &window_type, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(width, height)
        .min_inner_size(min_w, min_h)
        .resizable(true);

    builder
        .build()
        .map_err(|e| format!("창을 열 수 없습니다: {e}"))?;

    Ok(())
}

fn build_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item =
        |id: &str, label: &str, accel: Option<&str>| MenuItem::with_id(app, id, label, true, accel);

    let app_menu = Submenu::with_items(
        app,
        "DropKick",
        true,
        &[
            &item("about_dropkick", "DropKick 정보", None)?,
            &item("open_settings", "설정…", Some("CmdOrCtrl+,"))?,
            &item("check_update", "업데이트 확인…", None)?,
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
            &item("open", "프로젝트 열기…", Some("CmdOrCtrl+O"))?,
            &item("import_fountain", "Fountain 가져오기…", None)?,
            &PredefinedMenuItem::separator(app)?,
            &item("save", "저장", Some("CmdOrCtrl+S"))?,
            &item("save_as", "다른 이름으로 저장…", Some("CmdOrCtrl+Shift+S"))?,
            &item("new_revision", "새 고로 보관…", Some("CmdOrCtrl+Alt+S"))?,
            &item("open_project_location", "프로젝트 위치 열기", None)?,
            &item("open_backups", "백업 폴더 보기", None)?,
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
            &item("style:subheader", "서브 헤더", Some("CmdOrCtrl+6"))?,
            &item("style:transition", "전환", Some("CmdOrCtrl+7"))?,
        ],
    )?;

    let zoom_menu = Submenu::with_items(
        app,
        "화면 비율",
        true,
        &[
            &item("zoom:80", "80%", None)?,
            &item("zoom:100", "100% (기본)", None)?,
            &item("zoom:120", "120%", None)?,
            &item("zoom:150", "150%", None)?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "보기",
        true,
        &[
            &item(
                "toggle_scenes",
                "사이드바 보기/숨기기",
                Some("CmdOrCtrl+Alt+1"),
            )?,
            &item("toggle_stats", "통계 보기/숨기기", Some("CmdOrCtrl+Alt+2"))?,
            &PredefinedMenuItem::separator(app)?,
            &zoom_menu,
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

    let help_menu = Submenu::with_items(
        app,
        "도움말",
        true,
        &[
            &item("open_guide", "시나리오 작성 가이드", Some("CmdOrCtrl+Shift+/"))?,
        ],
    )?;

    Menu::with_items(
        app,
        &[
            &app_menu,
            &file_menu,
            &edit_menu,
            &style_menu,
            &view_menu,
            &window_menu,
            &help_menu,
        ],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(PendingOpens::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .menu(build_menu)
        // 메뉴를 고르면 화면(프론트엔드)에 "menu" 이벤트로 알린다.
        .on_menu_event(|app, event| {
            let id = event.id().0.as_str();
            if id == "open_settings" {
                let _ = open_auxiliary_window(app.clone(), "settings".into());
                return;
            }
            if id == "open_guide" {
                let _ = open_auxiliary_window(app.clone(), "guide".into());
                return;
            }
            let _ = app.emit("menu", event.id().0.clone());
        })
        .invoke_handler(tauri::generate_handler![
            read_script,
            write_script,
            write_binary,
            ensure_dir,
            path_kind,
            list_files,
            rename_path,
            trash_path,
            remove_dir_if_empty,
            prune_backups,
            open_in_finder,
            reveal_in_finder,
            take_pending_opens,
            quit_app,
            open_auxiliary_window
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Finder에서 .dropkick 프로젝트를 더블클릭하거나 앱 아이콘에 끌어다 놓은 경우
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                let paths: Vec<String> = urls
                    .iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                if paths.is_empty() {
                    return;
                }
                app.state::<PendingOpens>()
                    .0
                    .lock()
                    .unwrap()
                    .extend(paths.clone());
                let _ = app.emit("open-paths", paths);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
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

        write_script(
            root.join("시나리오.fountain").to_string_lossy().to_string(),
            "원고".into(),
        )
        .unwrap();
        write_script(
            root.join("인물/민재.md").to_string_lossy().to_string(),
            "# 민재".into(),
        )
        .unwrap();
        fs::write(root.join(".DS_Store"), "x").unwrap();
        assert_eq!(
            path_kind(root.join("시나리오.fountain").to_string_lossy().to_string()),
            "file"
        );

        let files = list_files(root_str).unwrap();
        assert_eq!(
            files,
            vec!["시나리오.fountain".to_string(), "인물/민재.md".to_string()]
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn renames_and_cleans_up() {
        let root = std::env::temp_dir().join(format!("dropkick-rename-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("메모")).unwrap();
        fs::write(root.join("메모/새 메모.md"), "x").unwrap();
        fs::write(root.join("다른.md"), "y").unwrap();
        let p = |s: &str| root.join(s).to_string_lossy().to_string();

        rename_path(p("메모/새 메모.md"), p("아이디어/첫 메모.md")).unwrap();
        assert_eq!(
            fs::read_to_string(root.join("아이디어/첫 메모.md")).unwrap(),
            "x"
        );
        // 받는 쪽에 이미 파일이 있으면 바꾸지 않는다
        assert!(rename_path(p("다른.md"), p("아이디어/첫 메모.md")).is_err());

        // 빈 폴더만 지운다
        fs::write(root.join("메모/.DS_Store"), "").unwrap();
        assert!(remove_dir_if_empty(p("메모")).unwrap());
        assert!(!remove_dir_if_empty(p("아이디어")).unwrap());
        assert!(root.join("아이디어").exists());

        // 없는 파일을 휴지통으로 보내는 건 문제 없다
        trash_path(p("없는 파일.md")).unwrap();

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn prunes_only_old_backups() {
        let root = std::env::temp_dir().join(format!("dropkick-backup-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let backups = root.join(BACKUP_ROOT);
        for name in [
            "2026-10-25 10-00-00",
            "2026-10-25 11-00-00",
            "2026-10-25 12-00-00",
        ] {
            fs::create_dir_all(backups.join(name)).unwrap();
            fs::write(backups.join(name).join("a.md"), "x").unwrap();
        }
        fs::write(root.join("원고.fountain"), "keep").unwrap();

        assert_eq!(
            prune_backups(root.to_string_lossy().to_string(), 2).unwrap(),
            1
        );
        assert!(!backups.join("2026-10-25 10-00-00").exists());
        assert!(backups.join("2026-10-25 12-00-00").exists());
        assert!(root.join("원고.fountain").exists());
        // 백업 폴더가 없어도 문제없다
        assert_eq!(
            prune_backups(backups.join("없음").to_string_lossy().to_string(), 2).unwrap(),
            0
        );

        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn reports_missing_file() {
        let err = read_script("/no/such/dropkick.fountain".into()).unwrap_err();
        assert!(err.contains("파일을 열 수 없습니다"));
    }
}
