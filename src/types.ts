import { PROFILES, ProfileId, profileById } from "./profiles";

export type LinkKind = "folder" | "file" | "url";
export type Tab = "links" | "prompts" | "context" | "snippets" | "log" | "tasks" | "cards";
export type CardKind = "character" | "place" | "item" | "scene";
export type SceneStatus = "idea" | "draft" | "done";

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
  /** Sección en la barra lateral (ej: "General", "Ideas futuras"). */
  group: string;
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

export interface Project {
  id: string;
  name: string;
  profile: ProfileId;
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
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function newNote(title = "Nueva nota", body = "", group = DEFAULT_GROUP): Note {
  return { id: uid(), title, body, panes: [{ id: uid(), title: "", body }], pinned: false, updatedAt: Date.now(), group };
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
    notes: t.notes.map((n) => newNote(n.title, fill(n.body), n.group)),
    links: [],
    prompts: t.prompts.map((p) => ({ id: uid(), title: p.title, body: p.body, updatedAt: Date.now(), lastUsedAt: null })),
    blocks: t.blocks.map((b) => ({ id: uid(), title: b.title, body: fill(b.body), enabled: b.enabled })),
    snippets: t.snippets.map((s) => ({ id: uid(), ...s })),
    log: [],
    cards: [],
    lastSessionAt: null,
    sessionStartedAt: null,
  };
}

export { PROFILES };

export function defaultState(): AppState {
  const p = newProject("Mi proyecto", "blank");
  p.notes[0].body =
    "Escribí acá lo que quieras. Soporta **markdown** simple (Ctrl+E para ver).\n\n- [ ] Primera tarea\n- [x] Tarea hecha\n\nAbajo: carpetas, prompts, contexto para la IA, comandos y bitácora.\n\nCreá un proyecto nuevo desde el nombre de arriba para elegir un perfil (App, Novela, Contenido, Estudio).";
  return {
    version: 3,
    projects: [p],
    activeProjectId: p.id,
    activeNoteId: { [p.id]: p.notes[0].id },
    bottomTab: "links",
    alwaysOnTop: false,
    theme: "dark",
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
    notes: (p.notes?.length ? p.notes : [newNote()]).map((n) => ({
      ...n,
      group: n.group || DEFAULT_GROUP,
      panes: n.panes?.length ? n.panes : [{ id: uid(), title: "", body: n.body ?? "" }],
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
  };
}
