// Bajar a una carpeta todo lo que el proyecto tiene adentro: los archivos
// (imágenes, videos, audios) y los textos de cada recuadro, como .txt.
import { Note, Pane, Project, allBoxes } from "./types";
import { copyToDir, exportFiles } from "./backend";
import { matchImage } from "./components/MarkdownEditor";

/** Todos los archivos locales que aparecen en las notas del proyecto, sin repetir. */
export function projectFiles(p: Project): string[] {
  const out = new Set<string>();
  for (const n of p.notes)
    for (const box of allBoxes(n))
      for (const line of box.body.split("\n")) {
        const src = matchImage(line.trim());
        if (src && !/^(https?:|data:)/i.test(src)) out.add(src);
      }
  return [...out];
}

/** Copia todos esos archivos a `dir`. Los originales quedan donde están. */
export async function dumpFiles(
  p: Project,
  dir: string,
  onStep?: (done: number, total: number) => void,
): Promise<{ copied: number; failed: string[] }> {
  const all = projectFiles(p);
  let copied = 0;
  const failed: string[] = [];
  for (const src of all) {
    try {
      await copyToDir(src, dir);
      copied++;
    } catch {
      failed.push(src);
    }
    onStep?.(copied + failed.length, all.length);
  }
  return { copied, failed };
}

const clean = (s: string, fallback: string) => {
  const t = s.replace(/[\\/<>:"|?*\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 60) : fallback;
};

const nn = (i: number) => String(i + 1).padStart(2, "0");

/** Título de un recuadro para el nombre del archivo: el suyo, o su primera línea. */
function boxName(b: Pane, i: number): string {
  if (b.title.trim()) return `${nn(i)} - ${clean(b.title, "Recuadro")}`;
  for (const raw of b.body.split("\n")) {
    const l = raw.replace(/^\s*(#+\s*|[-*+]\s+(\[[ xX]\]\s*)?|\d+\.\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
    if (l && !/^!\[/.test(raw.trim())) return `${nn(i)} - ${clean(l, "Recuadro")}`;
  }
  return `${nn(i)} - Recuadro ${i + 1}`;
}

/**
 * Un .txt por recuadro, ordenados en carpetas:
 *   <Nota>/<Colección>/01 - Idea.txt   (nota de colección)
 *   <Nota>/01 - Idea.txt               (nota de recuadros)
 * Los recuadros sin texto no generan archivo.
 */
export function textFiles(p: Project): { name: string; content: string }[] {
  const out: { name: string; content: string }[] = [];
  const seen = new Set<string>();
  const push = (path: string, content: string) => {
    let name = path;
    for (let i = 2; seen.has(name.toLowerCase()); i++) name = path.replace(/\.txt$/, ` (${i}).txt`);
    seen.add(name.toLowerCase());
    out.push({ name, content });
  };
  p.notes.forEach((n: Note, ni) => {
    const noteDir = `${nn(ni)} - ${clean(n.title, "Nota")}`;
    n.panes.forEach((p1, i1) => {
      if (p1.panes?.length) {
        const collDir = `${noteDir}/${nn(i1)} - ${clean(p1.title, `Colección ${i1 + 1}`)}`;
        p1.panes.forEach((b, i) => {
          if (b.body.trim()) push(`${collDir}/${boxName(b, i)}.txt`, b.body.trim() + "\n");
        });
      } else if (p1.body.trim()) {
        push(`${noteDir}/${boxName(p1, i1)}.txt`, p1.body.trim() + "\n");
      }
    });
  });
  return out;
}

/** Un .txt por colección, con sus recuadros adentro. */
export function textFilesByCollection(p: Project): { name: string; content: string }[] {
  const out: { name: string; content: string }[] = [];
  p.notes.forEach((n, ni) => {
    const noteDir = `${nn(ni)} - ${clean(n.title, "Nota")}`;
    n.panes.forEach((p1, i1) => {
      const boxes = p1.panes?.length ? p1.panes : [p1];
      const body = boxes
        .filter((b) => b.body.trim())
        .map((b) => (b.title.trim() ? `## ${b.title.trim()}\n${b.body.trim()}` : b.body.trim()))
        .join("\n\n");
      if (body) out.push({ name: `${noteDir}/${nn(i1)} - ${clean(p1.title, `Colección ${i1 + 1}`)}.txt`, content: body + "\n" });
    });
  });
  return out;
}

export async function dumpTexts(p: Project, dir: string, byCollection = false): Promise<number> {
  const files = byCollection ? textFilesByCollection(p) : textFiles(p);
  if (files.length) await exportFiles(dir, files);
  return files.length;
}
