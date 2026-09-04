// Ciclo de sesión: "Empezar sesión" copia el paquete para la IA y anota la hora;
// "Cerrar sesión" pide qué se logró y lo guarda en la bitácora con el link del chat.
import { AppState, Project, uid } from "./types";
import { copyText } from "./backend";
import { buildAiPackage } from "./ai";
import { ask, notify } from "./dialog";

type Update = (fn: (d: AppState) => void) => void;

export async function startSession(project: Project, update: Update) {
  await copyText(buildAiPackage(project));
  update((d) => {
    const p = d.projects.find((p) => p.id === project.id)!;
    p.sessionStartedAt = Date.now();
    p.lastSessionAt = Date.now();
  });
  notify("Sesión empezada", "El paquete para la IA ya está en el portapapeles: abrí un chat nuevo y pegalo. Cuando termines, tocá \"Cerrar sesión\".");
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
      p.log.unshift({ id: uid(), at: Date.now(), text: text.trim(), minutes, link: link?.trim() || undefined });
    }
    p.sessionStartedAt = null;
  });
}

/** Abre un chat nuevo en el navegador con el paquete ya escrito (Claude y ChatGPT aceptan ?q=). */
export async function openInAi(project: Project, update: Update, target: "claude" | "chatgpt") {
  const { openUrl } = await import("./backend");
  const pkg = buildAiPackage(project);
  await copyText(pkg);
  update((d) => (d.projects.find((p) => p.id === project.id)!.lastSessionAt = Date.now()));
  // Los navegadores aguantan URLs largas, pero por las dudas: si el paquete es enorme, va solo un aviso y el texto queda en el portapapeles.
  const MAX = 7000;
  const q = pkg.length <= MAX ? pkg : "Te voy a pegar el contexto de mi proyecto (lo tengo en el portapapeles). Esperá a que lo pegue antes de responder.";
  const url = target === "claude"
    ? `https://claude.ai/new?q=${encodeURIComponent(q)}`
    : `https://chatgpt.com/?q=${encodeURIComponent(q)}`;
  await openUrl(url);
  if (pkg.length > MAX) notify("El paquete es largo", "Lo copié al portapapeles: pegalo en el chat que se abrió (Ctrl+V).");
}

export function fmtMinutes(m: number) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
