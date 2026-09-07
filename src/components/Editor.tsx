import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import {
  AppState,
  MARKS,
  Mark,
  Note,
  Pane,
  Project,
  deriveTitle,
  findPane,
  isColl,
  listAt,
  markColor,
  newNote,
  newPane,
  pathTo,
  syncNote,
  uid,
} from "../types";
import { MarkdownEditor, insertImage, isImagePath, matchImage, unfencePrompts } from "./MarkdownEditor";
import type { EditorView } from "@codemirror/view";
import { assetUrl, copyText, copyToDir, isAudioPath, isVideoPath, openUrl, pickFolder, pickImage, win } from "../backend";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { Thumb } from "./GalleryPanel";
import { ask, confirmDlg, notify } from "../dialog";
import { useReorder } from "../reorder";
import { comboFor, comboFromEvent } from "../keys";
import { dumpPane, paneFiles } from "../dump";
import { onGoToPane } from "../navigate";
import { pinMenuItem } from "./Shelves";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
  keys?: Record<string, string>;
}

/**
 * El mapa. Un solo tipo de cosa repetida hacia adentro:
 *  - Una COLECCIÓN es un cuadrado con cosas adentro (`pane.panes`). Se entra.
 *  - Un RECUADRO es un cuadrado donde se escribe (`pane.panes` sin definir).
 *    Va siempre abierto: no hay que entrar para usarlo.
 * Los dos conviven en el mismo nivel y no hay límite de profundidad.
 * `path` es el camino de ids: el primero es una nota (la colección de la raíz).
 */
export function Editor({ project, update, keys }: Props) {
  const [path, setPath] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [q, setQ] = useState("");
  const [size, setSize] = useState<number>(() => { try { return Number(localStorage.getItem("gula.card")) || 170; } catch { return 170; } });
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const views = useRef<Record<string, EditorView>>({});

  // ---- dónde estamos ----
  const note: Note | null = path.length ? project.notes.find((n) => n.id === path[0]) ?? null : null;
  const atRoot = path.length === 0;
  /** Los cuadrados de este nivel. En la raíz, las notas del proyecto. */
  const level: Pane[] = atRoot ? (project.notes as unknown as Pane[]) : note ? listAt(note, path.slice(1)) : [];
  /** La colección abierta (el cuadrado en el que estamos parados). */
  const here: Pane | null = !note ? null : path.length === 1 ? (note as unknown as Pane) : findPane(note, path[path.length - 1]) ?? null;

  // Si el camino apunta a algo que ya no existe (lo borraron, cambió el proyecto), volver a la raíz.
  useEffect(() => {
    if (path.length && !note) setPath([]);
  }, [project.id, note, path.length]);

  useEffect(() => { setPath([]); setQ(""); }, [project.id]);

  // Dejar anotado en qué colección estás: lo usan "Pegar como…" y la pantalla de Hoy.
  useEffect(() => {
    const id = path[0];
    if (id && project.notes.some((n) => n.id === id)) update((d) => (d.activeNoteId[project.id] = id));
  }, [path[0], project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- guardar ----
  /** Toca la lista del nivel donde estás y deja la nota consistente. */
  const editLevel = (fn: (list: Pane[], p: Project) => void) =>
    update((d) => {
      const p = d.projects.find((x) => x.id === project.id)!;
      if (atRoot) { fn(p.notes as unknown as Pane[], p); return; }
      const n = p.notes.find((x) => x.id === path[0]);
      if (!n) return;
      fn(listAt(n, path.slice(1)), p);
      syncNote(n);
    });

  /** Toca un cuadrado por id (esté donde esté). */
  const editPane = (id: string, fn: (p: Pane) => void) =>
    update((d) => {
      const p = d.projects.find((x) => x.id === project.id)!;
      const asNote = p.notes.find((n) => n.id === id);
      if (asNote) { fn(asNote as unknown as Pane); asNote.autoTitle = false; return; }
      const n = p.notes.find((x) => x.id === path[0]);
      if (!n) return;
      const target = findPane(n, id);
      if (target) fn(target);
      syncNote(n);
      if (n.autoTitle) n.title = deriveTitle(n);
    });

  /**
   * Agarrar la esquina de abajo a la derecha y estirar. El tamaño se guarda en
   * celdas de la grilla, así que nada se superpone: la grilla acomoda el resto
   * y lo nuevo entra siempre después de lo último.
   */
  const GAP = 12;
  /** La grilla va en tercios: un cuadrado "de fábrica" son 3 pasos, no 1. */
  const unit = (size - 2 * GAP) / 3;
  const startResize = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    const el = (e.currentTarget as HTMLElement).closest(".pane, .coll-card") as HTMLElement | null;
    const grid = gridRef.current;
    if (!el || !grid) return;
    const cell = unit + GAP;
    const cols = Math.max(1, Math.floor((grid.clientWidth + GAP) / cell));
    const r0 = el.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let last = { w: Math.round((r0.width + GAP) / cell) || 1, h: Math.round((r0.height + GAP) / cell) || 1 };
    el.classList.add("resizing");
    const move = (ev: MouseEvent) => {
      const w = Math.min(cols, Math.max(1, Math.round((r0.width + ev.clientX - x0 + GAP) / cell)));
      const h = Math.min(24, Math.max(1, Math.round((r0.height + ev.clientY - y0 + GAP) / cell)));
      last = { w, h };
      el.style.gridColumn = `span ${w}`;
      el.style.gridRow = `span ${h}`;
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      el.classList.remove("resizing");
      editPane(id, (x) => { x.w = last.w; x.h = last.h; });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  /** El tamaño de un cuadrado, en tercios: de fábrica una colección es 3×3 y un recuadro 6×6. */
  const spanOf = (p: Pane): React.CSSProperties => {
    const w = p.w ?? (isColl(p) ? 3 : 6);
    const h = p.h ?? (isColl(p) ? 3 : 6);
    return { gridColumn: `span ${w}`, gridRow: `span ${h}` };
  };

  const setMark = (src: string, mark: Mark | null) =>
    update((d) => {
      const p = d.projects.find((x) => x.id === project.id)!;
      if (mark) p.marks[src] = mark; else delete p.marks[src];
    });

  // ---- filtros ----
  const hidden = here?.hidePaneMarks ?? [];
  const needle = q.trim().toLowerCase();
  const matches = (p: Pane): boolean => {
    if (!needle) return true;
    if ((p.title + "\n" + p.body).toLowerCase().includes(needle)) return true;
    return (p.panes ?? []).some(matches);
  };
  const visible = level.filter((p) => !(p.mark && hidden.includes(p.mark)) && matches(p));
  const colls = visible.filter(isColl);
  const boxes = visible.filter((p) => !isColl(p));

  // ---- acciones del nivel ----
  const addColl = () => {
    const np = newPane(true);
    if (atRoot) {
      const n = newNote("Nueva colección");
      n.autoTitle = false;
      update((d) => d.projects.find((x) => x.id === project.id)!.notes.push(n));
      setPath([n.id]);
      return;
    }
    editLevel((list) => list.push(np));
    setPath([...path, np.id]);
  };

  const addBox = () => editLevel((list) => list.push(newPane(false)));

  const removePane = async (p: Pane) => {
    const inner = p.panes?.length ?? 0;
    const hasText = p.body.trim() || inner > 0;
    if (
      hasText &&
      !(await confirmDlg(
        isColl(p) ? `¿Sacar “${paneLabel(p, 0)}”?` : "¿Sacar este recuadro?",
        isColl(p) ? `Se va con sus ${inner} cosa${inner === 1 ? "" : "s"} adentro. Ctrl+Z lo devuelve.` : "Ctrl+Z lo devuelve.",
        { danger: true, okLabel: "Sacar" },
      ))
    )
      return;
    editLevel((list, pr) => {
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list.splice(i, 1);
      if (atRoot) delete pr.marks[""];
    });
    if (path.includes(p.id)) setPath(path.slice(0, path.indexOf(p.id)));
  };

  const dupPane = (p: Pane) =>
    editLevel((list) => {
      const copy = (x: Pane): Pane => ({ ...x, id: uid(), panes: x.panes?.map(copy) });
      const i = list.findIndex((x) => x.id === p.id);
      list.splice(i + 1, 0, { ...copy(p), title: p.title ? p.title + " (copia)" : "" });
    });

  const cycleTodo = (p: Pane) =>
    editPane(p.id, (x) => {
      if (x.todo === undefined) x.todo = true;
      else if (x.todo) x.todo = false;
      else delete x.todo;
    });

  const copyPane = async (p: Pane) => {
    const text = collText(p);
    await copyText(text);
    notify("Copiado", p.title.trim() || "Ya está en el portapapeles.");
  };

  const downloadPane = async (p: Pane) => {
    const files = paneFiles(p);
    const conTexto = boxesOf(p).filter((b) => b.body.trim()).length;
    if (!conTexto && !files.length) return notify("No hay nada que bajar", "Esto todavía está vacío.");
    const dir = await pickFolder();
    if (!dir) return;
    if (
      !(await confirmDlg(
        `¿Bajar “${paneLabel(p, 0)}”?`,
        `${conTexto} texto${conTexto === 1 ? "" : "s"} y ${files.length} archivo${files.length === 1 ? "" : "s"} van a:\n${dir}\n\nLos originales quedan donde están.`,
        { okLabel: "Bajar" },
      ))
    )
      return;
    try {
      const r = await dumpPane(p, dir);
      notify(`${r.texts} texto${r.texts === 1 ? "" : "s"} y ${r.copied} archivo${r.copied === 1 ? "" : "s"} en la carpeta`, dir);
    } catch (e) {
      notify("No se pudo bajar", String(e));
    }
  };

  /** Arrastrar para reordenar el nivel. */
  const gridRef = useReorder<HTMLDivElement>({
    item: ".coll-card:not(.add), .pane:not(.add)",
    attr: "data-pane",
    axis: "xy",
    // Soltar en el centro de una colección lo mete adentro de ella.
    intoSelector: ".coll-card:not(.add)",
    onDropInto: (dragId, targetId) =>
      editLevel((list) => {
        const from = list.findIndex((x) => x.id === dragId);
        const target = list.find((x) => x.id === targetId);
        if (from < 0 || !target?.panes) return;
        const [moved] = list.splice(from, 1);
        target.panes.push(moved);
      }),
    onDrop: (dragId, overId, before) =>
      editLevel((list) => {
        const from = list.findIndex((x) => x.id === dragId);
        if (from < 0) return;
        const [moved] = list.splice(from, 1);
        const to = list.findIndex((x) => x.id === overId);
        if (to < 0) { list.push(moved); return; }
        list.splice(before ? to : to + 1, 0, moved);
      }),
  });

  // ---- llegar desde afuera (Tareas, etiquetas, buscador) ----
  useEffect(
    () =>
      onGoToPane((paneId) => {
        for (const n of project.notes) {
          if (n.id === paneId) { setPath([n.id]); return; }
          const p = pathTo(n, paneId);
          if (p) {
            const target = findPane(n, paneId)!;
            setPath(isColl(target) ? [n.id, ...p, paneId] : [n.id, ...p]);
            setFlash(paneId);
            setTimeout(() => document.querySelector(`[data-pane="${paneId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
            setTimeout(() => setFlash((f) => (f === paneId ? null : f)), 2000);
            return;
          }
        }
      }),
    [project.notes],
  );

  // ---- atajos ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = comboFromEvent(e);
      if (!c) return;
      if (c === comboFor(keys, "preview")) { e.preventDefault(); setPreview((v) => !v); }
      else if (e.key === "Escape" && path.length) { e.preventDefault(); setPath(path.slice(0, -1)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, path]);

  // ---- archivos soltados desde el Explorador ----
  const onDropRef = useRef<(paths: string[], at: { x: number; y: number } | null) => void>(() => {});
  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    win.onDrop((paths, at) => onDropRef.current(paths, at)).then((f) => { off = f; if (dead) f(); });
    return () => { dead = true; off?.(); off = undefined; };
  }, []);

  onDropRef.current = (paths, at) => {
    const media = paths.filter(isImagePath);
    if (!media.length) return;
    const copyDir = project.collections.find((c) => c.id === project.copyTo)?.path;
    const write = async (paneId: string) => {
      const lines: string[] = [];
      for (const m of media) lines.push(`![](<${copyDir ? await copyToDir(m, copyDir).catch(() => m) : m}>)`);
      editPane(paneId, (p) => {
        const target = p.panes?.length ? p.panes[p.panes.length - 1] : p;
        target.body = (target.body.trimEnd() ? target.body.trimEnd() + "\n" : "") + lines.join("\n") + "\n";
      });
    };
    if (at) {
      const under = document.elementFromPoint(at.x, at.y);
      if (under?.closest(".bottom")) return;
      const el = under?.closest("[data-pane]") as HTMLElement | null;
      const id = el?.dataset.pane;
      if (id) {
        const view = views.current[id];
        if (view) (async () => { for (const m of media) insertImage(view, copyDir ? await copyToDir(m, copyDir).catch(() => m) : m); })();
        else write(id);
        return;
      }
    }
    const view = Object.values(views.current).find((v) => v.hasFocus) ?? Object.values(views.current)[0];
    if (view) (async () => { for (const m of media) insertImage(view, copyDir ? await copyToDir(m, copyDir).catch(() => m) : m); })();
  };

  // ---- menús ----
  const labels = project.labels ?? [];
  const paneMenu = (e: React.MouseEvent, p: Pane) => {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [
      { label: p.todo === undefined ? "○ Dejar pendiente" : p.todo ? "✓ Marcar como hecho" : "Sacar de Tareas", onClick: () => cycleTodo(p) },
      {
        label: "Etiquetas",
        separator: true,
        onClick: () => {},
        items: [
          ...labels.map((t) => ({
            label: p.title.trim() === t ? `${t} ✓` : t,
            onClick: () => editPane(p.id, (x) => (x.title = x.title.trim() === t ? "" : t)),
          })),
          {
            label: "+ Nueva etiqueta…",
            separator: labels.length > 0,
            onClick: async () => {
              const v = (await ask("Nueva etiqueta", p.title.trim(), { placeholder: "Ej: Idea, Prompt, Imagen, Escena, Video…" }))?.trim();
              if (!v) return;
              update((d) => {
                const pr = d.projects.find((x) => x.id === project.id)!;
                if (!(pr.labels ?? []).includes(v)) pr.labels = [...(pr.labels ?? []), v];
              });
              editPane(p.id, (x) => (x.title = v));
            },
          },
        ],
      },
      {
        label: "Renombrar",
        onClick: async () => {
          const t = await ask(isColl(p) ? "Nombre de la colección" : "Nombre del recuadro", p.title);
          if (t !== null) editPane(p.id, (x) => (x.title = t.trim()));
        },
      },
      // Colecciones y recuadros: los dos se pueden fijar y los dos van a un estante.
      pinMenuItem(p, project, update),
      ...(p.w || p.h ? [{ label: "Volver al tamaño de fábrica", onClick: () => editPane(p.id, (x) => { delete x.w; delete x.h; }) }] : []),
      { label: "Copiar el texto", onClick: () => copyPane(p) },
      { label: "Duplicar", onClick: () => dupPane(p) },
      { label: "⤓ Bajar a una carpeta…", onClick: () => downloadPane(p) },
      ...(isColl(p) ? [] : [{
        label: "Insertar imagen, video o audio…",
        onClick: async () => {
          const picked = await pickImage();
          if (!picked) return;
          const dir = project.collections.find((c) => c.id === project.copyTo)?.path;
          const file = dir ? await copyToDir(picked, dir).catch(() => picked) : picked;
          const v = views.current[p.id];
          if (v) insertImage(v, file);
          else editPane(p.id, (x) => (x.body = (x.body.trimEnd() ? x.body.trimEnd() + "\n" : "") + `![](<${file}>)\n`));
        },
      }]),
      ...MARKS.map((m) => ({
        label: p.mark === m.id ? `${m.short} ✓` : m.short,
        color: m.color,
        separator: m.id === "master",
        onClick: () => editPane(p.id, (x) => { if (x.mark === m.id) delete x.mark; else x.mark = m.id; }),
      })),
      { label: "Sacar", danger: true, separator: true, onClick: () => removePane(p) },
    ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const bgMenu = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".coll-card, .pane")) return;
    e.preventDefault();
    const items: MenuItem[] = [{ label: "+ Nueva colección", onClick: addColl }];
    if (!atRoot) items.push({ label: "+ Nuevo recuadro", onClick: addBox });
    items.push({ label: preview ? "Volver a escribir  (Ctrl+E)" : "Ver con formato  (Ctrl+E)", separator: true, onClick: () => setPreview((v) => !v) });
    if (path.length) items.push({ label: "Subir un nivel  (Esc)", onClick: () => setPath(path.slice(0, -1)) });
    if (hidden.length && here) items.push({ label: "Mostrar todos los colores", onClick: () => editPane(here.id, (x) => (x.hidePaneMarks = [])) });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  /** Cada miga despliega sus hermanos: saltar de costado sin subir y bajar. */
  const crumbMenu = (e: React.MouseEvent, depth: number) => {
    e.preventDefault();
    e.stopPropagation();
    const parentPath = path.slice(0, depth);
    const siblings: Pane[] =
      depth === 0
        ? (project.notes as unknown as Pane[])
        : note
          ? listAt(note, parentPath.slice(1))
          : [];
    if (!siblings.length) return;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: siblings.filter(isColl).map((sib, i) => ({
        label: (sib.id === path[depth] ? "✓  " : "     ") + paneLabel(sib, i),
        onClick: () => setPath([...parentPath, sib.id]),
      })),
    });
  };

  // ---- vista con formato ----
  const bodyText = useMemo(() => (here ? collText(here) : ""), [here]);
  const html = useMemo(
    () =>
      preview
        ? (marked.parse(bodyText) as string)
            .replace(/<input([^>]*)disabled=""/g, "<input$1")
            .replace(/<img src="(?!https?:|data:)([^"]+)"/g, (_, src) => `<img src="${assetUrl(decodeURIComponent(src))}"`)
        : "",
    [preview, bodyText],
  );

  const title = here ? paneLabel(here, 0) : project.name;

  return (
    <section className="editor">
      <div className="editor-head">
        {here ? (
          <input
            className="note-title"
            value={here.title}
            onChange={(e) => editPane(here.id, (x) => (x.title = e.target.value))}
            placeholder={paneLabel(here, 0)}
            spellCheck={false}
          />
        ) : (
          <span className="note-title as-text">{project.name}</span>
        )}
        {!preview && (
          <>
            <span className="head-marks">
              {MARKS.map((m) => (
                <button
                  key={m.id}
                  className={"mark-dot" + (hidden.includes(m.id) ? " off" : " on")}
                  style={{ background: m.color }}
                  title={`${hidden.includes(m.id) ? "Mostrar" : "Ocultar"}: ${m.label}`}
                  onClick={() =>
                    here
                      ? editPane(here.id, (x) => {
                          const h = x.hidePaneMarks ?? [];
                          x.hidePaneMarks = h.includes(m.id) ? h.filter((y) => y !== m.id) : [...h, m.id];
                        })
                      : undefined
                  }
                  disabled={!here}
                />
              ))}
            </span>
            <input className="coll-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filtrar ${level.length}…`} spellCheck={false} />
            <input
              className="coll-size"
              type="range"
              min={130}
              max={320}
              step={10}
              value={size}
              onChange={(e) => { const v = Number(e.target.value); setSize(v); try { localStorage.setItem("gula.card", String(v)); } catch { /* sin localStorage */ } }}
              title="Tamaño"
            />
          </>
        )}
      </div>

      <div className="crumbs">
        <button className={"crumb" + (atRoot ? " here" : "")} onClick={() => setPath([])} onContextMenu={(e) => crumbMenu(e, 0)}>
          {project.name}
        </button>
        {path.map((id, i) => {
          const step = i === 0 ? project.notes.find((n) => n.id === id) : note ? findPane(note, id) : null;
          return (
            <span key={id} className="crumb-step">
              <span className="crumb-sep">›</span>
              <button
                className={"crumb" + (i === path.length - 1 ? " here" : "")}
                onClick={() => setPath(path.slice(0, i + 1))}
                onContextMenu={(e) => crumbMenu(e, i)}
                title="Clic derecho: saltar a otra de este nivel"
              >
                {step ? paneLabel(step as Pane, i) : "…"}
              </button>
            </span>
          );
        })}
        <span className="crumb-hint">
          {level.length} adentro{path.length ? " · Esc sube" : ""}
        </span>
      </div>

      {preview ? (
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div
          className="map"
          ref={gridRef}
          onContextMenu={bgMenu}
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${unit}px, 1fr))`, gridAutoRows: `${unit}px` }}
        >
          {colls.map((p) => {
            const color = markColor(p.mark);
            const inner = p.panes?.length ?? 0;
            return (
              <div
                key={p.id}
                className={"coll-card" + (flash === p.id ? " flash" : "") + (p.todo ? " todo" : "") + ((project.pins ?? []).includes(p.id) ? " pinned" : "")}
                data-pane={p.id}
                style={{ ...spanOf(p), ...(color ? { boxShadow: `inset 3px 0 0 ${color}` } : {}) }}
                onClick={() => setPath([...path, p.id])}
                onContextMenu={(e) => paneMenu(e, p)}
                title={`${inner} adentro`}
              >
                <Mosaic pane={p} />
                <button className="coll-x" title="Sacar" onClick={(e) => { e.stopPropagation(); removePane(p); }}>−</button>
                <button
                  className={"coll-todo" + (p.todo === undefined ? "" : p.todo ? " on" : " done")}
                  title={p.todo === undefined ? "Dejar pendiente" : p.todo ? "Marcar como hecho" : "Sacar de Tareas"}
                  onClick={(e) => { e.stopPropagation(); cycleTodo(p); }}
                >
                  {p.todo === false ? "✓" : "○"}
                </button>
                <span className="coll-title">{paneLabel(p, level.indexOf(p))}</span>
                <span className="coll-foot">
                  <span className="coll-kind">{inner} adentro</span>
                  <button className="coll-copy" title="Copiar el texto" onClick={(e) => { e.stopPropagation(); copyPane(p); }}>Copiar</button>
                </span>
                <span className="grip" title="Estirar: arrastrá esta esquina" onMouseDown={(e) => startResize(e, p.id)} />
              </div>
            );
          })}

          {boxes.map((p) => {
            const color = markColor(p.mark);
            return (
              <div
                key={p.id}
                className={"pane" + (flash === p.id ? " flash" : "") + (p.todo ? " todo" : "")}
                data-pane={p.id}
                style={{ ...spanOf(p), ...(color ? { boxShadow: `inset 3px 0 0 ${color}` } : {}) }}
                onContextMenu={(e) => paneMenu(e, p)}
                // Un clic en cualquier parte vacía del recuadro entra a escribir,
                // con el cursor al final. Antes había que acertarle al texto.
                onMouseDown={(e) => {
                  const t = e.target as HTMLElement;
                  if (t.closest(".cm-editor, .pane-head, .grip")) return;
                  const v = views.current[p.id];
                  if (!v) return;
                  e.preventDefault();
                  v.focus();
                  v.dispatch({ selection: { anchor: v.state.doc.length } });
                }}
              >
                <span className="grip" title="Estirar: arrastrá esta esquina" onMouseDown={(e) => startResize(e, p.id)} />
                <div className="pane-head">
                  <input
                    className="pane-title"
                    value={p.title}
                    onChange={(e) => editPane(p.id, (x) => (x.title = e.target.value))}
                    placeholder="Título…"
                    spellCheck={false}
                  />
                  <button
                    className={"pane-todo" + (p.todo === undefined ? "" : p.todo ? " on" : " done")}
                    title={p.todo === undefined ? "Dejar pendiente" : p.todo ? "Marcar como hecho" : "Sacar de Tareas"}
                    onClick={() => cycleTodo(p)}
                  >
                    {p.todo === false ? "✓" : "○"}
                  </button>
                  <button className="pane-x" title="Sacar este recuadro" onClick={() => removePane(p)}>−</button>
                </div>
                <MarkdownEditor
                  key={p.id}
                  value={p.body}
                  onChange={(v) => editPane(p.id, (x) => (x.body = v))}
                  placeholder="Escribí acá…"
                  compact
                  onReady={(v) => (views.current[p.id] = v)}
                  marks={project.marks}
                  onMark={setMark}
                />
              </div>
            );
          })}

          {!needle && (
            <button className="coll-card add" onClick={addColl} title="Sumar una colección: un cuadrado con cosas adentro">
              <span>+</span>
              <em>Colección</em>
            </button>
          )}
          {!needle && !atRoot && (
            <button className="coll-card add box" onClick={addBox} title="Sumar un recuadro: para escribir o pegar archivos">
              <span>+</span>
              <em>Recuadro</em>
            </button>
          )}
          {needle && !visible.length && <div className="empty wide">Nada dice “{q.trim()}”.</div>}
        </div>
      )}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {title === "" && null}
    </section>
  );
}

/** Los recuadros de un cuadrado, a cualquier profundidad. */
function boxesOf(p: Pane): Pane[] {
  if (!p.panes) return [p];
  return p.panes.flatMap(boxesOf);
}

/** El texto de un cuadrado y todo lo que tenga adentro. */
function collText(p: Pane): string {
  if (!p.panes) return unfencePrompts(p.body).trim();
  return p.panes
    .map((x) => {
      const t = collText(x);
      if (!t) return "";
      return x.title.trim() ? `## ${x.title.trim()}\n${t}` : t;
    })
    .filter(Boolean)
    .join("\n\n");
}

interface Media { src: string; image: boolean; video: boolean; audio: boolean }

function CardMedia({ media }: { media: Media }) {
  const [broken, setBroken] = useState(false);
  const name = media.src.split(/[\\/]/).pop() ?? "";
  if (media.image) return <Thumb className="coll-thumb" src={media.src} />;
  if (media.video && !broken)
    return <video className="coll-thumb" src={assetUrl(media.src)} muted playsInline preload="metadata" onError={() => setBroken(true)} />;
  return (
    <span className={"coll-file" + (media.video ? " video" : "")}>
      <b>{media.video ? "▶" : "♪"}</b>
      <em>{name}</em>
    </span>
  );
}

/**
 * La vista previa de una colección: los PRIMEROS CUATRO archivos que tenga
 * adentro, en grilla. Con eso ya te das una idea; más sería ruido.
 */
const MOSAIC_MAX = 4;

function Mosaic({ pane }: { pane: Pane }) {
  const all: Media[] = [];
  const seen = new Set<string>();
  for (const b of boxesOf(pane)) {
    const m = firstMedia(b);
    if (m && !seen.has(m.src)) { seen.add(m.src); all.push(m); }
    if (all.length === MOSAIC_MAX) break;
  }
  if (!all.length) return null;
  if (all.length === 1) return <CardMedia media={all[0]} />;
  return (
    <span className={"coll-mosaic n" + all.length}>
      {all.map((m, i) => (
        <CardMedia key={m.src + i} media={m} />
      ))}
    </span>
  );
}

function firstMedia(p: Pane): Media | null {
  let fallback: Media | null = null;
  for (const raw of p.body.split("\n")) {
    const src = matchImage(raw.trim());
    if (!src) continue;
    const m = { src, image: !isVideoPath(src) && !isAudioPath(src), video: isVideoPath(src), audio: isAudioPath(src) };
    if (!m.audio) return m;
    fallback ??= m;
  }
  return fallback;
}

/** Lo que se lee en un cuadrado: su título, o su primer texto. */
export function paneLabel(p: Pane, i: number): string {
  if (p.title.trim()) return p.title.trim();
  for (const b of boxesOf(p))
    for (const raw of (b.title || b.body).split("\n")) {
      const l = raw.replace(/^\s*(#+\s*|[-*+]\s+(\[[ xX]\]\s*)?|\d+\.\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
      if (l && !/^!\[/.test(raw.trim()) && !/^```/.test(raw.trim())) return l.slice(0, 80);
    }
  return p.panes ? `Colección ${i + 1}` : `Recuadro ${i + 1}`;
}

export { openUrl };
