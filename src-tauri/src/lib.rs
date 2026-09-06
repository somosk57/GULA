mod voice;

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

/// Carpeta base de la app (%APPDATA%\com.creator100k.gula). Ahí vive `location.txt`
/// si el usuario movió los datos a otra carpeta (por ejemplo dentro de OneDrive).
fn base_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Carpeta donde están data.json, backups/ e images/.
fn data_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    let base = base_dir(app)?;
    let pointer = base.join("location.txt");
    if let Ok(custom) = fs::read_to_string(&pointer) {
        let custom = custom.trim();
        if !custom.is_empty() {
            let p = PathBuf::from(custom);
            if p.is_dir() {
                return Ok(p);
            }
        }
    }
    Ok(base)
}

/// Ruta del archivo de datos.
fn data_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir_path(app)?.join("data.json"))
}

/// Mueve data.json, backups/ e images/ a otra carpeta y deja el puntero. Devuelve la carpeta nueva.
#[tauri::command]
fn set_data_location(app: AppHandle, dir: String) -> Result<String, String> {
    let from = data_dir_path(&app)?;
    let to = PathBuf::from(&dir);
    fs::create_dir_all(&to).map_err(|e| e.to_string())?;
    if fs::canonicalize(&from).ok() == fs::canonicalize(&to).ok() {
        return Ok(to.to_string_lossy().to_string());
    }
    // Si en la carpeta nueva ya hay un data.json (otra PC), no lo pisamos: el usuario elige.
    if to.join("data.json").exists() && from.join("data.json").exists() {
        let stamp = today_stamp();
        let _ = fs::copy(from.join("data.json"), to.join(format!("data-desde-otra-pc-{stamp}.json")));
    } else if from.join("data.json").exists() {
        fs::copy(from.join("data.json"), to.join("data.json")).map_err(|e| e.to_string())?;
    }
    for sub in ["backups", "images"] {
        let src = from.join(sub);
        if src.is_dir() {
            let dst = to.join(sub);
            let _ = fs::create_dir_all(&dst);
            if let Ok(rd) = fs::read_dir(&src) {
                for e in rd.flatten() {
                    let d = dst.join(e.file_name());
                    if !d.exists() { let _ = fs::copy(e.path(), d); }
                }
            }
        }
    }
    let base = base_dir(&app)?;
    let pointer = base.join("location.txt");
    if fs::canonicalize(&to).ok() == fs::canonicalize(&base).ok() {
        let _ = fs::remove_file(&pointer);
    } else {
        fs::write(&pointer, to.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(to.to_string_lossy().to_string())
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
    Ok(data_dir_path(&app)?.to_string_lossy().to_string())
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
        // El nombre puede traer subcarpetas ("Nota/Colección/01 - Idea.txt"): se crean.
        // Cada tramo se limpia de caracteres prohibidos, y "." / ".." quedan afuera
        // para que nada pueda escribir fuera de `dir`.
        let mut path = base.clone();
        for seg in f.name.replace('\\', "/").split('/') {
            if seg.is_empty() || seg == "." || seg == ".." {
                continue;
            }
            let safe: String = seg
                .chars()
                .map(|c| if "<>:\"/\\|?*".contains(c) { '_' } else { c })
                .collect();
            let safe = safe.trim().trim_end_matches('.').to_string();
            if safe.is_empty() {
                continue;
            }
            path.push(safe);
        }
        if path == base {
            continue;
        }
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&path, &f.content).map_err(|e| e.to_string())?;
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

/// Cambia el atajo global (ej. "Ctrl+Shift+Space", "Alt+G"). Devuelve error si no se puede registrar.
#[tauri::command]
fn set_shortcut(app: AppHandle, accel: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;
    // Vacío = quedarse sin atajo global, a propósito.
    if accel.trim().is_empty() {
        return Ok(());
    }
    let sc: Shortcut = accel.parse().map_err(|e| format!("Atajo inválido: {e}"))?;
    gs.register(sc).map_err(|e| format!("No se pudo registrar {accel}: {e}"))
}

/// Copia un archivo a una carpeta (assets del proyecto). Devuelve la ruta nueva; si ya existe, no pisa.
#[tauri::command]
fn copy_to_dir(src: String, dir: String) -> Result<String, String> {
    let from = PathBuf::from(&src);
    let name = from.file_name().ok_or("archivo inválido")?.to_string_lossy().to_string();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut to = PathBuf::from(&dir).join(&name);
    if to.exists() {
        // Si es el mismo archivo, nada que copiar.
        if let (Ok(a), Ok(b)) = (fs::canonicalize(&from), fs::canonicalize(&to)) {
            if a == b { return Ok(to.to_string_lossy().to_string()); }
        }
        let stem = from.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let ext = from.extension().map(|s| format!(".{}", s.to_string_lossy())).unwrap_or_default();
        let mut i = 2;
        loop {
            to = PathBuf::from(&dir).join(format!("{stem}-{i}{ext}"));
            if !to.exists() { break; }
            i += 1;
        }
    }
    fs::copy(&from, &to).map_err(|e| e.to_string())?;
    Ok(to.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
struct DirEntryInfo {
    path: String,
    name: String,
    /// "image" | "video" | "audio" | "doc" | "other"
    kind: String,
    modified: u64,
    size: u64,
}

fn thumb_key(path: &str) -> Result<(u64, u64), String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut h: u64 = 0xcbf29ce484222325;
    for b in path.as_bytes().iter().chain(mtime.to_string().as_bytes()) {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    Ok((h, meta.len()))
}

/// Mueve un archivo a una subcarpeta hermana (ej. "_descartados") sin pisar nada. Devuelve la ruta nueva.
#[tauri::command]
fn move_to_subdir(path: String, sub: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let parent = src.parent().ok_or("sin carpeta")?;
    let safe: String = sub.chars().filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-').collect();
    let dir = parent.join(if safe.is_empty() { "_descartados".to_string() } else { safe });
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let name = src.file_name().ok_or("sin nombre")?.to_string_lossy().to_string();
    let mut dest = dir.join(&name);
    let mut n = 2;
    while dest.exists() {
        let stem = src.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
        let ext = src.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
        dest = dir.join(format!("{stem}-{n}{ext}"));
        n += 1;
    }
    if fs::rename(&src, &dest).is_err() {
        fs::copy(&src, &dest).map_err(|e| e.to_string())?;
        fs::remove_file(&src).map_err(|e| e.to_string())?;
    }
    Ok(dest.to_string_lossy().to_string())
}

/// Miniatura ya generada para un archivo (videos: la genera el frontend), o null.
#[tauri::command]
fn get_thumb(app: AppHandle, path: String) -> Result<Option<String>, String> {
    let (h, _) = thumb_key(&path)?;
    let out = base_dir(&app)?.join("thumbs").join(format!("{h:016x}.jpg"));
    Ok(out.exists().then(|| out.to_string_lossy().to_string()))
}

/// Guarda una miniatura (jpg base64) generada por el frontend para ese archivo.
#[tauri::command]
fn put_thumb(app: AppHandle, path: String, base64: String) -> Result<String, String> {
    let (h, _) = thumb_key(&path)?;
    let dir = base_dir(&app)?.join("thumbs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(format!("{h:016x}.jpg"));
    fs::write(&out, b64_decode(&base64).ok_or("base64 inválido")?).map_err(|e| e.to_string())?;
    Ok(out.to_string_lossy().to_string())
}

/// Miniatura de una imagen (máx. 320px), cacheada en <datos>/thumbs/. Devuelve la ruta de la miniatura.
/// Si la imagen ya es chica, devuelve la original.
#[tauri::command]
async fn thumbnail(app: AppHandle, path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let meta = fs::metadata(&src).map_err(|e| e.to_string())?;
    if meta.len() < 120_000 {
        return Ok(path);
    }
    let mtime = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let mut h: u64 = 0xcbf29ce484222325;
    for b in path.as_bytes().iter().chain(mtime.to_string().as_bytes()) {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    let dir = base_dir(&app)?.join("thumbs");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = dir.join(format!("{h:016x}.jpg"));
    if out.exists() {
        return Ok(out.to_string_lossy().to_string());
    }
    let out2 = out.clone();
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let img = image::open(&src).map_err(|e| e.to_string())?;
        let t = img.thumbnail(320, 320).to_rgb8();
        let f = fs::File::create(&out2).map_err(|e| e.to_string())?;
        let mut w = std::io::BufWriter::new(f);
        image::codecs::jpeg::JpegEncoder::new_with_quality(&mut w, 82)
            .encode_image(&t)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(out.to_string_lossy().to_string())
}

/// Lista los archivos de una carpeta (sin recursión profunda: hasta 2 niveles) para una colección.
#[tauri::command]
fn list_dir_media(dir: String) -> Result<Vec<DirEntryInfo>, String> {
    fn kind_of(name: &str) -> &'static str {
        let lower = name.to_lowercase();
        let ext = lower.rsplit('.').next().unwrap_or("");
        match ext {
            "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "svg" | "avif" => "image",
            "mp4" | "webm" | "mov" | "m4v" | "mkv" => "video",
            "mp3" | "wav" | "ogg" | "m4a" | "flac" | "aac" => "audio",
            "pdf" | "docx" | "doc" | "txt" | "md" | "pptx" | "xlsx" | "csv" | "json" | "psd" | "ai" | "fig" | "blend" | "aep" | "prproj" => "doc",
            _ => "other",
        }
    }
    fn walk(dir: &Path, depth: u8, out: &mut Vec<DirEntryInfo>) {
        let Ok(rd) = fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if name.starts_with('.') || name.starts_with('_') { continue; }
            if p.is_dir() {
                if depth < 2 { walk(&p, depth + 1, out); }
                continue;
            }
            let meta = e.metadata().ok();
            let modified = meta.as_ref().and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_millis() as u64).unwrap_or(0);
            let size = meta.map(|m| m.len()).unwrap_or(0);
            out.push(DirEntryInfo { path: p.to_string_lossy().to_string(), name, kind: kind_of(&p.to_string_lossy()).into(), modified, size });
            if out.len() >= 2000 { return; }
        }
    }
    let base = PathBuf::from(&dir);
    if !base.is_dir() { return Err("La carpeta no existe".into()); }
    let mut out = Vec::new();
    walk(&base, 0, &mut out);
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(out)
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Prende el canal de voz en esta PC. Devuelve "IP:puerto" para pasarle a los demás.
#[tauri::command]
fn voice_start(port: Option<u16>) -> Result<String, String> {
    voice::start(port.unwrap_or(voice::DEFAULT_PORT))
}

#[tauri::command]
fn voice_stop() {
    voice::stop();
}

/// La dirección que verían los demás si prendés el canal acá.
#[tauri::command]
fn voice_addr(port: Option<u16>) -> String {
    format!("{}:{}", voice::local_ip(), port.unwrap_or(voice::DEFAULT_PORT))
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
                .with_handler(|app, _shortcut, event| {
                    // Solo hay un atajo registrado a la vez: el de mostrar/ocultar.
                    if event.state == ShortcutState::Pressed {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            setup_tray(app.handle())?;
            // El frontend registra el atajo guardado apenas carga (set_shortcut).
            let _ = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
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
            set_shortcut,
            set_data_location,
            copy_to_dir,
            list_dir_media,
            thumbnail,
            get_thumb,
            move_to_subdir,
            put_thumb,
            read_backup,
            snapshot_now,
            load_state,
            save_state,
            data_dir,
            open_terminal,
            reveal_in_explorer,
            open_in_vscode,
            open_path,
            path_exists,
            voice_start,
            voice_stop,
            voice_addr
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
