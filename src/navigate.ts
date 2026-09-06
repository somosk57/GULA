// Ir a un recuadro desde cualquier lado (Tareas, buscador, vista por etiqueta).
// Con un mapa grande, poder saltar al lugar exacto es lo que evita perderse.
import { AppState, Note, Pane, Project, findPane } from "./types";

const GO = "gula:ir-recuadro";

/** Lleva a un recuadro: cambia de proyecto y de nota, entra a su colección y lo resalta. */
export function goToPane(
  update: (fn: (d: AppState) => void) => void,
  target: { projectId: string; noteId: string; paneId?: string },
) {
  update((d) => {
    d.activeProjectId = target.projectId;
    d.activeNoteId[target.projectId] = target.noteId;
  });
  // Después de que el editor se dibuje con la nota nueva.
  if (target.paneId) setTimeout(() => window.dispatchEvent(new CustomEvent(GO, { detail: target.paneId })), 0);
}

export function onGoToPane(cb: (paneId: string) => void) {
  const h = (e: Event) => cb((e as CustomEvent<string>).detail);
  window.addEventListener(GO, h);
  return () => window.removeEventListener(GO, h);
}

export interface Located {
  projectId: string;
  noteId: string;
  /** La colección que lo contiene, si está adentro de una. */
  collId?: string;
  paneId: string;
  /** "Nota › Colección › Recuadro" */
  path: string;
  pane: Pane;
  note: Note;
}

/** El nombre que se lee de un recuadro: su título, o su primera línea con texto. */
export function paneName(p: Pane, fallback = "Recuadro"): string {
  if (p.title.trim()) return p.title.trim();
  for (const raw of p.body.split("\n")) {
    const l = raw.replace(/^\s*(#+\s*|[-*+]\s+(\[[ xX]\]\s*)?|\d+\.\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
    if (l && !/^!\[/.test(raw.trim()) && !/^```/.test(raw.trim())) return l.slice(0, 60);
  }
  return fallback;
}

/** Recorre TODOS los cuadrados del proyecto, a cualquier profundidad, con su camino. */
export function walkPanes(p: Project, collections = false): Located[] {
  const out: Located[] = [];
  const walk = (note: Note, list: Pane[], prefix: string, parentId?: string) => {
    list.forEach((x, i) => {
      const name = paneName(x, x.panes ? `Colección ${i + 1}` : `Recuadro ${i + 1}`);
      const path = `${prefix} › ${name}`;
      if (x.panes) {
        if (collections) out.push({ projectId: p.id, noteId: note.id, collId: parentId, paneId: x.id, path, pane: x, note });
        walk(note, x.panes, path, x.id);
      } else {
        out.push({ projectId: p.id, noteId: note.id, collId: parentId, paneId: x.id, path, pane: x, note });
      }
    });
  };
  for (const note of p.notes) walk(note, note.panes, note.title);
  return out;
}

/** ¿Este archivo está adentro de este cuadrado (a cualquier profundidad)? */
export function paneHas(p: Pane, src: string): boolean {
  if (p.panes) return p.panes.some((x) => paneHas(x, src));
  return p.body.includes(src);
}

/** Encuentra un cuadrado del proyecto por su id, sepa o no en qué nota vive. */
export function locatePane(p: Project, id: string): { pane: Pane; noteId: string; name: string } | null {
  for (const n of p.notes) {
    if (n.id === id) return { pane: n as unknown as Pane, noteId: n.id, name: n.title };
    const found = findPane(n, id);
    if (found) return { pane: found, noteId: n.id, name: found.title };
  }
  return null;
}
