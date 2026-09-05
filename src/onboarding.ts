// Primer arranque: una bienvenida corta y el primer proyecto con perfil.
import { AppState, PROFILES, newProject } from "./types";
import { ProfileId } from "./profiles";
import { ask, notify, pick } from "./dialog";

type Update = (fn: (d: AppState) => void) => void;

export async function firstRun(update: Update) {
  await notify(
    "Bienvenido a GULA",
    "GULA es el diario de tu trabajo con IA.\n\n• Al crear una nota elegís qué es: Recuadros (un proceso) o Colección (colecciones, y adentro sus recuadros). Escribís y arrastrás imágenes, videos o audios adentro.\n• Abajo va lo fijo del proyecto: accesos, prompts y fichas.\n• Ctrl+Shift+Space la muestra u oculta desde cualquier programa; la X la deja en la bandeja.\n\nEmpecemos por tu primer proyecto.",
  );
  const name = await ask("¿Cómo se llama tu primer proyecto?", "", { placeholder: "Ej: Canal de cocina, App de turnos, Novela…" });
  update((d) => (d.onboarded = true));
  if (!name?.trim()) return;
  const profile = (await pick("¿Qué tipo de proyecto es?", PROFILES.map((p) => ({ id: p.id, label: p.name, hint: p.hint })))) ?? "blank";
  update((d) => {
    const p = newProject(name.trim(), profile as ProfileId);
    p.stage = "active";
    d.projects.push(p);
    d.activeProjectId = p.id;
    d.activeNoteId[p.id] = p.notes[0].id;
  });
}
