use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Ruta del archivo de datos: %APPDATA%\com.creator100k.gula\data.json
fn data_file(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("data.json"))
}

#[tauri::command]
fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    let file = data_file(&app)?;
    if !file.exists() {
        return Ok(None);
    }
    fs::read_to_string(&file).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_state(app: AppHandle, json: String) -> Result<(), String> {
    let file = data_file(&app)?;
    backup_if_needed(&file);
    // Escritura atómica: primero a .tmp, después rename.
    let tmp = file.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| e.to_string())
}

const MAX_BACKUPS: usize = 30;

fn backups_dir(file: &Path) -> PathBuf {
    file.parent().unwrap_or(Path::new(".")).join("backups")
}

/// Fecha local AAAA-MM-DD sin dependencias: se aproxima con UTC (alcanza para rotar copias).
fn today_stamp() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let days = secs / 86_400;
    // Algoritmo civil-from-days (Howard Hinnant).
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
}

/// Antes de sobreescribir data.json, guarda una copia por día (rota las últimas 30).
fn backup_if_needed(file: &Path) {
    if !file.exists() {
        return;
    }
    let dir = backups_dir(file);
    if fs::create_dir_all(&dir).is_err() {
        return;
    }
    let target = dir.join(format!("data-{}.json", today_stamp()));
    if target.exists() {
        return;
    }
    let _ = fs::copy(file, &target);
    // Rotar.
    if let Ok(rd) = fs::read_dir(&dir) {
        let mut names: Vec<PathBuf> = rd
            .filter_map(|e| e.ok().map(|e| e.path()))
            .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
            .collect();
        names.sort();
        while names.len() > MAX_BACKUPS {
            let old = names.remove(0);
            let _ = fs::remove_file(old);
        }
    }
}

#[derive(serde::Serialize)]
struct BackupInfo {
    name: String,
    size: u64,
}

#[tauri::command]
fn list_backups(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    let dir = backups_dir(&data_file(&app)?);
    let mut out = Vec::new();
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().map(|x| x == "json").unwrap_or(false) {
                let size = e.metadata().map(|m| m.len()).unwrap_or(0);
                out.push(BackupInfo { name: p.file_name().unwrap().to_string_lossy().to_string(), size });
            }
        }
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

/// Devuelve el contenido de una copia (el frontend decide si la aplica).
#[tauri::command]
fn read_backup(app: AppHandle, name: String) -> Result<String, String> {
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err("nombre inválido".into());
    }
    let p = backups_dir(&data_file(&app)?).join(name);
    fs::read_to_string(p).map_err(|e| e.to_string())
}

/// Copia manual con nombre, antes de restaurar.
#[tauri::command]
fn snapshot_now(app: AppHandle, label: String) -> Result<String, String> {
    let file = data_file(&app)?;
    let dir = backups_dir(&file);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = label.chars().filter(|c| c.is_alphanumeric() || *c == '-').collect();
    let name = format!("data-{}-{}.json", today_stamp(), safe);
    fs::copy(&file, dir.join(&name)).map_err(|e| e.to_string())?;
    Ok(name)
}

#[tauri::command]
fn data_dir(app: AppHandle) -> Result<String, String> {
    Ok(data_file(&app)?
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default())
}

fn run_detached(mut cmd: Command) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Carpeta de trabajo para un path: si es archivo, su carpeta contenedora.
fn working_dir(path: &str) -> String {
    let p = Path::new(path);
    if p.is_file() {
        p.parent()
            .map(|d| d.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string())
    } else {
        path.to_string()
    }
}

/// Abre una terminal parada en la carpeta.
/// Windows: Windows Terminal, o PowerShell. macOS: Terminal.app. Linux: la terminal por defecto.
#[tauri::command]
fn open_terminal(path: String) -> Result<(), String> {
    let dir = working_dir(&path);
    #[cfg(target_os = "windows")]
    {
        let mut wt = Command::new("wt.exe");
        wt.args(["-d", &dir]);
        if run_detached(wt).is_ok() {
            return Ok(());
        }
        // PowerShell clásico: hereda el directorio de trabajo.
        let mut ps = Command::new("cmd");
        ps.args(["/C", "start", "", "powershell.exe", "-NoExit"]);
        ps.current_dir(&dir);
        run_detached(ps)
    }
    #[cfg(target_os = "macos")]
    {
        let mut c = Command::new("open");
        c.args(["-a", "Terminal", &dir]);
        run_detached(c)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let mut t = Command::new("x-terminal-emulator");
        t.current_dir(&dir);
        run_detached(t)
    }
}

/// Muestra el archivo/carpeta en el Explorador / Finder (seleccionado si es archivo).
#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut c = Command::new("explorer.exe");
        if Path::new(&path).is_file() {
            c.arg(format!("/select,{}", path));
        } else {
            c.arg(&path);
        }
        run_detached(c)
    }
    #[cfg(target_os = "macos")]
    {
        let mut c = Command::new("open");
        if Path::new(&path).is_file() {
            c.args(["-R", &path]);
        } else {
            c.arg(&path);
        }
        run_detached(c)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let mut c = Command::new("xdg-open");
        c.arg(working_dir(&path));
        run_detached(c)
    }
}

/// Abre la carpeta/archivo en VS Code.
#[tauri::command]
fn open_in_vscode(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut c = Command::new("cmd");
        c.args(["/C", "code", &path]);
        run_detached(c)
    }
    #[cfg(target_os = "macos")]
    {
        // `code` puede no estar en el PATH de una app lanzada desde el Dock.
        let mut c = Command::new("open");
        c.args(["-a", "Visual Studio Code", &path]);
        run_detached(c)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let mut c = Command::new("code");
        c.arg(&path);
        run_detached(c)
    }
}

/// Abre con la app por defecto (carpeta → Explorador/Finder, archivo → su programa).
#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", &path]);
        run_detached(c)
    }
    #[cfg(target_os = "macos")]
    {
        let mut c = Command::new("open");
        c.arg(&path);
        run_detached(c)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let mut c = Command::new("xdg-open");
        c.arg(&path);
        run_detached(c)
    }
}

/// Corre un comando en una terminal nueva que queda abierta, parado en `dir`.
#[tauri::command]
fn run_command(command: String, dir: Option<String>) -> Result<(), String> {
    let dir = dir.as_deref().filter(|d| !d.is_empty()).map(working_dir);
    #[cfg(target_os = "windows")]
    {
        let mut c = Command::new("cmd");
        c.args(["/C", "start", "", "powershell.exe", "-NoExit", "-Command", &command]);
        if let Some(d) = &dir {
            c.current_dir(d);
        }
        run_detached(c)
    }
    #[cfg(target_os = "macos")]
    {
        // Terminal.app vía AppleScript: cd a la carpeta y correr el comando.
        let cd = dir
            .as_deref()
            .map(|d| format!("cd {} && ", shell_quote(d)))
            .unwrap_or_default();
        let script = format!(
            "tell application \"Terminal\"\nactivate\ndo script \"{}{}\"\nend tell",
            applescript_escape(&cd),
            applescript_escape(&command)
        );
        let mut c = Command::new("osascript");
        c.args(["-e", &script]);
        run_detached(c)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let mut c = Command::new("x-terminal-emulator");
        c.args(["-e", "bash", "-c", &format!("{command}; exec bash")]);
        if let Some(d) = &dir {
            c.current_dir(d);
        }
        run_detached(c)
    }
}

#[cfg(target_os = "macos")]
fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(target_os = "macos")]
fn applescript_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

#[derive(Deserialize)]
struct ExportFile {
    name: String,
    content: String,
}

/// Escribe archivos de texto dentro de `dir` (crea la carpeta si no existe).
#[tauri::command]
fn export_files(dir: String, files: Vec<ExportFile>) -> Result<usize, String> {
    let base = PathBuf::from(&dir);
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    for f in &files {
        // Sin subcarpetas ni nombres raros.
        let safe: String = f
            .name
            .chars()
            .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
            .collect();
        fs::write(base.join(safe), &f.content).map_err(|e| e.to_string())?;
    }
    Ok(files.len())
}

fn toggle_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let visible = w.is_visible().unwrap_or(true);
        let minimized = w.is_minimized().unwrap_or(false);
        if visible && !minimized && w.is_focused().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostrar / ocultar", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().cloned().expect("icono"))
        .tooltip("GULA  (Ctrl+Shift+Space)")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, ev| match ev.id.as_ref() {
            "show" => toggle_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, ev| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                toggle_window(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

/// Guarda una imagen (base64) en la carpeta de datos y devuelve su ruta.
#[tauri::command]
fn save_image(app: AppHandle, base64: String, ext: String) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("images");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let bytes = b64_decode(&base64).ok_or("base64 inválido")?;
    let safe_ext: String = ext.chars().filter(|c| c.is_ascii_alphanumeric()).take(5).collect();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let file = dir.join(format!("img-{stamp}.{}", if safe_ext.is_empty() { "png".into() } else { safe_ext }));
    fs::write(&file, bytes).map_err(|e| e.to_string())?;
    Ok(file.to_string_lossy().to_string())
}

fn b64_decode(s: &str) -> Option<Vec<u8>> {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let mut buf = 0u32;
    let mut bits = 0;
    for c in s.bytes() {
        if c == b'=' || c == b'\n' || c == b'\r' {
            continue;
        }
        let v = T.iter().position(|&t| t == c)? as u32;
        buf = (buf << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    let hot = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                    if event.state == ShortcutState::Pressed && shortcut == &hot {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            setup_tray(app.handle())?;
            let hot = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
            if let Err(e) = app.global_shortcut().register(hot) {
                eprintln!("No se pudo registrar Ctrl+Shift+Space: {e}");
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // La X esconde a la bandeja; "Salir" está en el menú del ícono.
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            run_command,
            export_files,
            list_backups,
            save_image,
            read_backup,
            snapshot_now,
            load_state,
            save_state,
            data_dir,
            open_terminal,
            reveal_in_explorer,
            open_in_vscode,
            open_path,
            path_exists
        ])
        .build(tauri::generate_context!())
        .expect("error al iniciar GULA")
        .run(|app, event| {
            // macOS: clic en el ícono del Dock cuando la ventana está oculta → mostrarla.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
