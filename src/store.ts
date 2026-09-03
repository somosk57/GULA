import { useCallback, useEffect, useRef, useState } from "react";
import { loadState, saveState } from "./backend";
import { AppState, Project, defaultState, migrate } from "./types";

type Updater = (draft: AppState) => void;

/** Estado global con autosave (debounce 300 ms). */
export function useAppState() {
  const [state, setState] = useState<AppState | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef<AppState | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    loadState().then((s) => {
      const st = s ? migrate(s) : defaultState();
      latest.current = st;
      setState(st);
      if (!s) saveState(st).catch(console.error);
    });
  }, []);

  const update = useCallback((fn: Updater) => {
    setState((prev) => {
      if (!prev) return prev;
      // Clon profundo barato: el estado es JSON puro y chico.
      const draft: AppState = JSON.parse(JSON.stringify(prev));
      fn(draft);
      latest.current = draft;
      dirty.current = true;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (latest.current) saveState(latest.current).catch(console.error);
        dirty.current = false;
      }, 300);
      return draft;
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

  return { state, update };
}

export function activeProject(s: AppState): Project {
  return s.projects.find((p) => p.id === s.activeProjectId) ?? s.projects[0];
}
