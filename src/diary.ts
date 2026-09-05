// El diario: una sola cronología por proyecto. Lo que antes iba a la Bitácora
// (avances, sesiones, decisiones repartidas) ahora es una línea en la entrada del día,
// una nota en la sección "Sesiones" titulada con la fecha.
import { Project, Note, LogEntry, newNote, syncNote } from "./types";

export const SESSIONS_GROUP = "Sesiones";

export function dayTitle(at: number) {
  const d = new Date(at);
  const mon = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getMonth()];
  return `${d.getDate()} ${mon} ${d.getFullYear()}`;
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

/** Entrada del día (la crea si no existe). */
export function dayEntry(p: Project, at = Date.now()): Note {
  let n = p.notes.find((x) => x.group === SESSIONS_GROUP && sameDay(x.createdAt, at));
  if (n) return n;
  n = newNote(dayTitle(at), "", SESSIONS_GROUP);
  n.autoTitle = false;
  n.createdAt = at;
  n.updatedAt = at;
  // Las sesiones van al final, en orden cronológico.
  const lastIdx = p.notes.map((x) => x.group).lastIndexOf(SESSIONS_GROUP);
  p.notes.splice(lastIdx < 0 ? p.notes.length : lastIdx + 1, 0, n);
  return n;
}

/** Agrega líneas a la entrada del día bajo un encabezado opcional ("Hecho", "Decisiones"…). */
export function appendToDay(p: Project, lines: string[], opts: { at?: number; heading?: string } = {}): Note {
  const at = opts.at ?? Date.now();
  const n = dayEntry(p, at);
  const pane = n.panes[0];
  let body = pane.body.trimEnd();
  const items = lines.map((l) => (l.startsWith("- ") ? l : "- " + l));
  if (opts.heading) {
    const h = `## ${opts.heading}`;
    const idx = body.indexOf(h);
    if (idx >= 0) {
      // Insertar al final de esa sección (antes del próximo "## ").
      const rest = body.slice(idx + h.length);
      const next = rest.search(/\n## /);
      const end = next < 0 ? body.length : idx + h.length + next;
      body = body.slice(0, end).trimEnd() + "\n" + items.join("\n") + body.slice(end);
    } else {
      body = (body ? body + "\n\n" : "") + h + "\n" + items.join("\n");
    }
  } else {
    body = (body ? body + "\n" : "") + items.join("\n");
  }
  pane.body = body + "\n";
  n.updatedAt = Math.max(n.updatedAt, at);
  syncNote(n);
  return n;
}

/** Migración: la Bitácora vieja pasa al diario, una entrada por día. */
export function foldLogIntoDiary(p: Project) {
  if (!p.log?.length) return;
  const entries: LogEntry[] = [...p.log].sort((a, b) => a.at - b.at);
  for (const e of entries) {
    const time = new Date(e.at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
    const extra = [e.minutes ? `${e.minutes} min` : "", e.link ? e.link : ""].filter(Boolean).join(" · ");
    appendToDay(p, [`${time} — ${e.text}${extra ? ` (${extra})` : ""}`], { at: e.at });
  }
  p.log = [];
}

/** Última línea escrita en el diario (para "ahora" cuando no hay nada). */
export function lastDiaryLine(p: Project): { text: string; at: number } | null {
  const notes = p.notes.filter((n) => n.group === SESSIONS_GROUP).sort((a, b) => b.createdAt - a.createdAt);
  for (const n of notes) {
    const lines = n.body.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
    if (lines.length) return { text: lines[lines.length - 1].replace(/^- /, ""), at: n.updatedAt };
  }
  return null;
}
