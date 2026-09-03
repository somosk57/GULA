// "Pegar como…": lo que tengas copiado (una respuesta de la IA, un prompt que
// funcionó, un comando) entra a GULA como nota, bloque, prompt, comando o bitácora.
import { AppState, Project, Tab, newNote, syncNote, uid } from "./types";
import { readClipboard } from "./backend";
import { ask, notify, pick } from "./dialog";

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

  const choice = await pick(`Pegar como…  (${preview})`, [
    { id: "note", label: "Nota nueva", hint: "en este proyecto" },
    { id: "append", label: "Al final de la nota abierta", hint: activeNoteId ? "" : "no hay nota abierta" },
    { id: "block", label: "Bloque de contexto", hint: "entra en Copiar para la IA" },
    { id: "prompt", label: "Prompt", hint: "para reutilizar" },
    { id: "snippet", label: looksLikeCommand ? "Comando (parece uno)" : "Comando", hint: "▶ Correr" },
    { id: "log", label: "Entrada de bitácora", hint: "con fecha de hoy" },
  ]);
  if (!choice) return;

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
        const n = newNote(title!.trim() || firstLine(text), text.trim());
        p.notes.push(n);
        d.activeNoteId[p.id] = n.id;
        break;
      }
      case "append": {
        const n = p.notes.find((n) => n.id === activeNoteId) ?? p.notes[0];
        const last = n.panes[n.panes.length - 1];
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
        p.log.unshift({ id: uid(), at: now, text: text.trim().replace(/\s+/g, " ").slice(0, 300) });
        tab = "log";
        break;
    }
    if (tab) d.bottomTab = tab;
  });
}
