// Ciclo de sesión: "Empezar sesión" anota la hora;
// "Cerrar sesión" pide qué se logró y lo anota en la entrada del día con el link del chat.
import { AppState, Project } from "./types";
import { appendToDay } from "./diary";
import { copyText } from "./backend";
import { ask, notify } from "./dialog";

type Update = (fn: (d: AppState) => void) => void;

export async function startSession(project: Project, update: Update) {
  update((d) => {
    const p = d.projects.find((p) => p.id === project.id)!;
    p.sessionStartedAt = Date.now();
    p.lastSessionAt = Date.now();
  });
  notify("Sesión empezada", "Se cuenta el tiempo. Cuando termines, tocá \"Cerrar sesión\" y anotás qué lograste.");
}

export async function closeSession(project: Project, update: Update) {
  const started = project.sessionStartedAt ?? Date.now();
  const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));
  const text = await ask(`¿Qué lograste? (${fmtMinutes(minutes)})`, "", {
    placeholder: "Una línea: qué quedó hecho, qué quedó pendiente.",
    multiline: true,
  });
  if (text === null) return;
  const link = await ask("Link del chat (opcional)", "", { placeholder: "https://claude.ai/chat/… · Enter para saltar" });
  update((d) => {
    const p = d.projects.find((p) => p.id === project.id)!;
    if (text.trim()) {
      const n = appendToDay(p, [`Sesión de ${fmtMinutes(minutes)}: ${text.trim().replace(/\s+/g, " ")}${link?.trim() ? ` — ${link.trim()}` : ""}`]);
      d.activeNoteId[p.id] = n.id;
    }
    p.sessionStartedAt = null;
  });
}


/** Copia el prompt de cierre: la IA responde con los encabezados que "Pegar como… → Repartir" entiende. */
export async function copyClosingPrompt(project: Project) {
  const { closingPrompt } = await import("./report");
  await copyText(closingPrompt(project));
  notify("Prompt de cierre copiado", "Pegalo en el chat. Cuando la IA responda, copiá su respuesta y usá Pegar como… (Ctrl+Shift+V) → Repartir automáticamente.");
}

export function fmtMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
