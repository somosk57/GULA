import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, MARKS, MARK_ORDER, Mark, Note, Project, allBoxes, findPane, joinPanes, lastBox, markColor, newNote, syncNote, uid } from "../types";
import { assetUrl, isAudioPath, isVideoPath, openPath, revealInExplorer, copyText, pathExists, listDirMedia, DirEntryInfo, pickFolder, thumbnail, getThumb, putThumb, videoFrame, moveToSubdir } from "../backend";
import { ask, confirmDlg, notify } from "../dialog";
import { dumpFiles, projectFiles } from "../dump";
import { matchImage } from "./MarkdownEditor";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
  /** Para la galería de todos los proyectos. */
  allProjects?: Project[];
}

interface Item {
  projectId: string;
  src: string;
  kind: "image" | "video" | "audio" | "doc" | "other";
  /** Nota de origen (si viene de las notas) o null si viene de una colección del disco. */
  note: Note | null;
  paneTitle: string;
  /** El texto que acompaña al resultado: el recuadro "Prompt" si existe, si no el texto del mismo recuadro. */
  prompt: string;
}

/** Todos los resultados (imágenes, videos, audios) de todas las notas, en una grilla. */
export function collectMedia(p: Project): Item[] {
  const out: Item[] = [];
  for (const n of p.notes) {
    const boxes = allBoxes(n);
    const promptPane = boxes.find((x) => /prompt/i.test(x.title));
    for (const pane of boxes) {
      for (const line of pane.body.split("\n")) {
        const src = matchImage(line);
        if (!src) continue;
        const kind = isVideoPath(src) ? "video" : isAudioPath(src) ? "audio" : "image";
        const own = pane.body.split("\n").filter((l) => !matchImage(l)).join("\n").trim();
        out.push({ projectId: p.id, src, kind, note: n, paneTitle: pane.title, prompt: (promptPane?.body ?? own).trim() });
      }
    }
  }
  return out;
}

const srcOf = (s: string) => (/^(https?:|data:)/i.test(s) ? s : assetUrl(s));

const PAGE = 90;
const SIZES = [96, 140, 200, 280];
const thumbCache = new Map<string, string>();

/** Imagen de una casilla: pide la miniatura cacheada cuando entra en pantalla. */
let videoQueue: Promise<unknown> = Promise.resolve();

/** Miniatura de un archivo del disco: imagen redimensionada, o el primer cuadro si es video.
 *  La usan la Galería y los cuadrados de una colección. */
export function Thumb({ src, video, className }: { src: string; video?: boolean; className?: string }) {
  const ref = useRef<HTMLImageElement>(null);
  const [url, setUrl] = useState<string | null>(thumbCache.get(src) ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (url) return;
    if (/^(https?:|data:)/i.test(src)) { setUrl(src); return; }
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const io = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const done = (t: string) => { if (!alive) return; const u = assetUrl(t); thumbCache.set(src, u); setUrl(u); };
      if (video) {
        // Videos: primer cuadro, de a uno para no ahogar el WebView; queda cacheado en disco.
        getThumb(src).then((t) => {
          if (t) return done(t);
          videoQueue = videoQueue.then(() => (alive ? videoFrame(assetUrl(src)).then((b64) => putThumb(src, b64)).then(done) : undefined)).catch(() => alive && setFailed(true));
        });
      } else {
        thumbnail(src).then(done).catch(() => alive && setUrl(assetUrl(src)));
      }
    }, { rootMargin: "300px" });
    io.observe(el);
    return () => { alive = false; io.disconnect(); };
  }, [src, url, video]);
  if (video && failed) return <div className={"gaudio" + (className ? " " + className : "")}>▶<span>{src.split(/[\\/]/).pop()}</span></div>;
  return <img ref={ref} className={className} src={url ?? undefined} alt="" draggable={false} decoding="async" />;
}

/** Vista grande: flechas para pasar, 1–4 para marcar, Enter abre, Esc cierra. */
function Lightbox({ items, index, marks, onIndex, onMark, onClose, onGoNote, onNewEntry }: {
  items: Item[]; index: number; marks: Record<string, Mark>;
  onIndex: (i: number) => void; onMark: (it: Item, m: Mark | null) => void; onClose: () => void; onGoNote: (it: Item) => void; onNewEntry: (it: Item) => void;
}) {
  const it = items[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); onIndex(Math.min(items.length - 1, index + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); onIndex(Math.max(0, index - 1)); }
      else if (e.key === "Enter") openPath(it.src);
      else if (/^[1-4]$/.test(e.key)) { const m = MARK_ORDER[Number(e.key) - 1]; onMark(it, marks[it.src] === m ? null : m); }
      else if (e.key === "0" || e.key === "Backspace") onMark(it, null);
      else if (e.key.toLowerCase() === "n" && !it.note) onNewEntry(it);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items, it, marks, onIndex, onMark, onClose, onNewEntry]);
  if (!it) return null;
  const mk = marks[it.src];
  return (
    <div className="dlg-backdrop lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <button className="lb-nav prev" onClick={() => onIndex(Math.max(0, index - 1))} disabled={index === 0}>‹</button>
      <div className="lb-body" style={mk ? { outline: `3px solid ${markColor(mk)}` } : undefined}>
        {it.kind === "image" && <img src={srcOf(it.src)} alt="" draggable={false} />}
        {it.kind === "video" && <video src={srcOf(it.src)} controls autoPlay />}
        {it.kind === "audio" && <audio src={srcOf(it.src)} controls autoPlay />}
        {(it.kind === "doc" || it.kind === "other") && <div className="gaudio gdoc" style={{ width: 300, height: 200 }}>{(it.src.split(".").pop() ?? "").toUpperCase()}</div>}
      </div>
      <button className="lb-nav next" onClick={() => onIndex(Math.min(items.length - 1, index + 1))} disabled={index >= items.length - 1}>›</button>
      <div className="lb-foot" onMouseDown={(e) => e.stopPropagation()}>
        <span className="lb-name" title={it.src}>{it.note ? `${it.note.title}${it.paneTitle ? " · " + it.paneTitle : ""}` : it.src.split(/[\\/]/).pop()}</span>
        <span className="mark-filter">
          {MARKS.map((m, i) => (
            <button key={m.id} className={"mark-dot" + (mk === m.id ? " on" : "")} style={{ background: m.color }} title={`${m.label} (${i + 1})`} onClick={() => onMark(it, mk === m.id ? null : m.id)} />
          ))}
        </span>
        <span className="prompt-sub">{index + 1} / {items.length} · ← → pasar · 1–4 marcar{it.note ? "" : " · N nueva entrada"} · Enter abrir · Esc cerrar</span>
        {it.note ? <button className="chip" onClick={() => { onGoNote(it); onClose(); }}>Ir a la nota</button> : <button className="chip add" onClick={() => onNewEntry(it)} title="Crea una entrada con Prompt y Resultado (N)">N · Nueva entrada</button>}
        <button className="chip" onClick={() => openPath(it.src)}>Abrir</button>
        <button className="chip" onClick={() => revealInExplorer(it.src)}>Explorador</button>
      </div>
    </div>
  );
}

/** Arrastre con el mouse (el drag&drop de HTML5 pelea con el de Tauri en Windows): la casilla sigue al cursor
 *  y al soltar sobre un recuadro de la nota, o sobre una nota de la barra izquierda, se inserta ahí. */
function useMediaDrag(onDrop: (it: Item, target: { paneId?: string; noteId?: string }) => void) {
  return (e: React.MouseEvent, it: Item, thumbEl: HTMLElement) => {
    if (e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let ghost: HTMLElement | null = null;
    let over: Element | null = null;
    const move = (ev: MouseEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
        ghost = thumbEl.cloneNode(true) as HTMLElement;
        ghost.className = "drag-ghost";
        document.body.appendChild(ghost);
        document.body.classList.add("dragging-media");
      }
      ghost.style.left = ev.clientX + 12 + "px";
      ghost.style.top = ev.clientY + 12 + "px";
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const t = under?.closest("[data-pane], .note-item") ?? null;
      if (t !== over) { over?.classList.remove("drop-here"); over = t; over?.classList.add("drop-here"); }
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      over?.classList.remove("drop-here");
      document.body.classList.remove("dragging-media");
      if (!ghost) return;
      ghost.remove();
      ev.preventDefault();
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const pane = under?.closest("[data-pane]") as HTMLElement | null;
      const note = under?.closest(".note-item") as HTMLElement | null;
      if (pane) onDrop(it, { paneId: pane.dataset.pane });
      else if (note) onDrop(it, { noteId: note.dataset.id });
      // Un clic normal (sin arrastre) sigue abriendo la vista grande: lo maneja onClick.
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
}
let suppressClick = false;

export function GalleryPanel({ project, update, allProjects }: Props) {
  const startDrag = useMediaDrag((it, target) =>
    update((d) => {
      const p = d.projects.find((p) => p.id === project.id)!;
      const n = target.paneId
        ? p.notes.find((n) => !!findPane(n, target.paneId!))
        : p.notes.find((n) => n.id === target.noteId);
      if (!n) return;
      const pane = (target.paneId ? findPane(n, target.paneId) : lastBox(n))!;
      pane.body = (pane.body.trimEnd() ? pane.body.trimEnd() + "\n" : "") + `![](<${it.src}>)\n`;
      syncNote(n);
      d.activeNoteId[p.id] = n.id;
    }),
  );
  const [limit, setLimit] = useState(PAGE);
  const [size, setSize] = useState<number>(() => { try { return Number(localStorage.getItem("gula.tile")) || 140; } catch { return 140; } });
  const [lbSrc, setLbSrc] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<"all" | "image" | "video" | "audio" | "doc">("all");
  const [scope, setScope] = useState<"project" | "all">("project");
  /** "notes" = lo que está en las notas; o el id de una colección (carpeta del disco). */
  const [source, setSource] = useState<string>("all");
  const [files, setFiles] = useState<(DirEntryInfo & { collection: string })[]>([]);
  const [loose, setLoose] = useState(false);
  const [dumping, setDumping] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [markFilter, setMarkFilter] = useState<Mark | "all">("all");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const collection = project.collections.find((c) => c.id === source) ?? null;

  // Colecciones: leer las carpetas del disco (la elegida, o todas en "Todo").
  const wanted = collection ? [collection] : source === "all" ? project.collections : [];
  const wantedKey = wanted.map((c) => c.id + "|" + c.path).join(";");
  useEffect(() => {
    if (!wanted.length) { setFiles([]); setLoadErr(null); return; }
    let alive = true;
    Promise.all(wanted.map((c) => listDirMedia(c.path).then((f) => f.map((x) => ({ ...x, collection: c.name })), (e) => { if (alive) setLoadErr(String(e)); return []; })))
      .then((all) => { if (alive) { setFiles(all.flat()); } });
    return () => { alive = false; };
  }, [wantedKey, project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const items = useMemo<Item[]>(() => {
    const fromNotes = scope === "all" && allProjects ? allProjects.flatMap(collectMedia) : collectMedia(project);
    if (source === "notes") return fromNotes;
    // Una sola grilla: cada archivo una vez. Si está en una nota, gana la versión de la nota (trae prompt y título).
    const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase();
    const seen = new Map<string, Item>();
    if (source === "all") for (const it of fromNotes) if (!seen.has(norm(it.src))) seen.set(norm(it.src), it);
    for (const f of files) {
      const k = norm(f.path);
      const inNote = fromNotes.find((it) => norm(it.src) === k);
      if (seen.has(k)) continue;
      seen.set(k, inNote ?? { projectId: project.id, src: f.path, kind: f.kind, note: null, paneTitle: f.collection, prompt: "" });
    }
    return [...seen.values()];
  }, [project, allProjects, scope, source, files]);

  // Detectar archivos que ya no están (movidos o borrados).
  useEffect(() => {
    let alive = true;
    (async () => {
      const bad = new Set<string>();
      for (const it of items) {
        if (/^(https?:|data:)/i.test(it.src)) continue;
        if (!(await pathExists(it.src))) bad.add(it.src);
      }
      if (alive) setBroken(bad);
    })();
    return () => { alive = false; };
  }, [items]);
  const markOf = (it: Item) => (allProjects?.find((p) => p.id === it.projectId) ?? project).marks[it.src] ?? null;
  const setMark = (it: Item, mark: Mark | null) =>
    update((d) => {
      const p = d.projects.find((p) => p.id === it.projectId)!;
      if (mark) p.marks[it.src] = mark; else delete p.marks[it.src];
    });
  const shown = items
    .filter((i) => kind === "all" || i.kind === kind || (kind === "doc" && i.kind === "other"))
    .filter((i) => markFilter === "all" || markOf(i) === markFilter)
    .filter((i) => !loose || !i.note)
    .filter((i) => { const s = q.trim().toLowerCase(); return !s || i.src.toLowerCase().includes(s) || i.prompt.toLowerCase().includes(s) || (i.note?.title ?? "").toLowerCase().includes(s) || i.paneTitle.toLowerCase().includes(s); });
  const looseCount = items.filter((i) => !i.note).length;
  // Rojos sueltos de las colecciones: candidatos a irse a _descartados.
  const redLoose = items.filter((i) => !i.note && markOf(i) === "bad" && !/^(https?:|data:)/i.test(i.src));
  const discardReds = async () => {
    if (!redLoose.length) return;
    if (!(await confirmDlg(`¿Mover ${redLoose.length} archivo${redLoose.length === 1 ? "" : "s"} rojo${redLoose.length === 1 ? "" : "s"} a "_descartados"?`, "No se borra nada: cada uno va a una subcarpeta _descartados dentro de su carpeta. La marca roja se mantiene.", { okLabel: "Mover" }))) return;
    const moved: [string, string][] = [];
    for (const it of redLoose) { try { moved.push([it.src, await moveToSubdir(it.src)]); } catch { /* sigue con el resto */ } }
    update((d) => {
      const p = d.projects.find((p) => p.id === project.id)!;
      for (const [from, to] of moved) { delete p.marks[from]; p.marks[to] = "bad"; }
    });
    setFiles((fs) => fs.filter((f) => !moved.some(([from]) => from === f.path)));
  };
  useEffect(() => setLimit(PAGE), [kind, source, scope, markFilter, loose, q, project.id]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setLimit((l) => l + PAGE), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [shown.length]);
  const visible = shown.slice(0, limit);
  const lb = lbSrc === null ? null : shown.findIndex((x) => x.src === lbSrc);
  const markCounts = Object.fromEntries(MARKS.map((m) => [m.id, items.filter((i) => markOf(i) === m.id).length])) as Record<Mark, number>;
  const counts = { image: 0, video: 0, audio: 0, doc: 0 };
  items.forEach((i) => counts[i.kind === "other" ? "doc" : i.kind]++);

  /** Entrada nueva con este archivo en el recuadro "Resultado" (y un "Prompt" vacío al lado). */
  const newEntryWith = (it: Item) =>
    update((d) => {
      const p = d.projects.find((p) => p.id === it.projectId)!;
      const name = it.src.split(/[\\/]/).pop()?.replace(/\.[a-z0-9]+$/i, "") ?? "Resultado";
      const n = newNote(name.slice(0, 60), "");
      n.autoTitle = false;
      n.panes = [{ id: uid(), title: "Prompt", body: "" }, { id: uid(), title: "Resultado", body: `![](<${it.src}>)\n` }];
      n.body = joinPanes(n.panes);
      const lastIdx = p.notes.map((x) => x.group).lastIndexOf(n.group);
      p.notes.splice(lastIdx < 0 ? p.notes.length : lastIdx + 1, 0, n);
      d.activeNoteId[p.id] = n.id;
    });

  const goTo = (n: Note, projectId = project.id) =>
    update((d) => {
      d.activeProjectId = projectId;
      d.activeNoteId[projectId] = n.id;
    });

  const itemMenu = (e: React.MouseEvent, it: Item) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...MARKS.map((m) => ({
          label: `${markOf(it) === m.id ? "● " : "○ "}${m.label}`,
          onClick: () => setMark(it, markOf(it) === m.id ? null : m.id),
        })),
        ...(it.note ? [{ label: "Ir a la nota", separator: true, onClick: () => goTo(it.note!, it.projectId) }] : [{ label: "Nueva entrada con este archivo", separator: true, onClick: () => newEntryWith(it) }]),
        {
          label: "Insertar en la nota abierta",
          separator: !it.note,
          onClick: () =>
            update((d) => {
              const p = d.projects.find((p) => p.id === it.projectId)!;
              const n = p.notes.find((n) => n.id === d.activeNoteId[p.id]) ?? p.notes[0];
              if (!n) return;
              const last = lastBox(n);
              last.body = (last.body.trimEnd() ? last.body.trimEnd() + "\n" : "") + `![](<${it.src}>)\n`;
              syncNote(n);
            }),
        },
        { label: "Abrir archivo", onClick: () => openPath(it.src) },
        { label: "Mostrar en Explorador", onClick: () => revealInExplorer(it.src) },
        { label: "Copiar prompt", onClick: () => copyText(it.prompt), separator: true },
        { label: "Copiar ruta", onClick: () => copyText(it.src) },
      ],
    });
  };

  return (
    <div className="gallery">
      <div className="panel-actions sources">
        <input className="gsearch" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar archivo, prompt o nota…" spellCheck={false} />
        <button className={"chip" + (source === "all" ? " on" : "")} onClick={() => setSource("all")} title="Todo junto: lo de las notas y lo de las colecciones, cada archivo una vez">Todo</button>
        <button className={"chip" + (source === "notes" ? " on" : "")} onClick={() => setSource("notes")} title="Solo lo que está en las notas del proyecto">En las notas</button>
        {project.collections.map((c) => (
          <button
            key={c.id}
            className={"chip" + (source === c.id ? " on" : "") + (project.copyTo === c.id ? " copy-target" : "")}
            title={`${c.path}${project.copyTo === c.id ? "\n(acá se copian los archivos que insertás en notas)" : ""}\nclic derecho: opciones`}
            onClick={() => setSource(c.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({
                x: e.clientX, y: e.clientY,
                items: [
                  { label: "Abrir carpeta", onClick: () => openPath(c.path) },
                  {
                    label: project.copyTo === c.id ? "✓ Acá se copian los archivos insertados (quitar)" : "Copiar acá los archivos que inserte en notas",
                    onClick: () => update((d) => { const p = d.projects.find((p) => p.id === project.id)!; p.copyTo = p.copyTo === c.id ? undefined : c.id; }),
                  },
                  {
                    label: "Renombrar",
                    separator: true,
                    onClick: async () => { const t = await ask("Nombre de la colección", c.name); if (t?.trim()) update((d) => (d.projects.find((p) => p.id === project.id)!.collections.find((x) => x.id === c.id)!.name = t.trim())); },
                  },
                  { label: "Cambiar carpeta…", onClick: async () => { const dir = await pickFolder(); if (dir) update((d) => (d.projects.find((p) => p.id === project.id)!.collections.find((x) => x.id === c.id)!.path = dir)); } },
                  {
                    label: "Quitar colección",
                    danger: true,
                    separator: true,
                    onClick: async () => {
                      if (!(await confirmDlg(`¿Quitar "${c.name}"?`, "No borra nada del disco; solo deja de mostrarse acá.", { okLabel: "Quitar" }))) return;
                      update((d) => { const p = d.projects.find((p) => p.id === project.id)!; p.collections = p.collections.filter((x) => x.id !== c.id); if (p.copyTo === c.id) p.copyTo = undefined; });
                      setSource("notes");
                    },
                  },
                ],
              });
            }}
          >
            {project.copyTo === c.id ? "⤓ " : ""}{c.name}
          </button>
        ))}
        <button
          className="chip add"
          title="Una carpeta de tu PC con nombre propio: Clips, Highlights, Artworks, Docs, Assets…"
          onClick={async () => {
            const name = await ask("Nombre de la colección", "", { placeholder: "Ej: Clips, Highlights, Artworks, Docs, Assets…" });
            if (!name?.trim()) return;
            const dir = await pickFolder();
            if (!dir) return;
            const id = Math.random().toString(36).slice(2);
            update((d) => d.projects.find((p) => p.id === project.id)!.collections.push({ id, name: name.trim(), path: dir }));
            setSource(id);
          }}
        >
          + Colección
        </button>
        <button
          className="chip"
          title="Copiar a una carpeta todos los archivos que ya están puestos en las notas de este proyecto"
          onClick={async () => {
            const total = projectFiles(project).length;
            if (!total) return notify("No hay archivos", "Todavía no pusiste imágenes, videos ni audios en las notas de este proyecto.");
            const dir = await pickFolder();
            if (!dir) return;
            if (!(await confirmDlg(`¿Bajar ${total} archivo${total === 1 ? "" : "s"}?`, `Se copian a:\n${dir}\n\nLos originales quedan donde están y nada se pisa.`, { okLabel: "Bajar" }))) return;
            setDumping(`0 de ${total}`);
            const { copied, failed } = await dumpFiles(project, dir, (done: number) => setDumping(`${done} de ${total}`));
            setDumping(null);
            notify(
              `${copied} archivo${copied === 1 ? "" : "s"} en la carpeta`,
              failed.length ? `${failed.length} no se pudieron copiar (¿los moviste o los borraste?):\n` + failed.slice(0, 10).join("\n") : dir,
            );
          }}
        >
          ⤓ Bajar archivos…
        </button>
        {dumping && <span className="prompt-sub">Copiando {dumping}…</span>}
      </div>
      <div className="panel-actions">
        {(["all", "image", "video", "audio", "doc"] as const).map((k) => (
          <button key={k} className={"chip" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>
            {k === "all" ? `Todos ${items.length}` : k === "image" ? `Imágenes ${counts.image}` : k === "video" ? `Videos ${counts.video}` : k === "audio" ? `Audios ${counts.audio}` : `Docs ${counts.doc}`}
          </button>
        ))}
        <span className="mark-filter">
          {MARKS.map((m) => (
            <button
              key={m.id}
              className={"mark-dot" + (markFilter === m.id ? " on" : "")}
              style={{ background: m.color }}
              title={`${m.label}: ${markCounts[m.id]}`}
              onClick={() => setMarkFilter((f) => (f === m.id ? "all" : m.id))}
            >
              {markCounts[m.id] > 0 && <span>{markCounts[m.id]}</span>}
            </button>
          ))}
        </span>
        <button
          className="chip"
          title="Tamaño de las casillas"
          onClick={() => { const n = SIZES[(SIZES.indexOf(size) + 1) % SIZES.length]; setSize(n); try { localStorage.setItem("gula.tile", String(n)); } catch { /* sin storage */ } }}
        >
          {size <= 96 ? "▫ chico" : size <= 140 ? "◽ medio" : size <= 200 ? "◻ grande" : "⬜ enorme"}
        </button>
        {source !== "notes" && (
          <button className={"chip" + (loose ? " on" : "")} title="Archivos de las colecciones que todavía no están en ninguna entrada" onClick={() => setLoose((v) => !v)}>
            Sueltos {looseCount}
          </button>
        )}
        {redLoose.length > 0 && (
          <button className="chip" style={{ color: "#ff5f57", borderColor: "#ff5f57" }} title="Mueve los archivos rojos que no están en ninguna entrada a una subcarpeta _descartados (no borra nada)" onClick={discardReds}>
            Apartar rojos {redLoose.length}
          </button>
        )}
        {broken.size > 0 && <span className="chip broken-chip" title="Archivos que ya no están en su ruta: movidos, renombrados o borrados">⚠ {broken.size} sin archivo</span>}
        {loadErr && <span className="chip broken-chip">⚠ {loadErr}</span>}
        {!collection && allProjects && allProjects.length > 1 && (
          <button className={"chip add" + (scope === "all" ? " on" : "")} onClick={() => setScope((s) => (s === "all" ? "project" : "all"))}>
            {scope === "all" ? "Todos los proyectos" : "Solo este proyecto"}
          </button>
        )}
      </div>
      <div className="gallery-grid" style={{ ["--tile" as string]: size + "px" }}>
        {visible.map((it, i) => (
          <div
            key={it.src + i}
            className={"gitem " + it.kind + (broken.has(it.src) ? " broken" : "") + (markOf(it) ? " marked" : "")}
            style={markOf(it) ? { borderColor: markColor(markOf(it))!, boxShadow: `inset 0 0 0 2px ${markColor(markOf(it))}` } : undefined}
            title={(broken.has(it.src) ? "⚠ No se encuentra el archivo\n" : "") + (it.prompt ? it.prompt.slice(0, 300) + "\n\n" : "") + `— ${it.note ? it.note.title : it.paneTitle}${it.note && it.paneTitle ? " · " + it.paneTitle : ""}`}
            onClick={() => { if (!suppressClick) setLbSrc(it.src); }}
            onMouseDown={(e) => startDrag(e, it, e.currentTarget)}
            onDoubleClick={() => openPath(it.src)}
            onContextMenu={(e) => itemMenu(e, it)}
          >
            {it.kind === "image" && <Thumb src={it.src} />}
            {it.kind === "video" && <Thumb src={it.src} video />}
            {it.kind === "audio" && <div className="gaudio">♪<span>{it.src.split(/[\\/]/).pop()}</span></div>}
            {(it.kind === "doc" || it.kind === "other") && <div className="gaudio gdoc">{(it.src.split(".").pop() ?? "").toUpperCase().slice(0, 5)}<span>{it.src.split(/[\\/]/).pop()}</span></div>}
            {it.note && source !== "notes" && <span className="gnote" title={`En la nota: ${it.note.title}`}>#</span>}
            <div className="gmarks" onClick={(e) => e.stopPropagation()}>
              {MARKS.map((m) => (
                <button key={m.id} className={"mark-dot tiny" + (markOf(it) === m.id ? " on" : "")} style={{ background: m.color }} title={m.label} onClick={() => setMark(it, markOf(it) === m.id ? null : m.id)} />
              ))}
            </div>
            <div className="gcap">
              <span className="gtitle">{scope === "all" ? `${allProjects?.find((p) => p.id === it.projectId)?.name ?? ""} · ` : ""}{it.note ? it.note.title : it.src.split(/[\\/]/).pop()}</span>
              {it.prompt && <span className="gprompt">{it.prompt.slice(0, 80)}</span>}
            </div>
          </div>
        ))}
        {shown.length > visible.length && <div ref={sentinel} className="empty wide">Cargando… ({visible.length} de {shown.length})</div>}
        {shown.length === 0 && (
          <div className="empty wide">
            {collection
              ? `La carpeta "${collection.name}" está vacía (o no tiene imágenes, videos, audios ni documentos).`
              : "Acá aparecen las imágenes, videos y audios de las notas del proyecto. Con \"+ Colección\" sumás carpetas de tu PC con nombre propio (Clips, Artworks, Docs…) y las ves acá mismo."}
          </div>
        )}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {lb !== null && lb >= 0 && (
        <Lightbox
          items={shown}
          index={lb}
          marks={project.marks}
          onIndex={(i) => { setLbSrc(shown[i]?.src ?? null); if (i + 10 > limit) setLimit((l) => l + PAGE); }}
          onMark={(it, m) => setMark(it, m)}
          onClose={() => setLbSrc(null)}
          onGoNote={(it) => goTo(it.note!, it.projectId)}
          onNewEntry={newEntryWith}
        />
      )}
    </div>
  );
}
