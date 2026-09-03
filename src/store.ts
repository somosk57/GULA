import { useCallback, useEffect, useRef, useState } from "react";
import { loadState, saveState } from "./backend";
import { AppState, Project, defaultState, migrate } from "./types";

type Updater = (draft: AppState) => void;

const MAX_HISTORY = 80;
/** Cambios seguidos dentro de esta ventana se agrupan en un solo paso de deshacer (tipeo). */
const COALESCE_MS = 700;

/** Estado global con autosave (debounce 300 ms) y deshacer/rehacer. */
export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef<AppState | null>(null);
  const dirty = useRef(false);
  const past = useRef<AppState[]>([]);
  const future = useRef<AppState[]>([]);
  const lastPush = useRef(0);
  const [histVersion, setHistVersion] = useState(0);

  useEffect(() => {
    loadState().then((s) => {
      const st = s ? migrate(s) : defaultState();
      latest.current = st;
      setState(st);
      if (!s) saveState(st).catch(console.error);
    });
  }, []);

  const schedule = (next: AppState) => {
    latest.current = next;
    dirty.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (latest.current) saveState(latest.current).catch(console.error);
      dirty.current = false;
    }, 300);
  };

  const update = useCallback((fn: Updater) => {
    setState((prev) => {
      if (!prev) return prev;
      const draft: AppState = JSON.parse(JSON.stringify(prev));
      fn(draft);
      const now = Date.now();
      if (now - lastPush.current > COALESCE_MS) {
        past.current.push(prev);
        if (past.current.length > MAX_HISTORY) past.current.shift();
        future.current = [];
        setHistVersion((v) => v + 1);
      }
      lastPush.current = now;
      schedule(draft);
      return draft;
    });
  }, []);

  /** Reemplaza el estado entero (restaurar copia). Queda en el historial. */
  const replace = useCallback((next: AppState) => {
    setState((prev) => {
      if (prev) past.current.push(prev);
      future.current = [];
      lastPush.current = 0;
      setHistVersion((v) => v + 1);
      schedule(next);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      const p = past.current.pop();
      if (!p || !prev) return prev;
      future.current.push(prev);
      lastPush.current = 0;
      setHistVersion((v) => v + 1);
      schedule(p);
      return p;
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      const n = future.current.pop();
      if (!n || !prev) return prev;
      past.current.push(prev);
      lastPush.current = 0;
      setHistVersion((v) => v + 1);
      schedule(n);
      return n;
    });
  }, []);

  // Guardar al cerrar por las dudas.
  useEffect(() => {
    const flush = () => {
      if (dirty.current && latest.current) saveState(latest.current).catch(() => {});
    };
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, []);

  void histVersion;
  return { state, update, replace, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

export function activeProject(s: AppState): Project {
  return s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0];
}
