// Doble Ctrl+C: copiás dos veces seguidas y eso queda guardado en Copypastes.
//
// Por qué así y no vigilando todo lo que copiás: nadie puede escuchar el Ctrl+C
// de otra aplicación, sólo mirar el portapapeles. Vigilarlo entero significaría
// guardar también contraseñas, números de tarjeta y las cien cosas que copiás
// por día sin querer conservarlas. El segundo Ctrl+C es la decisión: la mano no
// se mueve de donde ya estaba, pero lo guardado es lo que elegiste guardar.
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

/// Ventana para el segundo Ctrl+C. Abajo del mínimo son los varios formatos que
/// una misma copia escribe de una (y no son dos copias).
const MIN_GAP: Duration = Duration::from_millis(150);
const MAX_GAP: Duration = Duration::from_millis(900);
const TICK: Duration = Duration::from_millis(120);

fn enabled() -> &'static AtomicBool {
    static E: OnceLock<AtomicBool> = OnceLock::new();
    E.get_or_init(|| AtomicBool::new(true))
}

/// Contador del portapapeles de Windows: sube con cada copia, aunque copies lo
/// mismo dos veces. Es justo lo que hace falta y no cuesta ninguna dependencia.
#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn GetClipboardSequenceNumber() -> u32;
}

#[cfg(windows)]
fn seq() -> u32 {
    unsafe { GetClipboardSequenceNumber() }
}

/// En Mac el equivalente exacto es `NSPasteboard.changeCount`, que también sube
/// con cada copia aunque copies dos veces lo mismo. Leer el contador no dispara
/// el aviso de privacidad de macOS; leer el contenido (al capturar) sí, una vez.
#[cfg(target_os = "macos")]
fn seq() -> u32 {
    objc2_app_kit::NSPasteboard::generalPasteboard().changeCount() as u32
}

/// En el resto sólo se puede mirar si cambió el contenido, así que copiar dos
/// veces lo mismo no se distingue. No se compila para ningún sistema por ahora.
#[cfg(not(any(windows, target_os = "macos")))]
fn seq() -> u32 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    if let Ok(mut cb) = arboard::Clipboard::new() {
        if let Ok(t) = cb.get_text() {
            t.hash(&mut h);
        }
    }
    h.finish() as u32
}

pub fn set_enabled(on: bool) {
    enabled().store(on, Ordering::Relaxed);
}

/// Arranca el vigía. Se llama una sola vez, al iniciar la app.
pub fn watch(app: AppHandle, dir: PathBuf) {
    static STARTED: OnceLock<()> = OnceLock::new();
    if STARTED.set(()).is_err() {
        return;
    }
    thread::spawn(move || {
        let mut last = seq();
        let mut first: Option<Instant> = None;
        loop {
            thread::sleep(TICK);
            let s = seq();
            if s == last {
                continue;
            }
            last = s;
            if !enabled().load(Ordering::Relaxed) {
                first = None;
                continue;
            }
            let now = Instant::now();
            let is_double = first.is_some_and(|t| {
                let d = now.duration_since(t);
                d >= MIN_GAP && d <= MAX_GAP
            });
            if is_double {
                first = None;
                grab(&app, &dir);
            } else {
                first = Some(now);
            }
        }
    });
}

/// Lee lo que hay copiado y se lo pasa al frente. La imagen se guarda como PNG:
/// el portapapeles se vacía, un archivo no.
fn grab(app: &AppHandle, dir: &PathBuf) {
    let Ok(mut cb) = arboard::Clipboard::new() else { return };

    if let Ok(img) = cb.get_image() {
        match save_png(dir, &img) {
            Ok(path) => {
                let _ = app.emit("gula:copied", serde_json::json!({ "kind": "image", "path": path }));
            }
            Err(e) => {
                let _ = app.emit("gula:copied", serde_json::json!({ "kind": "error", "error": e }));
            }
        }
        return;
    }

    if let Ok(text) = cb.get_text() {
        if !text.trim().is_empty() {
            let _ = app.emit("gula:copied", serde_json::json!({ "kind": "text", "text": text }));
        }
    }
}

fn save_png(dir: &PathBuf, img: &arboard::ImageData) -> Result<String, String> {
    let (w, h) = (img.width as u32, img.height as u32);
    if w == 0 || h == 0 {
        return Err("La imagen copiada está vacía".into());
    }
    let buf = image::RgbaImage::from_raw(w, h, img.bytes.to_vec()).ok_or("No pude leer la imagen copiada")?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("copia-{stamp}.png"));
    // A un temporal y después el nombre final: nunca queda un PNG a medio escribir.
    let tmp = path.with_extension("png.part");
    // Con formato explícito: la extensión .part no le dice nada a `save()`.
    buf.save_with_format(&tmp, image::ImageFormat::Png).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}
