// Captura distribuida: pegás la respuesta de cierre de la IA (con los encabezados
// fijos) y GULA la reparte: Hecho → entrada del día, Pendiente → nota de tareas,
// Decisiones → bloque de contexto, Prompts → prompts, Fichas → fichas, Ahora → "ahora estoy en".
import { AppState, CardKind, Project, newNote, syncNote, uid } from "./types";
import { appendToDay } from "./diary";

const HEADS = ["hecho", "pendiente", "decisiones", "prompts", "fichas", "ahora", "notas"] as const;
type Head = (typeof HEADS)[number];

/** Devuelve las secciones encontradas, o null si el texto no sigue la convención. */
export function parseCapture(text: string): Partial<Record<Head, string>> | null {
  const re = /^\s*#{1,3}\s*([A-Za-zÁÉÍÓÚáéíóúñÑ ]+?)\s*:?\s*$/;
  const out: Partial<Record<Head, string>> = {};
  let cur: Head | null = null;
  const buf: string[] = [];
  const flush = () => {
    if (cur) out[cur] = (out[cur] ? out[cur] + "\n" : "") + buf.join("\n").trim();
    buf.length = 0;
  };
  for (const line of text.split("\n")) {
    const m = line.match(re);
    const head = m && (HEADS.find((h) => m[1].trim().toLowerCase() === h) ?? null);
    if (head) { flush(); cur = head; continue; }
    if (cur) buf.push(line);
  }
  flush();
  const found = Object.keys(out).filter((k) => out[k as Head]?.trim());
  return found.length >= 2 || (found.length === 1 && found[0] !== "notas") ? out : null;
}

const KIND_WORDS: [RegExp, CardKind][] = [
  [/personaje/i, "character"], [/lugar/i, "place"], [/objeto/i, "item"], [/escena/i, "scene"],
];

function items(block: string) {
  return block.split("\n").map((l) => l.replace(/^\s*[-*•]\s*(\[[ xX]\]\s*)?/, "").trim()).filter(Boolean);
}

/** Aplica la captura al proyecto. Devuelve un resumen de qué se creó. */
export function applyCapture(d: AppState, projectId: string, c: Partial<Record<Head, string>>): string[] {
  const p: Project = d.projects.find((x) => x.id === projectId)!;
  const done: string[] = [];
  const now = Date.now();

  if (c.hecho?.trim()) {
    const ls = items(c.hecho);
    appendToDay(p, ls, { heading: "Hecho" });
    done.push(`${ls.length} en la entrada del día`);
  }
  if (c.pendiente?.trim()) {
    const ls = items(c.pendiente);
    let n = p.notes.find((x) => /^tareas$/i.test(x.title));
    if (!n) { n = newNote("Tareas", ""); p.notes.push(n); }
    const pane = n.panes[0];
    pane.body = (pane.body.trimEnd() ? pane.body.trimEnd() + "\n" : "") + ls.map((t) => `- [ ] ${t}`).join("\n") + "\n";
    syncNote(n);
    done.push(`${ls.length} tareas`);
  }
  if (c.decisiones?.trim()) {
    const ls = items(c.decisiones);
    let b = p.blocks.find((x) => /decisi/i.test(x.title));
    if (!b) { b = { id: uid(), title: "Decisiones tomadas", body: "", enabled: true }; p.blocks.push(b); }
    const stamp = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
    b.body = (b.body.trim() ? b.body.trim() + "\n" : "") + ls.map((t) => `- (${stamp}) ${t}`).join("\n");
    appendToDay(p, ls, { heading: "Decisiones" });
    done.push(`${ls.length} decisiones`);
  }
  if (c.prompts?.trim()) {
    // Bloques separados por línea en blanco; primera línea = título (con o sin **).
    const chunks = c.prompts.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
    for (const ch of chunks) {
      const lines = ch.split("\n");
      const title = lines[0].replace(/^\*\*|\*\*$/g, "").replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim().slice(0, 80);
      const body = (lines.length > 1 ? lines.slice(1).join("\n") : lines[0]).trim();
      p.prompts.unshift({ id: uid(), title: title || "Prompt", body, updatedAt: now, lastUsedAt: null });
    }
    done.push(`${chunks.length} prompts`);
  }
  if (c.fichas?.trim()) {
    const ls = items(c.fichas);
    let count = 0;
    for (const l of ls) {
      const m = l.match(/^([^:]+):\s*([^—–-]+?)\s*[—–-]\s*(.+)$/) ?? l.match(/^([^:]+):\s*(.+)$/);
      if (!m) continue;
      const kind = KIND_WORDS.find(([re]) => re.test(m[1]))?.[1] ?? "item";
      const name = (m[2] ?? "").trim();
      const summary = (m[3] ?? "").trim();
      if (!name) continue;
      const existing = p.cards.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (existing) { if (summary && !existing.summary) existing.summary = summary; }
      else p.cards.push({ id: uid(), kind, name, summary, body: "", inContext: kind !== "scene", status: kind === "scene" ? "idea" : undefined });
      count++;
    }
    done.push(`${count} fichas`);
  }
  if (c.ahora?.trim()) {
    p.now = items(c.ahora)[0]?.slice(0, 140) ?? c.ahora.trim().slice(0, 140);
    done.push("“ahora estoy en” actualizado");
  }
  if (c.notas?.trim()) {
    const n = newNote(items(c.notas)[0]?.slice(0, 60) || "Notas de la sesión", c.notas.trim());
    p.notes.push(n);
    d.activeNoteId[p.id] = n.id;
    done.push("1 nota");
  }
  return done;
}
