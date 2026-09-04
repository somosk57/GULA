// "Pegar como…": lo que tengas copiado (una respuesta de la IA, un prompt que
// funcionó, un comando) entra a GULA como nota, bloque, prompt, comando o línea del día.
import { AppState, DEFAULT_GROUP, Project, Tab, lastBox, newNote, syncNote, uid } from "./types";
import { SESSIONS_GROUP, appendToDay } from "./diary";
import { readClipboard } from "./backend";
import { ask, notify, pick } from "./dialog";
import { applyCapture, parseCapture } from "./capture";

type Update = (fn: (d: AppState) => void) => void;

function firstLine(t: string, max = 60) {
  const l = t.trim().split("\n").find((x) => x.trim()) ?? "";
  return l.replace(/^#+\s*/, "").slice(0, max) || "Pegado";
}

export async function pasteAs(project: Project, activeNoteId: string | undefined, update: Update) {
  const text = await readClipboard();
  if (!text?.trim()) return notify("El portapapeles está vacío");
  const preview = text.trim().slice(0, 90).replace(/\s+/g, " ") + (text.length > 90 ? "…" : "");
  const looksLikeCommand = !text.includes("\n") && text.length < 120 && /^(npm|npx|git|cargo|python|pip|node|yarn|pnpm|docker|vercel|supabase|gh|cd |code )/i.test(text.trim());

  const parsed = parseCapture(text);
  const choice = await pick(`Pegar como…  (${preview})`, [
    ...(parsed ? [{ id: "auto", label: "Repartir automáticamente", hint: "detecté Hecho / Pendiente / Decisiones…" }] : []),
    { id: "note", label: "Nota nueva", hint: "en este proyecto" },
    { id: "append", label: "Al final de la nota abierta", hint: activeNoteId ? "" : "no hay nota abierta" },
    { id: "block", label: "Bloque de contexto", hint: "entra en Copiar para la IA" },
    { id: "prompt", label: "Prompt", hint: "para reutilizar" },
    { id: "snippet", label: looksLikeCommand ? "Comando (parece uno)" : "Comando", hint: "▶ Correr" },
    { id: "log", label: "Línea en la entrada del día", hint: "sección Sesiones" },
  ]);
  if (!choice) return;

  if (choice === "auto" && parsed) {
    let summary: string[] = [];
    update((d) => {
      summary = applyCapture(d, project.id, parsed);
      const day = d.projects.find((p) => p.id === project.id)!.notes.find((n) => n.group === SESSIONS_GROUP && new Date(n.createdAt).toDateString() === new Date().toDateString());
      if (day) d.activeNoteId[project.id] = day.id;
    });
    setTimeout(() => notify("Repartido", summary.join(" · ") || "No había nada que repartir."), 50);
    return;
  }

  let tab: Tab | null = null;
  const title = choice === "note" || choice === "block" || choice === "prompt" || choice === "snippet"
    ? await ask("Título", firstLine(text))
    : null;
  if (title === null && choice !== "append" && choice !== "log") return;

  update((d) => {
    const p = d.projects.find((p) => p.id === project.id)!;
    const now = Date.now();
    switch (choice) {
      case "note": {
        const n = newNote(title!.trim() || firstLine(text), text.trim(), DEFAULT_GROUP, "boxes");
        p.notes.push(n);
        d.activeNoteId[p.id] = n.id;
        break;
      }
      case "append": {
        const n = p.notes.find((n) => n.id === activeNoteId) ?? p.notes[0];
        const last = lastBox(n);
        last.body = (last.body.trimEnd() ? last.body.trimEnd() + "\n\n" : "") + text.trim();
        syncNote(n);
        break;
      }
      case "block":
        p.blocks.push({ id: uid(), title: title!.trim(), body: text.trim(), enabled: true });
        tab = "context";
        break;
      case "prompt":
        p.prompts.unshift({ id: uid(), title: title!.trim(), body: text.trim(), updatedAt: now, lastUsedAt: null });
        tab = "prompts";
        break;
      case "snippet":
        p.snippets.push({ id: uid(), title: title!.trim(), body: text.trim(), kind: looksLikeCommand ? "command" : "text" });
        tab = "snippets";
        break;
      case "log":
        d.activeNoteId[p.id] = appendToDay(p, [text.trim().replace(/\s+/g, " ").slice(0, 300)]).id;
        break;
    }
    if (tab) d.bottomTab = tab;
  });
}
