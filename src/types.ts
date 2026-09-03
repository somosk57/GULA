export type LinkKind = "folder" | "file" | "url";
export type Tab = "links" | "prompts" | "context" | "snippets" | "log" | "tasks";

export interface Note {
  id: string;
  title: string;
  body: string;
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
}

export interface Project {
  id: string;
  name: string;
  notes: Note[];
  links: Link[];
  prompts: Prompt[];
  /** Descripción del proyecto para pegarle a la IA en un chat nuevo. */
  context: string;
  snippets: Snippet[];
  log: LogEntry[];
}

export interface AppState {
  version: 2;
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
  return { id: uid(), title, body, pinned: false, updatedAt: Date.now(), group };
}

export const CONTEXT_TEMPLATE = `# Proyecto: {name}

## Qué es
(una o dos líneas: qué hace y para quién)

## Stack / herramientas
-

## Decisiones tomadas
-

## Convenciones
- Idioma de la UI:
- Estilo de código:

## Estado actual
- Hecho:
- En progreso:
- Pendiente:
`;

export function newProject(name: string, template = true): Project {
  const notes = template
    ? [
        newNote("Idea principal", `# ${name}\n\n¿Qué quiero lograr?\n\n`),
        newNote("Requisitos", "- [ ] \n"),
        newNote("Tareas", "## Hoy\n- [ ] \n\n## Después\n- [ ] \n"),
        newNote("Notas rápidas", ""),
        newNote("Ideas", "- \n", "Ideas futuras"),
      ]
    : [newNote("Idea principal")];
  return {
    id: uid(),
    name,
    notes,
    links: [],
    prompts: [],
    context: template ? CONTEXT_TEMPLATE.replace("{name}", name) : "",
    snippets: [],
    log: [],
  };
}

export function defaultState(): AppState {
  const p = newProject("Mi proyecto");
  p.notes[0].body =
    "Escribí acá lo que quieras. Soporta **markdown** simple (Ctrl+E para ver).\n\n- [ ] Primera tarea\n- [x] Tarea hecha\n\nAbajo: carpetas, prompts, contexto para la IA, comandos y bitácora.";
  return {
    version: 2,
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
  const s = raw as Partial<AppState> & { projects?: Partial<Project>[] };
  const projects: Project[] = (s.projects ?? []).map((p) => ({
    id: p.id ?? uid(),
    name: p.name ?? "Proyecto",
    notes: (p.notes?.length ? p.notes : [newNote()]).map((n) => ({ ...n, group: n.group || DEFAULT_GROUP })),
    links: p.links ?? [],
    prompts: p.prompts ?? [],
    context: p.context ?? "",
    snippets: p.snippets ?? [],
    log: p.log ?? [],
  }));
  if (projects.length === 0) return defaultState();
  const activeProjectId = projects.some((p) => p.id === s.activeProjectId)
    ? s.activeProjectId!
    : projects[0].id;
  return {
    version: 2,
    projects,
    activeProjectId,
    activeNoteId: s.activeNoteId ?? {},
    bottomTab: s.bottomTab ?? "links",
    alwaysOnTop: s.alwaysOnTop ?? false,
    theme: s.theme ?? "dark",
  };
}
