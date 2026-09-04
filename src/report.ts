// Informe del proyecto: un texto ordenado que cualquier IA (o persona) lee de
// arriba a abajo y entiende qué es, en qué etapa está, qué se decidió, qué se
// hizo, qué está en curso, qué falta, qué piezas hay y qué prompts se usan.
import { MARKS, Project, STAGES, noteMark } from "./types";
import { collectTasks, contextText, fmtDate } from "./ai";
import { collectMedia } from "./components/GalleryPanel";
import { matchImage } from "./components/MarkdownEditor";

export interface ReportOptions {
  /** "all" = todo el historial; "week" = solo lo de los últimos 7 días. */
  range: "all" | "week";
  /** Incluir el texto completo de cada nota (si no, solo título, fecha y resumen). */
  fullNotes: boolean;
}

const WEEK = 7 * 86_400_000;

function noteSummary(body: string) {
  const lines = body.split("\n").map((l) => l.trim()).filter((l) => l && !matchImage(l) && !/^#+\s/.test(l));
  return lines.slice(0, 2).join(" · ").slice(0, 160);
}

export function buildReport(p: Project, o: ReportOptions): string {
  const since = o.range === "week" ? Date.now() - WEEK : 0;
  const S: string[] = [];
  const stage = STAGES.find((s) => s.id === p.stage)?.label ?? p.stage;

  S.push(`# Informe del proyecto: ${p.name}`);
  S.push(`Generado el ${new Date().toLocaleDateString("es-AR")} desde GULA.${o.range === "week" ? " Cubre los últimos 7 días." : ""}`);
  S.push(`\n## En qué está\n- Etapa: **${stage}**${p.now ? `\n- Ahora estoy en: ${p.now}${p.nowAt ? ` (escrito el ${fmtDate(p.nowAt)})` : ""}` : ""}`);

  // Contexto (bloques encendidos y apagados: el informe es completo)
  const ctx = contextText(p, false);
  if (ctx.trim()) S.push("\n" + ctx.replace(/^# Proyecto:.*\n?/, "## Qué es y cómo trabajamos\n"));

  // Fichas
  const kinds: [string, string][] = [["character", "Personajes"], ["place", "Lugares"], ["item", "Objetos"], ["scene", "Escenas"]];
  for (const [k, title] of kinds) {
    const cs = p.cards.filter((c) => c.kind === k);
    if (!cs.length) continue;
    S.push(`\n## ${title}`);
    for (const c of cs) {
      const st = c.kind === "scene" ? ` (${{ idea: "idea", draft: "borrador", done: "lista" }[c.status ?? "idea"]})` : "";
      S.push(`- **${c.name}**${st}${c.summary ? `: ${c.summary}` : ""}${c.tags?.length ? ` — aparecen: ${c.tags.join(", ")}` : ""}`);
      if (o.fullNotes && c.body.trim()) S.push("  " + c.body.trim().replace(/\n/g, "\n  "));
    }
  }

  // Tareas
  const tasks = collectTasks(p);
  const pending = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  if (pending.length || done.length) {
    S.push("\n## Tareas");
    if (pending.length) S.push("Pendientes:\n" + pending.map((t) => `- [ ] ${t.text} (${t.noteTitle})`).join("\n"));
    if (done.length && o.range === "all") S.push("Hechas:\n" + done.slice(-15).map((t) => `- [x] ${t.text}`).join("\n"));
  }

  // Notas / registro (cronológico)
  const notes = [...p.notes].filter((n) => n.updatedAt >= since).sort((a, b) => a.createdAt - b.createdAt);
  if (notes.length) {
    S.push(`\n## Registro (${notes.length} entrada${notes.length === 1 ? "" : "s"}, en orden cronológico)`);
    for (const n of notes) {
      const nm = noteMark(n, p.marks);
      S.push(`\n### ${n.title} — ${fmtDate(n.createdAt)}${n.group && n.group !== "General" ? ` · ${n.group}` : ""}${nm ? ` [${MARKS.find((x) => x.id === nm)?.short}]` : ""}`);
      if (n.panes.length > 1) {
        for (const pane of n.panes) {
          const body = pane.body.trim();
          if (!body) continue;
          S.push(`**${pane.title || "Recuadro"}:** ${o.fullNotes ? "\n" + body : noteSummary(body) || "(archivo)"}`);
          if (!o.fullNotes) for (const l of body.split("\n")) { const src = matchImage(l); if (src) S.push(`  - archivo: ${src}`); }
        }
      } else {
        const body = n.panes[0].body.trim();
        if (body) S.push(o.fullNotes ? body : noteSummary(body));
      }
    }
  }

  // Resultados
  const media = collectMedia(p);
  if (media.length && o.range === "all") {
    S.push(`\n## Resultados guardados (${media.length})`);
    for (const m of media) {
      const mk = p.marks[m.src];
      const tag = mk ? ` [${MARKS.find((x) => x.id === mk)?.short}]` : "";
      S.push(`- ${m.kind === "image" ? "imagen" : m.kind}${tag}: ${m.src}${m.prompt ? ` — prompt: ${m.prompt.slice(0, 120).replace(/\n/g, " ")}` : ""}`);
    }
  }

  // Prompts
  if (p.prompts.length) {
    S.push("\n## Prompts que usamos");
    for (const x of p.prompts) S.push(`### ${x.title}\n\`\`\`\n${x.body.trim()}\n\`\`\``);
  }

  // Accesos
  if (p.links.length || p.snippets.length || p.collections.length) {
    S.push("\n## Dónde están las cosas");
    for (const c of p.collections) S.push(`- colección "${c.name}": ${c.path}`);
    for (const l of p.links) S.push(`- ${l.name}: ${l.path}`);
    for (const s of p.snippets) S.push(`- comando "${s.title}": \`${s.body}\``);
  }

  return S.join("\n") + "\n";
}

/** Prompt de cierre: le pide a la IA que resuma la sesión en el formato que GULA sabe repartir. */
export function closingPrompt(p: Project): string {
  return `Estamos cerrando esta sesión de trabajo del proyecto "${p.name}". Resumí lo que hicimos en este chat usando EXACTAMENTE estos encabezados (los que no apliquen, dejalos vacíos), en español, sin texto fuera de ellos:

## Hecho
(una línea por cosa terminada)

## Pendiente
(una línea por cosa que quedó para después, como lista con "- [ ]")

## Decisiones
(una línea por decisión tomada, con el por qué)

## Prompts
(cada prompt que funcionó bien, con un título en negrita en la primera línea y el prompt debajo)

## Fichas
(personajes, lugares, objetos o escenas nuevos: "- Tipo: Nombre — resumen en una línea")

## Ahora
(una sola línea: en qué paso queda el proyecto)`;
}
