// Bajar a una carpeta todo lo que el proyecto tiene adentro: los archivos
// (imágenes, videos, audios) y los textos de cada recuadro, como .txt.
import { Pane, Project, allBoxes } from "./types";
import { copyToDir, exportFiles } from "./backend";
import { matchImage, unfencePrompts } from "./components/MarkdownEditor";

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
    if (l && !/^!\[/.test(raw.trim()) && !/^```/.test(raw.trim())) return `${nn(i)} - ${clean(l, "Recuadro")}`;
  }
  return `${nn(i)} - Recuadro ${i + 1}`;
}

/**
 * Un .txt por recuadro, en carpetas que copian el mapa:
 *   01 - Nota/01 - Colección/02 - Sub/01 - Idea.txt
 * Los recuadros vacíos no generan archivo. Sin límite de profundidad.
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
  const walk = (list: Pane[], dir: string) => {
    list.forEach((x, i) => {
      if (x.panes) walk(x.panes, `${dir}/${nn(i)} - ${clean(x.title, `Colección ${i + 1}`)}`);
      else if (x.body.trim()) push(`${dir}/${boxName(x, i)}.txt`, unfencePrompts(x.body).trim() + "\n");
    });
  };
  p.notes.forEach((n, ni) => walk(n.panes, `${nn(ni)} - ${clean(n.title, "Nota")}`));
  return out;
}

/** Los recuadros de un cuadrado, a cualquier profundidad. */
const boxesOf = (p: Pane): Pane[] => (p.panes ? p.panes.flatMap(boxesOf) : [p]);

/** Archivos locales que hay adentro de una colección (o de un recuadro suelto). */
export function paneFiles(p: Pane): string[] {
  const out = new Set<string>();
  for (const b of boxesOf(p))
    for (const line of b.body.split("\n")) {
      const src = matchImage(line.trim());
      if (src && !/^(https?:|data:)/i.test(src)) out.add(src);
    }
  return [...out];
}

/**
 * Baja una colección entera a una carpeta: un .txt por recuadro con texto y una
 * copia de cada archivo, todo junto (la carpeta ya es la de esa colección).
 */
export async function dumpPane(
  p: Pane,
  dir: string,
  onStep?: (done: number, total: number) => void,
): Promise<{ texts: number; copied: number; failed: string[] }> {
  const files = boxesOf(p)
    .map((b, i) => ({ name: `${boxName(b, i)}.txt`, content: unfencePrompts(b.body).trim() + "\n" }))
    .filter((f) => f.content.trim());
  if (files.length) await exportFiles(dir, files);
  const media = paneFiles(p);
  let copied = 0;
  const failed: string[] = [];
  for (const src of media) {
    try {
      await copyToDir(src, dir);
      copied++;
    } catch {
      failed.push(src);
    }
    onStep?.(copied + failed.length, media.length);
  }
  return { texts: files.length, copied, failed };
}

/** Un .txt por colección, con todo lo que tenga adentro. */
export function textFilesByCollection(p: Project): { name: string; content: string }[] {
  const out: { name: string; content: string }[] = [];
  const walk = (list: Pane[], dir: string) => {
    list.forEach((x, i) => {
      if (!x.panes) return;
      const name = `${nn(i)} - ${clean(x.title, `Colección ${i + 1}`)}`;
      const body = boxesOf(x)
        .filter((b) => b.body.trim())
        .map((b) => (b.title.trim() ? `## ${b.title.trim()}\n${unfencePrompts(b.body).trim()}` : unfencePrompts(b.body).trim()))
        .join("\n\n");
      if (body) out.push({ name: `${dir}/${name}.txt`, content: body + "\n" });
      walk(x.panes, `${dir}/${name}`);
    });
  };
  p.notes.forEach((n, ni) => walk(n.panes, `${nn(ni)} - ${clean(n.title, "Nota")}`));
  return out;
}

export async function dumpTexts(p: Project, dir: string, byCollection = false): Promise<number> {
  const files = byCollection ? textFilesByCollection(p) : textFiles(p);
  if (files.length) await exportFiles(dir, files);
  return files.length;
}
