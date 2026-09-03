// Capa fina sobre los comandos de Tauri. Si corre en el navegador (sin Tauri),
// cae a localStorage para poder desarrollar la UI con `npm run dev`.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { AppState } from "./types";
import { ask, notify } from "./dialog";

const isTauri = "__TAURI_INTERNALS__" in window;
const LS_KEY = "gula";

export async function loadState(): Promise<AppState | null> {
  if (!isTauri) {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as AppState) : null;
  }
  const raw = await invoke<string | null>("load_state");
  return raw ? (JSON.parse(raw) as AppState) : null;
}

/** Escribe archivos de texto en una carpeta (exportar proyecto). */
export async function exportFiles(dir: string, files: { name: string; content: string }[]) {
  if (!isTauri) {
    console.log("[sin tauri] export", dir, files.map((f) => f.name));
    return;
  }
  await invoke("export_files", { dir, files });
}

export async function saveState(state: AppState): Promise<void> {
  const json = JSON.stringify(state, null, 2);
  if (!isTauri) {
    localStorage.setItem(LS_KEY, json);
    return;
  }
  await invoke("save_state", { json });
}

export interface BackupInfo { name: string; size: number }
export async function listBackups(): Promise<BackupInfo[]> {
  if (!isTauri) return [];
  return invoke<BackupInfo[]>("list_backups");
}
export async function readBackup(name: string): Promise<AppState> {
  return JSON.parse(await invoke<string>("read_backup", { name })) as AppState;
}
export async function snapshotNow(label: string): Promise<string> {
  if (!isTauri) return "";
  return invoke<string>("snapshot_now", { label });
}

export async function dataDir(): Promise<string> {
  if (!isTauri) return "(localStorage)";
  return invoke<string>("data_dir");
}

function guard<T extends unknown[]>(fn: (...a: T) => Promise<void>) {
  return async (...a: T) => {
    if (!isTauri) {
      console.log("[sin tauri]", fn.name, a);
      return;
    }
    try {
      await fn(...a);
    } catch (e) {
      console.error(e);
      notify("No se pudo completar la acción", String(e));
    }
  };
}

/** Corre un comando en una PowerShell nueva (queda abierta), parado en `dir`. */
export const runCommand = guard(async (command: string, dir: string | null) => {
  await invoke("run_command", { command, dir });
});

export const openPath = guard(async (path: string) => {
  await invoke("open_path", { path });
});

export const openUrl = guard(async (url: string) => {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
});

export const openTerminal = guard(async (path: string) => {
  await invoke("open_terminal", { path });
});

export const revealInExplorer = guard(async (path: string) => {
  await invoke("reveal_in_explorer", { path });
});

export const openInVSCode = guard(async (path: string) => {
  await invoke("open_in_vscode", { path });
});

export async function copyText(text: string) {
  if (!isTauri) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
  await writeText(text);
}

export async function readClipboard(): Promise<string> {
  try {
    if (!isTauri) return await navigator.clipboard.readText();
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    return await readText();
  } catch {
    return "";
  }
}

/** URL para mostrar una imagen local dentro de la app. */
export function assetUrl(path: string): string {
  if (!isTauri) return path;
  // convertFileSrc es síncrono; import dinámico solo para el fallback web.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return convertFileSrc(path);
}

export async function pickImage(): Promise<string | null> {
  if (!isTauri) return ask("Ruta de la imagen:");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: false, filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }] });
  return typeof r === "string" ? r : null;
}

export async function pickFolder(): Promise<string | null> {
  if (!isTauri) return ask("Ruta de la carpeta:");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, multiple: false });
  return typeof r === "string" ? r : null;
}

export async function pickFile(): Promise<string | null> {
  if (!isTauri) return ask("Ruta del archivo:");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: false, multiple: false });
  return typeof r === "string" ? r : null;
}

// ---- Ventana ----
export const win = {
  async minimize() {
    if (!isTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  },
  async toggleMaximize() {
    if (!isTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().toggleMaximize();
  },
  async close() {
    if (!isTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  },
  async setAlwaysOnTop(v: boolean) {
    if (!isTauri) return;
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setAlwaysOnTop(v);
  },
  /** Escucha archivos/carpetas arrastrados desde el Explorador. */
  async onDrop(cb: (paths: string[]) => void): Promise<() => void> {
    if (!isTauri) return () => {};
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    return getCurrentWebview().onDragDropEvent((ev) => {
      if (ev.payload.type === "drop") cb(ev.payload.paths);
    });
  },
};
