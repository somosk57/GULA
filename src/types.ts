import { PROFILES, ProfileId, profileById } from "./profiles";

export type LinkKind = "folder" | "file" | "url";
export type Tab = "links" | "prompts" | "context" | "snippets" | "log" | "tasks" | "cards" | "gallery";
export type CardKind = "character" | "place" | "item" | "scene";
export type SceneStatus = "idea" | "draft" | "done";
export type Stage = "idea" | "active" | "paused" | "done";
/** Marca de un archivo (imagen/video/audio): azul maestro, verde sirve, amarillo más o menos, rojo no. */
export type Mark = "master" | "good" | "meh" | "bad";
export const MARKS: { id: Mark; label: string; color: string; short: string }[] = [
  { id: "master", label: "Maestro (referencia)", color: "#4f8cff", short: "Maestro" },
  { id: "good", label: "Sirve", color: "#3ddc84", short: "Sirve" },
  { id: "meh", label: "Más o menos", color: "#e2b04a", short: "Más o menos" },
  { id: "bad", label: "No sirve", color: "#ff5f57", short: "No sirve" },
];
export const MARK_ORDER: Mark[] = ["master", "good", "meh", "bad"];
/** Marca efectiva de una nota: la propia, o la mejor de sus archivos. */
export function noteMark(n: { mark?: Mark; panes: { body: string }[] }, marks: Record<string, Mark>): Mark | null {
  if (n.mark) return n.mark;
  let best: Mark | null = null;
  for (const p of n.panes)
    for (const line of p.body.split("\n")) {
      const m = /!\[[^\]]*\]\(<?([^)>]+?)>?\)/.exec(line.trim());
      const mk = m && marks[m[1]];
      if (mk && (best === null || MARK_ORDER.indexOf(mk) < MARK_ORDER.indexOf(best))) best = mk;
    }
  return best;
}
export const markColor = (m?: Mark | null) => MARKS.find((x) => x.id === m)?.color ?? null;
export const STAGES: { id: Stage; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "active", label: "En marcha" },
  { id: "paused", label: "Pausado" },
  { id: "done", label: "Terminado" },
];

/** Una columna dentro de una nota. */
export interface Pane {
  id: string;
  title: string;
  body: string;
}

export interface Note {
  id: string;
  title: string;
  /** Texto completo de la nota. Con varias columnas es el texto derivado de `panes` (para buscar, tareas, IA). */
  body: string;
  /** Columnas. Siempre al menos una; panes[0].body === body cuando hay una sola. */
  panes: Pane[];
  pinned: boolean;
  updatedAt: number;
  createdAt: number;
  /** Sección en la barra lateral (ej: "General", "Ideas futuras"). */
  group: string;
  /** Mientras sea true, el título se deduce de la primera línea escrita. Se apaga al editar el título a mano. */
  autoTitle: boolean;
  /** Marca de la entrada entera (opcional). Si no está, se deduce de la mejor marca de sus archivos. */
  mark?: Mark;
}

/** Título automático: primera línea con texto (sin marcas de markdown), máx. 60. */
export function deriveTitle(n: Note): string {
  const pane = n.panes.find((p) => /idea|t[ií]tulo|tema/i.test(p.title)) ?? n.panes[0];
  for (const src of [pane, ...n.panes]) {
    for (const raw of src.body.split("\n")) {
      const l = raw.replace(/^\s*(#+\s*|[-*+]\s+(\[[ xX]\]\s*)?|\d+\.\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
      if (l && !/^!\[/.test(raw.trim())) return l.slice(0, 60);
    }
  }
  return "Nueva nota";
}

export const DEFAULT_GROUP = "General";

export interface Link {
  id: string;
  name: string;
  path: string;
  kind: LinkKind;
}

export interface Prompt {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
  lastUsedAt: number | null;
}

/** Comando de terminal o texto corto que copiás seguido. */
export interface Snippet {
  id: string;
  title: string;
  body: string;
  kind: "command" | "text";
}

export interface LogEntry {
  id: string;
  at: number;
  text: string;
  /** Link al chat u otra referencia de esa sesión. */
  link?: string;
  /** Duración de la sesión en minutos, si la entrada cerró una sesión. */
  minutes?: number;
}

/** Un bloque del contexto (Qué es, Estilo, Decisiones…). Los apagados no van en "Copiar para la IA". */
export interface ContextBlock {
  id: string;
  title: string;
  body: string;
  enabled: boolean;
}

/** Ficha de la biblia: personaje, lugar, objeto o escena. */
export interface Card {
  id: string;
  kind: CardKind;
  name: string;
  /** Una línea: lo que la IA necesita saber sí o sí. */
  summary: string;
  /** Detalle largo en markdown (no se copia a la IA salvo que el bloque lo pida). */
  body: string;
  /** Ruta a una imagen de referencia (local). */
  image?: string;
  /** Va en "Copiar para la IA" (nombre + resumen). */
  inContext: boolean;
  /** Solo escenas. */
  status?: SceneStatus;
  /** Solo escenas: personajes/lugar involucrados, por nombre. */
  tags?: string[];
}

/** Una carpeta con nombre propio dentro del proyecto. */
export interface Collection {
  id: string;
  name: string;
  path: string;
}

export interface Project {
  id: string;
  name: string;
  profile: ProfileId;
  /** Etapa del proyecto y "ahora estoy en…": la respuesta a "¿en qué paso estoy?". */
  stage: Stage;
  now: string;
  /** Colecciones: carpetas con nombre (Clips, Artworks, Docs…) que la Galería muestra. */
  collections: Collection[];
  /** Id de la colección a la que se copian los archivos que insertás en notas (opcional). */
  copyTo?: string;
  /** Marcas por archivo (clave: ruta o URL tal como está en la nota). */
  marks: Record<string, Mark>;
  /** Marcas ocultas en la barra izquierda ("Hide rojo", etc.). */
  hideMarks: Mark[];
  cards: Card[];
  notes: Note[];
  links: Link[];
  prompts: Prompt[];
  /** Contexto del proyecto para pegarle a la IA, en bloques. */
  blocks: ContextBlock[];
  snippets: Snippet[];
  log: LogEntry[];
  /** Última vez que se hizo "Copiar para la IA" (para la pantalla de proyectos). */
  lastSessionAt: number | null;
  /** Sesión de trabajo abierta (Empezar sesión → Cerrar sesión). */
  sessionStartedAt: number | null;
}

export interface AppState {
  version: 3;
  projects: Project[];
  activeProjectId: string;
  activeNoteId: Record<string, string>; // projectId -> noteId
  bottomTab: Tab;
  alwaysOnTop: boolean;
  theme: "dark" | "light" | "system";
  /** Orden de las notas en la barra: manual (arrastrar) o por fecha (más nuevas arriba). */
  noteSort: "manual" | "date";
  /** Atajo global para mostrar/ocultar la ventana. */
  shortcut: string;
  /** Ya pasó por el primer arranque. */
  onboarded: boolean;
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function newNote(title = "Nueva nota", body = "", group = DEFAULT_GROUP): Note {
  return { id: uid(), title, body, panes: [{ id: uid(), title: "", body }], pinned: false, updatedAt: Date.now(), createdAt: Date.now(), group, autoTitle: title === "Nueva nota" };
}

/** Texto completo de una nota a partir de sus columnas. */
export function joinPanes(panes: Pane[]): string {
  if (panes.length <= 1) return panes[0]?.body ?? "";
  return panes.map((p) => `## ${p.title || "Columna"}\n${p.body}`).join("\n\n");
}

/** Recalcula `body` después de editar columnas. Llamar siempre tras tocar `panes`. */
export function syncNote(n: Note) {
  if (n.panes.length === 0) n.panes.push({ id: uid(), title: "", body: "" });
  n.body = joinPanes(n.panes);
  n.updatedAt = Date.now();
}

export function newProject(name: string, profile: ProfileId = "blank"): Project {
  const t = profileById(profile);
  const fill = (x: string) => x.replace(/\{name\}/g, name);
  return {
    id: uid(),
    name,
    profile,
    stage: "idea",
    now: "",
    notes: t.notes.map((n) => newNote(n.title, fill(n.body), n.group)),
    links: [],
    prompts: t.prompts.map((p) => ({ id: uid(), title: p.title, body: p.body, updatedAt: Date.now(), lastUsedAt: null })),
    blocks: t.blocks.map((b) => ({ id: uid(), title: b.title, body: fill(b.body), enabled: b.enabled })),
    snippets: t.snippets.map((s) => ({ id: uid(), ...s })),
    log: [],
    cards: [],
    marks: {},
    hideMarks: [],
    collections: [],
    lastSessionAt: null,
    sessionStartedAt: null,
  };
}

export { PROFILES };

export function defaultState(): AppState {
  const p = newProject("Mi proyecto", "blank");
  p.notes[0].title = "Cómo usar GULA";
  p.notes[0].autoTitle = false;
  p.notes[0].panes[0].body = p.notes[0].body =
    "Cada nota es una entrada del diario: qué hiciste, con qué prompt, qué salió.\n\n- El botón de recuadros (arriba a la derecha) divide la nota en 2, 3, 4 o 6; cada recuadro tiene su título.\n- Arrastrá imágenes, videos o audios desde el Explorador a un recuadro.\n- **Copiar para la IA** (pestaña Contexto) arma todo lo que un chat nuevo necesita saber.\n- Al terminar un chat: *Prompt de cierre* → copiás la respuesta → Ctrl+Shift+V → *Repartir*.\n\nBorrá esta nota cuando quieras. Creá tu primer proyecto desde el nombre de arriba.";
  return {
    version: 3,
    projects: [p],
    activeProjectId: p.id,
    activeNoteId: { [p.id]: p.notes[0].id },
    bottomTab: "links",
    alwaysOnTop: false,
    theme: "dark",
    noteSort: "manual",
    shortcut: "Ctrl+Shift+Space",
    onboarded: false,
  };
}

/** Completa campos que falten en datos guardados por versiones anteriores. */
export function migrate(raw: unknown): AppState {
  type OldProject = Partial<Omit<Project, "blocks">> & { context?: string; blocks?: ContextBlock[] };
  const s = raw as Partial<Omit<AppState, "projects">> & { projects?: OldProject[] };
  const projects: Project[] = (s.projects ?? []).map((p: OldProject) => ({
    id: p.id ?? uid(),
    name: p.name ?? "Proyecto",
    profile: p.profile ?? "blank",
    stage: p.stage ?? "active",
    now: p.now ?? "",
    notes: (p.notes?.length ? p.notes : [newNote()]).map((n) => ({
      ...n,
      group: n.group || DEFAULT_GROUP,
      panes: n.panes?.length ? n.panes : [{ id: uid(), title: "", body: n.body ?? "" }],
      createdAt: n.createdAt ?? n.updatedAt ?? Date.now(),
      autoTitle: n.autoTitle ?? n.title === "Nueva nota",
    })).map((n) => {
      // Limpieza: notas de una columna que arrastraron títulos internos "## Columna" de un bug viejo.
      if (n.panes.length === 1 && /^## (Columna|Por hacer|Haciendo|Hecho|Escena|Notas|Dudas|Idea|Prompt|Resultado)\s*$/m.test(n.panes[0].body)) {
        const cleaned = n.panes[0].body
          .split("\n")
          .filter((l) => !/^## (Columna|Por hacer|Haciendo|Hecho|Escena|Notas|Dudas|Idea|Prompt|Resultado|Imagen|Video)\s*$/.test(l))
          .join("\n")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        n.panes[0].body = cleaned;
        n.body = cleaned;
      }
      return n;
    }),
    links: p.links ?? [],
    prompts: p.prompts ?? [],
    // v2 tenía un solo texto de contexto: pasa a ser el primer bloque.
    blocks: p.blocks ?? (p.context?.trim() ? [{ id: uid(), title: "Contexto", body: p.context ?? "", enabled: true }] : [{ id: uid(), title: "Qué es", body: "", enabled: true }]),
    snippets: p.snippets ?? [],
    log: p.log ?? [],
    cards: p.cards ?? [],
    marks: p.marks ?? {},
    hideMarks: p.hideMarks ?? [],
    // assetsDir de la 1.0 pasa a ser una colección "Assets" a la que se copia lo insertado.
    collections: p.collections ?? ((p as { assetsDir?: string }).assetsDir ? [{ id: "assets-" + (p.id ?? uid()), name: "Assets", path: (p as { assetsDir?: string }).assetsDir! }] : []),
    copyTo: p.copyTo ?? ((p as { assetsDir?: string }).assetsDir ? "assets-" + (p.id ?? uid()) : undefined),
    lastSessionAt: p.lastSessionAt ?? null,
    sessionStartedAt: p.sessionStartedAt ?? null,
  }));
  if (projects.length === 0) return defaultState();
  const activeProjectId = projects.some((p) => p.id === s.activeProjectId)
    ? s.activeProjectId!
    : projects[0].id;
  return {
    version: 3,
    projects,
    activeProjectId,
    activeNoteId: s.activeNoteId ?? {},
    bottomTab: s.bottomTab ?? "links",
    alwaysOnTop: s.alwaysOnTop ?? false,
    theme: s.theme ?? "dark",
    noteSort: s.noteSort ?? "manual",
    shortcut: s.shortcut ?? "Ctrl+Shift+Space",
    onboarded: s.onboarded ?? true,
  };
}
