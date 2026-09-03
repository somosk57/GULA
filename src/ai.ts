import { Note, Project, syncNote } from "./types";

/** Tilda/destilda la tarea que está en la línea `line` del texto completo de la nota (funciona con columnas). */
export function toggleTaskInNote(n: Note, line: number) {
  const flip = (s: string) => s.replace(/\[([ xX])\]/, (_, x) => (x === " " ? "[x]" : "[ ]"));
  if (n.panes.length <= 1) {
    const lines = n.body.split("\n");
    lines[line] = flip(lines[line] ?? "");
    n.panes[0].body = lines.join("\n");
  } else {
    // Mismo recorrido que joinPanes: "## título" + cuerpo, separados por línea vacía.
    let cursor = 0;
    for (const p of n.panes) {
      const bodyLines = p.body.split("\n");
      const start = cursor + 1; // después de "## título"
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

export interface TaskItem {
  noteId: string;
  noteTitle: string;
  line: number;
  text: string;
  done: boolean;
}

const TASK_LINE = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;

/** Junta todas las `- [ ]` de todas las notas del proyecto. */
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

export function fmtDate(t: number) {
  return new Date(t).toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

/**
 * Paquete para pegar en un chat nuevo: contexto + tareas pendientes +
 * últimas entradas de bitácora + último prompt usado.
 */
/** Texto del contexto: solo los bloques encendidos, cada uno con su título. */
export function contextText(p: Project, onlyEnabled = true): string {
  const blocks = p.blocks.filter((b) => (!onlyEnabled || b.enabled) && b.body.trim());
  if (!blocks.length) return `# Proyecto: ${p.name}`;
  return `# Proyecto: ${p.name}\n\n` + blocks.map((b) => `## ${b.title}\n${b.body.trim()}`).join("\n\n");
}

/** Estimación gruesa de tokens (≈ 4 caracteres por token en español/inglés). */
export const estimateTokens = (text: string) => Math.max(1, Math.round(text.length / 4));

export function buildAiPackage(p: Project): string {
  const parts: string[] = [];
  parts.push(contextText(p));

  const pending = collectTasks(p).filter((t) => !t.done);
  if (pending.length) {
    parts.push("## Tareas pendientes\n" + pending.slice(0, 20).map((t) => `- [ ] ${t.text}`).join("\n"));
  }

  const log = [...p.log].sort((a, b) => b.at - a.at).slice(0, 8);
  if (log.length) {
    parts.push("## Últimos avances\n" + log.map((e) => `- ${fmtDate(e.at)}: ${e.text}`).join("\n"));
  }

  const last = [...p.prompts].filter((x) => x.lastUsedAt).sort((a, b) => b.lastUsedAt! - a.lastUsedAt!)[0];
  if (last) {
    parts.push(`## Último prompt que estaba usando\n${last.body.trim()}`);
  }

  return parts.join("\n\n") + "\n";
}

/** Archivos .md para exportar el proyecto entero. */
export function exportProject(p: Project): { name: string; content: string }[] {
  const files: { name: string; content: string }[] = [];
  files.push({ name: "00-contexto.md", content: contextText(p, false) + "\n" });
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
  if (p.log.length) {
    files.push({
      name: "bitacora.md",
      content:
        [...p.log].sort((a, b) => b.at - a.at).map((e) => `- ${new Date(e.at).toLocaleDateString("es-AR")}: ${e.text}`).join("\n") + "\n",
    });
  }
  if (p.links.length) {
    files.push({ name: "enlaces.md", content: p.links.map((l) => `- ${l.name}: ${l.path}`).join("\n") + "\n" });
  }
  return files;
}
