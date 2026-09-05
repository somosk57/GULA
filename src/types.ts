import { foldLogIntoDiary } from "./diary";
import { PROFILES, ProfileId, profileById } from "./profiles";

export type LinkKind = "folder" | "file" | "url";
export type Tab = "links" | "prompts" | "snippets" | "tasks" | "cards" | "gallery";
export const TABS: { id: Tab; label: string }[] = [
  { id: "links", label: "Accesos" },
  { id: "gallery", label: "Galería" },
  { id: "prompts", label: "Prompts" },
  { id: "cards", label: "Fichas" },
  { id: "tasks", label: "Tareas" },
];
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
export function noteMark(n: { mark?: Mark; panes: Pane[] }, marks: Record<string, Mark>): Mark | null {
  if (n.mark) return n.mark;
  let best: Mark | null = null;
  for (const p of allBoxes(n))
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

/** Un recuadro de una nota. En una nota de colección, los de primer nivel son
 *  las colecciones y llevan sus propios recuadros adentro (`panes`). */
export interface Pane {
  id: string;
  title: string;
  body: string;
  /** Color de etiqueta (para filtrar). */
  mark?: Mark;
  /** Si está definido, este cuadrado es una COLECCIÓN y estos son sus hijos.
   *  Sin `panes`, es un recuadro: se escribe adentro. Sin límite de profundidad. */
  panes?: Pane[];
  /** Marcado como pendiente con el círculo de la esquina. `true` = pendiente, `false` = hecho. */
  todo?: boolean;
  /** Colores ocultos mientras estás parado adentro de esta colección. */
  hidePaneMarks?: Mark[];
}

/** ¿Es una colección (tiene hijos) o un recuadro (se escribe adentro)? */
export const isColl = (p: Pane) => p.panes !== undefined;

/** Todos los recuadros con texto, a cualquier profundidad. */
export function allBoxes(n: { panes: Pane[] }): Pane[] {
  const out: Pane[] = [];
  const walk = (list: Pane[]) => {
    for (const p of list) {
      if (p.panes) walk(p.panes);
      else out.push(p);
    }
  };
  walk(n.panes);
  return out;
}

/** Todos los cuadrados, colecciones incluidas, a cualquier profundidad. */
export function allPanes(n: { panes: Pane[] }): Pane[] {
  const out: Pane[] = [];
  const walk = (list: Pane[]) => {
    for (const p of list) {
      out.push(p);
      if (p.panes) walk(p.panes);
    }
  };
  walk(n.panes);
  return out;
}

/** Busca un cuadrado por id, a cualquier profundidad. */
export function findPane(n: { panes: Pane[] }, id: string): Pane | undefined {
  for (const p of n.panes) {
    if (p.id === id) return p;
    const inner = p.panes && findPane({ panes: p.panes }, id);
    if (inner) return inner;
  }
  return undefined;
}

/** El camino de ids hasta un cuadrado (sin incluirlo), para poder abrirlo. */
export function pathTo(n: { panes: Pane[] }, id: string): string[] | null {
  const walk = (list: Pane[], acc: string[]): string[] | null => {
    for (const p of list) {
      if (p.id === id) return acc;
      if (p.panes) {
        const deep = walk(p.panes, [...acc, p.id]);
        if (deep) return deep;
      }
    }
    return null;
  };
  return walk(n.panes, []);
}

/** La lista de hijos que corresponde a un camino de ids. */
export function listAt(n: { panes: Pane[] }, path: string[]): Pane[] {
  let list = n.panes;
  for (const id of path) {
    const p = list.find((x) => x.id === id);
    if (!p?.panes) return list;
    list = p.panes;
  }
  return list;
}

/** El último recuadro donde escribir (el de más adentro). */
export function lastBox(n: { panes: Pane[] }): Pane {
  const all = allBoxes(n);
  return all[all.length - 1];
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
  /** Colores ocultos en la vista colección. */
  hidePaneMarks?: Mark[];
}

/** Título automático: primera línea con texto (sin marcas de markdown), máx. 60. */
export function deriveTitle(n: Note): string {
  const all = allBoxes(n);
  const pane = all.find((p) => /idea|t[ií]tulo|tema/i.test(p.title)) ?? all[0];
  for (const src of [pane, ...all].filter(Boolean)) {
    for (const raw of src.body.split("\n")) {
      const l = raw.replace(/^\s*(#+\s*|[-*+]\s+(\[[ xX]\]\s*)?|\d+\.\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
      if (l && !/^!\[/.test(raw.trim())) return l.slice(0, 60);
    }
  }
  return "Nueva nota";
}

export const DEFAULT_GROUP = "General";
/** Segunda sección con la que arranca un proyecto. */
export const NOTES_GROUP = "Apuntes";

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
  /** Solo escenas. */
  status?: SceneStatus;
  /** Solo escenas: personajes/lugar involucrados, por nombre. */
  tags?: string[];
  /** La colección de la que salió, o a la que se mandó: para ir y volver. */
  source?: { noteId: string; paneId: string };
}

/** Una carpeta con nombre propio dentro del proyecto. */
export interface Collection {
  id: string;
  name: string;
  path: string;
}

/** Un estante: una fila con nombre ("PERSONAJES") con colecciones de cualquier parte del mapa. */
export interface Shelf {
  id: string;
  title: string;
  ids: string[];
}

export interface Project {
  id: string;
  name: string;
  profile: ProfileId;
  /** Etapa del proyecto y "ahora estoy en…": la respuesta a "¿en qué paso estoy?". */
  stage: Stage;
  now: string;
  /** Cuándo se escribió "ahora estoy en…" por última vez. */
  nowAt?: number;
  /** Colecciones: carpetas con nombre (Clips, Artworks, Docs…) que la Galería muestra. */
  collections: Collection[];
  /** Id de la colección a la que se copian los archivos que insertás en notas (opcional). */
  copyTo?: string;
  /** Marcas por archivo (clave: ruta o URL tal como está en la nota). */
  marks: Record<string, Mark>;
  /** Etiquetas: títulos que usás seguido en los recuadros (Idea, Prompt, Imagen, Video…). */
  labels?: string[];
  /** Colecciones fijadas: aparecen en la columna de la izquierda para volver de un clic. */
  pins?: string[];
  /** Estantes: filas con nombre donde juntás colecciones de cualquier lado del mapa. */
  shelves?: Shelf[];
  /** Marcas ocultas en la barra izquierda ("Hide rojo", etc.). */
  hideMarks: Mark[];
  cards: Card[];
  notes: Note[];
  links: Link[];
  prompts: Prompt[];
  snippets: Snippet[];
  log: LogEntry[];
  /** Última vez que se empezó una sesión de trabajo (para la pantalla de proyectos). */
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
  /** Columna de proyectos a la izquierda (cuando hay más de uno). */
  rail?: boolean;
  /** La barra de la izquierda plegada: solo Etiquetas y Ver…, en vertical. */
  sidebarMin?: boolean;
  /** Pestañas del panel de abajo que el usuario apagó. */
  hiddenTabs?: Tab[];
  /** Panel de abajo visible. */
  bottomOpen?: boolean;
  /** Sección "Comandos" dentro de Accesos. */
  showCommands?: boolean;
  /** Atajos personalizados: id de acción → combo. */
  keys?: Record<string, string>;
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/**
 * Una nota es una colección de la raíz: el primer nivel del mapa.
 * Nace con un recuadro adentro (o con el texto que le pases).
 */
export function newNote(title = "Nueva nota", body = "", group = DEFAULT_GROUP): Note {
  return {
    id: uid(),
    title,
    body,
    panes: [{ id: uid(), title: "", body }],
    pinned: false,
    updatedAt: Date.now(),
    createdAt: Date.now(),
    group,
    autoTitle: title === "Nueva nota",
  };
}

/** Un cuadrado nuevo: colección (con un recuadro adentro) o recuadro suelto. */
export function newPane(coll: boolean, title = ""): Pane {
  return coll
    ? { id: uid(), title, body: "", panes: [{ id: uid(), title: "", body: "" }] }
    : { id: uid(), title, body: "" };
}

/** Copia entera de una nota: mismo tipo, mismos recuadros (y los de adentro), con ids nuevos. */
export function cloneNote(n: Note, title = n.title): Note {
  const copyPane = (p: Pane): Pane => ({
    id: uid(),
    title: p.title,
    body: p.body,
    ...(p.mark ? { mark: p.mark } : {}),
    ...(p.panes ? { panes: p.panes.map(copyPane) } : {}),
  });
  const c: Note = {
    ...n,
    id: uid(),
    title,
    autoTitle: false,
    panes: n.panes.map(copyPane),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hidePaneMarks: n.hidePaneMarks ? [...n.hidePaneMarks] : undefined,
  };
  syncNote(c);
  return c;
}

/** Texto completo de una nota a partir de sus recuadros (dos niveles si es colección). */
export function joinPanes(panes: Pane[], depth = 2): string {
  if (panes.length <= 1 && !panes[0]?.panes) return panes[0]?.body ?? "";
  const h = "#".repeat(Math.min(depth, 6));
  return panes
    .map((p) => {
      const head = `${h} ${p.title || (p.panes ? "Colección" : "Recuadro")}`;
      return p.panes ? `${head}\n${joinPanes(p.panes, depth + 1)}` : `${head}\n${p.body}`;
    })
    .join("\n\n");
}

/** Recalcula `body` después de editar columnas. Llamar siempre tras tocar `panes`. */
export function syncNote(n: Note) {
  if (n.panes.length === 0) n.panes.push({ id: uid(), title: "", body: "" });
  n.body = joinPanes(n.panes);
  n.updatedAt = Date.now();
}

/**
 * Con qué arranca un proyecto nuevo: lo mínimo para entender el mapa.
 * "GULA" es una colección que adentro tiene otra ("Colección 1") con dos
 * recuadros; "PROMPTS" es una colección con dos recuadros directos.
 */
export function defaultNotes(): Note[] {
  const gula = newNote("GULA");
  gula.autoTitle = false;
  gula.panes = [
    {
      id: uid(),
      title: "Colección 1",
      body: "",
      panes: [
        { id: uid(), title: "HOLA 123", body: "HOLA 123" },
        { id: uid(), title: "", body: "" },
      ],
    },
  ];
  syncNote(gula);

  const prompts = newNote("PROMPTS", "", NOTES_GROUP);
  prompts.autoTitle = false;
  prompts.panes = [
    { id: uid(), title: "Primer Prompt", body: "- Hola Mundo.." },
    { id: uid(), title: "", body: "" },
  ];
  syncNote(prompts);

  return [gula, prompts];
}

export function newProject(name: string, profile: ProfileId = "blank"): Project {
  const t = profileById(profile);
  return {
    id: uid(),
    name,
    profile,
    stage: "idea",
    now: "",
    notes: defaultNotes(),
    links: [],
    prompts: t.prompts.map((p) => ({ id: uid(), title: p.title, body: p.body, updatedAt: Date.now(), lastUsedAt: null })),
    snippets: t.snippets.map((s) => ({ id: uid(), ...s })),
    log: [],
    cards: [],
    marks: {},
    labels: [],
    hideMarks: [],
    collections: [],
    lastSessionAt: null,
    sessionStartedAt: null,
  };
}

export { PROFILES };

export function defaultState(): AppState {
  const p = newProject("Mi proyecto", "blank");
  // La nota de bienvenida va primera, antes de GULA y PROMPTS. Se puede borrar.
  const guia = newNote("Cómo usar GULA");
  guia.autoTitle = false;
  guia.panes[0].body =
    "GULA es un mapa. Hay una sola cosa, repetida hacia adentro.\n\n- Un **cuadrado con cosas adentro** es una **colección**: la abrís y ves lo que tiene.\n- Un **recuadro** es donde escribís y pegás archivos. Va siempre abierto: no hay que entrar.\n- En cualquier nivel podés sumar los dos, con los cuadrados punteados **+ Colección** y **+ Recuadro**. No hay límite de profundidad.\n- **Esc** sube un nivel. Arriba están las migas del camino: **clic derecho en una** y saltás a otra del mismo nivel sin subir y bajar.\n- Cada cuadrado tiene un **○** (pendiente: aparece en Tareas con el camino) y un **−** para sacarlo. Arrastrá para reordenar, y **soltá un cuadrado en el centro de una colección para meterlo adentro**.\n- Clic derecho en una colección → **Fijar a la izquierda**: en la columna (siempre a la vista) o en un **estante**, una fila con nombre (PERSONAJES, ESCENAS) donde juntás colecciones de lugares distintos y te movés con las flechas.\n- Clic derecho en un cuadrado: etiquetas, color, copiar, duplicar, bajar a una carpeta.\n- Una colección muestra las imágenes que tiene adentro, así la reconocés mirando.\n- Abajo a la izquierda: **Etiquetas** (los títulos que usás siempre, y “ver todos los de esa etiqueta” en todo el proyecto) y **Ver…** (qué se muestra).\n- **Ctrl+E** ve el texto con formato · **Ctrl+F** busca en todo · **Ctrl+/** los atajos, que podés cambiar.\n\nBorrá esta nota cuando quieras. Creá tu primer proyecto desde el nombre de arriba.";
  syncNote(guia);
  p.notes.unshift(guia);
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
    // De fábrica quedan a la vista solo Accesos, Prompts y Fichas. El resto se
    // prende desde ⋯ cuando haga falta.
    hiddenTabs: ["gallery"],
    bottomOpen: true,
    showCommands: false,
    // La barra de la izquierda arranca plegada: el mapa es el punto de la app.
    sidebarMin: true,
    keys: {},
  };
}

/** Completa campos que falten en datos guardados por versiones anteriores. */
export function migrate(raw: unknown): AppState {
  type OldProject = Partial<Project> & { context?: string };
  const s = raw as Partial<Omit<AppState, "projects">> & { projects?: OldProject[] };
  const projects: Project[] = (s.projects ?? []).map((p: OldProject) => ({
    id: p.id ?? uid(),
    name: p.name ?? "Proyecto",
    profile: p.profile ?? "blank",
    stage: p.stage ?? "active",
    now: p.now ?? "",
    nowAt: p.nowAt,
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
    snippets: p.snippets ?? [],
    log: p.log ?? [],
    cards: p.cards ?? [],
    marks: p.marks ?? {},
    labels: p.labels ?? [],
    pins: p.pins ?? [],
    shelves: p.shelves ?? [],
    hideMarks: p.hideMarks ?? [],
    // assetsDir de la 1.0 pasa a ser una colección "Assets" a la que se copia lo insertado.
    collections: p.collections ?? ((p as { assetsDir?: string }).assetsDir ? [{ id: "assets-" + (p.id ?? uid()), name: "Assets", path: (p as { assetsDir?: string }).assetsDir! }] : []),
    copyTo: p.copyTo ?? ((p as { assetsDir?: string }).assetsDir ? "assets-" + (p.id ?? uid()) : undefined),
    lastSessionAt: p.lastSessionAt ?? null,
    sessionStartedAt: p.sessionStartedAt ?? null,
  }));
  if (projects.length === 0) return defaultState();
  for (const p of projects) foldLogIntoDiary(p);
  const activeProjectId = projects.some((p) => p.id === s.activeProjectId)
    ? s.activeProjectId!
    : projects[0].id;
  return {
    version: 3,
    projects,
    activeProjectId,
    activeNoteId: s.activeNoteId ?? {},
    bottomTab: ["log", "context"].includes(s.bottomTab as string) ? "links" : s.bottomTab ?? "links",
    alwaysOnTop: s.alwaysOnTop ?? false,
    theme: s.theme ?? "dark",
    noteSort: s.noteSort ?? "manual",
    shortcut: s.shortcut ?? "Ctrl+Shift+Space",
    onboarded: s.onboarded ?? true,
    rail: s.rail ?? true,
    sidebarMin: s.sidebarMin ?? true,
    hiddenTabs: s.hiddenTabs ?? [],
    bottomOpen: s.bottomOpen ?? true,
    showCommands: s.showCommands ?? true,
    keys: s.keys ?? {},
  };
}
