import { Note, Project, allBoxes, syncNote } from "./types";

/** Tilda/destilda la tarea que está en la línea `line` del texto completo de la nota (funciona con columnas). */
export function toggleTaskInNote(n: Note, line: number) {
  const flip = (s: string) => s.replace(/\[([ xX])\]/, (_, x) => (x === " " ? "[x]" : "[ ]"));
  const boxes = allBoxes(n);
  if (boxes.length <= 1 && !n.panes[0]?.panes) {
    const lines = n.body.split("\n");
    lines[line] = flip(lines[line] ?? "");
    if (boxes[0]) boxes[0].body = lines.join("\n");
  } else {
    // Mismo recorrido que joinPanes: cada recuadro va con su encabezado arriba.
    let cursor = 0;
    for (const p of boxes) {
      const bodyLines = p.body.split("\n");
      const start = cursor + 1; // después del encabezado
      if (line >= start && line < start + bodyLines.length) {
        bodyLines[line - start] = flip(bodyLines[line - start]);
        p.body = bodyLines.join("\n");
        break;
      }
      cursor = start + bodyLines.length + 1; // + línea vacía separadora
    }
  }
  syncNote(n);
}

export interface TaskItem { noteId: string; noteTitle: string; line: number; text: string; done: boolean }

const TASK_LINE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;

/** Las `- [ ]` escritas a mano, de todas las notas. */
export function collectTasks(p: Project): TaskItem[] {
  const out: TaskItem[] = [];
  for (const n of p.notes) {
    n.body.split("\n").forEach((line, i) => {
      const m = line.match(TASK_LINE);
      if (m) out.push({ noteId: n.id, noteTitle: n.title, line: i, text: m[2], done: m[1] !== " " });
    });
  }
  return out;
}

/** "hoy", "ayer", "hace 5 días", "hace 3 semanas"… */
export function fmtAgo(t: number) {
  const d = Math.floor((Date.now() - t) / 86_400_000);
  if (d <= 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 14) return `hace ${d} días`;
  if (d < 60) return `hace ${Math.round(d / 7)} semanas`;
  return `hace ${Math.round(d / 30)} meses`;
}

export function fmtDate(t: number) {
  return new Date(t).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

/** Estimación gruesa de tokens (≈ 4 caracteres por token en español/inglés). */
export const estimateTokens = (text: string) => Math.max(1, Math.round(text.length / 4));

/** Archivos .md para exportar el proyecto entero. */
export function exportProject(p: Project): { name: string; content: string }[] {
  const files: { name: string; content: string }[] = [];
  p.notes.forEach((n, i) => {
    files.push({ name: `${String(i + 1).padStart(2, "0")}-${n.title}.md`, content: `# ${n.title}\n\n${n.body}\n` });
  });
  if (p.prompts.length) {
    files.push({
      name: "prompts.md",
      content: p.prompts.map((x) => `## ${x.title}\n\n\`\`\`\n${x.body}\n\`\`\``).join("\n\n") + "\n",
    });
  }
  if (p.snippets.length) {
    files.push({
      name: "comandos.md",
      content: p.snippets.map((s) => `- **${s.title}**: \`${s.body}\``).join("\n") + "\n",
    });
  }
  if (p.cards.length) {
    const kinds = { character: "Personajes", place: "Lugares", item: "Objetos", scene: "Escenas" } as const;
    files.push({
      name: "biblia.md",
      content: (Object.keys(kinds) as (keyof typeof kinds)[])
        .map((k) => {
          const cs = p.cards.filter((c) => c.kind === k);
          return cs.length ? `# ${kinds[k]}\n\n` + cs.map((c) => `## ${c.name}\n${c.summary ? c.summary + "\n\n" : ""}${c.body}`).join("\n\n") : "";
        })
        .filter(Boolean)
        .join("\n\n") + "\n",
    });
  }
  if (p.links.length) {
    files.push({ name: "enlaces.md", content: p.links.map((l) => `- ${l.name}: ${l.path}`).join("\n") + "\n" });
  }
  return files;
}
