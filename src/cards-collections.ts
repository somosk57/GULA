// El puente entre las colecciones y las fichas: una colección ES una ficha.
// Se puede traer una colección como ficha, o mandar una ficha a una colección.
import { Card, Note, Pane, Project, uid } from "./types";
import { matchImage } from "./components/MarkdownEditor";

export interface CollRef {
  noteId: string;
  paneId: string;
  /** "Nota › Colección" */
  label: string;
  boxes: number;
  pane: Pane;
}

/** Todas las colecciones del proyecto, de todas las notas de colección. */
export function allCollections(p: Project): CollRef[] {
  const out: CollRef[] = [];
  for (const n of p.notes) {
    if (n.kind !== "collection") continue;
    n.panes.forEach((c, i) => {
      out.push({
        noteId: n.id,
        paneId: c.id,
        label: `${n.title} › ${c.title.trim() || collLabel(c, i)}`,
        boxes: c.panes?.length ?? 0,
        pane: c,
      });
    });
  }
  return out;
}

/** El nombre que se lee de una colección sin título: su primer texto. */
export function collLabel(c: Pane, i: number): string {
  if (c.title.trim()) return c.title.trim();
  for (const b of c.panes ?? [])
    for (const raw of (b.title || b.body).split("\n")) {
      const l = raw.replace(/^\s*(#+\s*|[-*+]\s+|\d+\.\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
      if (l && !/^!\[/.test(raw.trim())) return l.slice(0, 60);
    }
  return `Colección ${i + 1}`;
}

/** Primera imagen que haya adentro de la colección. */
export function firstImage(c: Pane): string | undefined {
  for (const b of c.panes?.length ? c.panes : [c])
    for (const line of b.body.split("\n")) {
      const src = matchImage(line.trim());
      if (src) return src;
    }
  return undefined;
}

/** El texto de una colección, con cada recuadro bajo su título. */
export function collText(c: Pane): string {
  return (c.panes?.length ? c.panes : [c])
    .filter((b) => b.body.trim())
    .map((b) => (b.title.trim() ? `## ${b.title.trim()}\n${b.body.trim()}` : b.body.trim()))
    .join("\n\n");
}

/** Primera línea con texto de verdad (sin encabezados ni archivos): sirve de resumen. */
export function firstLine(text: string): string {
  for (const raw of text.split("\n")) {
    const l = raw.replace(/^\s*(#+\s*|[-*+]\s+|\d+\.\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
    if (l && !/^!\[/.test(raw.trim())) return l.slice(0, 160);
  }
  return "";
}

/** Una colección traída como ficha: nombre, imagen y texto salen de ella. */
export function cardFromCollection(ref: CollRef, kind: Card["kind"], index: number): Card {
  const body = collText(ref.pane);
  return {
    id: uid(),
    kind,
    name: collLabel(ref.pane, index),
    summary: firstLine(body),
    body,
    image: firstImage(ref.pane),
    inContext: kind !== "scene",
    status: kind === "scene" ? "idea" : undefined,
    source: { noteId: ref.noteId, paneId: ref.paneId },
  };
}

/** Una ficha mandada a una nota de colección: se arma la colección con sus recuadros. */
export function collectionFromCard(c: Card): Pane {
  const boxes: Pane[] = [];
  const texto = [c.summary.trim(), c.body.trim()].filter(Boolean).join("\n\n");
  boxes.push({ id: uid(), title: "Ficha", body: texto });
  if (c.image) boxes.push({ id: uid(), title: "Imagen", body: `![](<${c.image}>)\n` });
  if (boxes.length === 1) boxes.push({ id: uid(), title: "", body: "" });
  return { id: uid(), title: c.name, body: "", panes: boxes };
}

/** Las notas de colección del proyecto (para elegir a cuál mandar una ficha). */
export const collectionNotes = (p: Project): Note[] => p.notes.filter((n) => n.kind === "collection");
