import { useState } from "react";
import { ask, confirmDlg, pick } from "../dialog";
import { useReorder } from "../reorder";
import { AppState, DEFAULT_GROUP, MARKS, MARK_ORDER, Mark, Note, Project, STAGES, markColor, newNote, noteMark, uid } from "../types";
import { fmtAgo } from "../ai";
import { assetUrl, isAudioPath, isVideoPath } from "../backend";
import { matchImage } from "./MarkdownEditor";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface Props {
  state: AppState;
  project: Project;
  update: (fn: (d: AppState) => void) => void;
  search: string;
  onSearch: (s: string) => void;
}

/** "14:42" hoy, "Ayer", o "20 may". */
function when(t: number) {
  const d = new Date(t);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" }).replace(".", "");
}

/** Qué contiene la nota: primera imagen (para miniatura) y tipos de medios. */
function mediaOf(n: Note, marks: Record<string, Mark>) {
  let thumb: string | null = null;
  let video = false, audio = false, image = false;
  let best: Mark | null = null;
  for (const p of n.panes) {
    for (const line of p.body.split("\n")) {
      const src = matchImage(line);
      if (!src) continue;
      const m = marks[src];
      if (m && (best === null || MARK_ORDER.indexOf(m) < MARK_ORDER.indexOf(best))) best = m;
      if (isVideoPath(src)) video = true;
      else if (isAudioPath(src)) audio = true;
      else { image = true; if (!thumb || m === "master") thumb = src; }
    }
  }
  return { thumb, video, audio, image, best };
}

function thumbSrc(src: string) {
  return /^(https?:|data:)/i.test(src) ? src : assetUrl(src);
}

export function Sidebar({ state, project, update, search, onSearch }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const activeNoteId = state.activeNoteId[project.id];
  const q = search.trim().toLowerCase();
  const hide = project.hideMarks ?? [];
  const effMark = (n: Note) => noteMark(n, project.marks);
  const hiddenCount = project.notes.filter((n) => { const m = effMark(n); return m && hide.includes(m); }).length;
  const visible = project.notes.filter((n) => {
    const m = effMark(n);
    if (m && hide.includes(m) && n.id !== activeNoteId) return false;
    return !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q);
  });

  // Secciones en orden de aparición; fijadas primero dentro de cada una.
  const groups: string[] = [];
  for (const n of project.notes) if (!groups.includes(n.group)) groups.push(n.group);
  const byDate = state.noteSort === "date";
  const byGroup = (g: string) =>
    visible
      .filter((n) => n.group === g)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (byDate ? b.createdAt - a.createdAt : 0));

  const edit = (fn: (p: Project, d: AppState) => void) =>
    update((d) => fn(d.projects.find((p) => p.id === project.id)!, d));

  const selectNote = (id: string) => edit((_, d) => (d.activeNoteId[project.id] = id));

  /** Nota nueva en una sección: hereda los recuadros (cantidad y títulos) de la última nota de esa sección. */
  const addNote = (group = DEFAULT_GROUP, from?: Note, view?: "cols" | "grid") =>
    edit((p, d) => {
      const n = newNote("Nueva nota", "", group);
      const lastIdx = p.notes.map((x) => x.group).lastIndexOf(group);
      const template = from ?? (lastIdx >= 0 ? p.notes[lastIdx] : undefined);
      if (template && template.panes.length > 1) {
        n.panes = template.panes.map((x) => ({ id: uid(), title: x.title, body: "" }));
      }
      n.view = view ?? template?.view ?? "grid";
      p.notes.splice(lastIdx < 0 ? p.notes.length : lastIdx + 1, 0, n);
      d.activeNoteId[p.id] = n.id;
    });

  /** Nota nueva preguntando primero qué tipo de nota es. */
  const newNoteAsking = async (group = DEFAULT_GROUP) => {
    const kind = await pick("¿Qué tipo de nota?", [
      { id: "grid", label: "Colección", hint: "cuadrados con solo el título: prompts, escenas, ideas, tomas… todos los que quieras" },
      { id: "cols", label: "Recuadros", hint: "mesa de trabajo: 2, 3, 4 o 6 recuadros a la vista" },
    ]);
    if (!kind) return;
    addNote(group, undefined, kind as "cols" | "grid");
  };

  const notesRef = useReorder<HTMLDivElement>({
    item: ".note-item",
    onDrop: (dragId, overId, before) =>
      edit((p) => {
        const from = p.notes.findIndex((n) => n.id === dragId);
        if (from < 0) return;
        const [n] = p.notes.splice(from, 1);
        const overIdx = p.notes.findIndex((x) => x.id === overId);
        if (overIdx < 0) { p.notes.push(n); return; }
        n.group = p.notes[overIdx].group;
        p.notes.splice(before ? overIdx : overIdx + 1, 0, n);
      }),
  });

  const addGroup = async () => {
    const name = await ask("Nueva sección", "", { placeholder: "Ej: Ideas futuras" });
    if (name?.trim()) newNoteAsking(name.trim());
  };

  const noteMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    const note = project.notes.find((n) => n.id === noteId)!;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...MARKS.map((mk) => ({
          label: mk.short + (note.mark === mk.id ? " ✓" : ""),
          color: mk.color,
          onClick: () => edit((p) => { const n = p.notes.find((n) => n.id === noteId)!; n.mark = n.mark === mk.id ? undefined : mk.id; }),
        })),
        ...(note.mark ? [{ label: "Sin marca", onClick: () => edit((p) => { const n = p.notes.find((n) => n.id === noteId)!; delete n.mark; }) }] : []),
        {
          separator: true,
          label: note.pinned ? "Desfijar" : "Fijar arriba",
          onClick: () => edit((p) => { const n = p.notes.find((n) => n.id === noteId)!; n.pinned = !n.pinned; }),
        },
        {
          label: "Renombrar",
          onClick: async () => {
            const t = await ask("Nombre de la nota", note.title);
            if (t?.trim()) edit((p) => { const x = p.notes.find((n) => n.id === noteId)!; x.title = t.trim(); x.autoTitle = false; });
          },
        },
        {
          label: "Mover a sección…",
          onClick: async () => {
            const t = await ask("Mover a sección", note.group, { placeholder: groups.join(" · ") });
            if (t?.trim())
              edit((p) => {
                const i = p.notes.findIndex((n) => n.id === noteId);
                const [n] = p.notes.splice(i, 1);
                n.group = t.trim();
                const lastIdx = p.notes.map((x) => x.group).lastIndexOf(n.group);
                p.notes.splice(lastIdx < 0 ? p.notes.length : lastIdx + 1, 0, n);
              });
          },
        },
        {
          label: "Nueva a partir de esta (mismos recuadros, vacíos)",
          onClick: () => addNote(note.group, note),
        },
        {
          label: "Duplicar",
          onClick: () =>
            edit((p, d) => {
              const n = newNote(note.title + " (copia)", note.body, note.group);
              p.notes.splice(p.notes.findIndex((x) => x.id === noteId) + 1, 0, n);
              d.activeNoteId[p.id] = n.id;
            }),
        },
        {
          label: "Eliminar",
          danger: true,
          separator: true,
          onClick: async () => {
            if (!(await confirmDlg(`¿Eliminar "${note.title}"?`, "No se puede deshacer desde acá, pero Ctrl+Z lo recupera.", { danger: true, okLabel: "Eliminar" }))) return;
            edit((p, d) => {
              p.notes = p.notes.filter((n) => n.id !== noteId);
              if (p.notes.length === 0) p.notes.push(newNote());
              if (d.activeNoteId[p.id] === noteId) d.activeNoteId[p.id] = p.notes[0].id;
            });
          },
        },
      ],
    });
  };

  const groupMenu = (e: React.MouseEvent, g: string) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Nueva nota acá", onClick: () => newNoteAsking(g) },
        {
          label: "Renombrar sección",
          onClick: async () => {
            const t = await ask("Nombre de la sección", g);
            if (t?.trim()) edit((p) => p.notes.forEach((n) => n.group === g && (n.group = t.trim())));
          },
        },
        {
          label: "Subir sección",
          onClick: () =>
            edit((p) => {
              const i = groups.indexOf(g);
              if (i <= 0) return;
              const order = [...groups];
              [order[i - 1], order[i]] = [order[i], order[i - 1]];
              p.notes.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
            }),
        },
      ],
    });
  };

  return (
    <aside className="sidebar">
      <div className="stage-box">
        <button
          className={"stage " + project.stage}
          title="Etapa del proyecto (clic para cambiar)"
          onClick={() =>
            edit((p) => {
              const i = STAGES.findIndex((s) => s.id === p.stage);
              p.stage = STAGES[(i + 1) % STAGES.length].id;
            })
          }
        >
          {STAGES.find((s) => s.id === project.stage)?.label}
        </button>
        <input
          className="now-line"
          value={project.now}
          onChange={(e) => edit((p) => { p.now = e.target.value; p.nowAt = Date.now(); })}
          placeholder="Ahora estoy en…"
          spellCheck={false}
          title={"¿En qué paso estoy? Una línea, para cuando vuelvas en una semana." + (project.nowAt ? `\nEscrito ${fmtAgo(project.nowAt)}.` : "")}
        />
      </div>
      {project.now && project.nowAt && <div className={"now-age" + (Date.now() - project.nowAt > 7 * 86_400_000 ? " stale" : "")} title="Cuándo escribiste 'ahora estoy en…'">escrito {fmtAgo(project.nowAt)}</div>}
      <div className="filter-row">
        <input
          className="search"
          placeholder="Filtrar notas…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          id="search-box"
        />
        <button
          className={"sort-btn" + (byDate ? " on" : "")}
          title={byDate ? "Orden: por fecha (más nuevas arriba). Clic: manual" : "Orden: manual (arrastrar). Clic: por fecha"}
          onClick={() => update((d) => (d.noteSort = d.noteSort === "date" ? "manual" : "date"))}
        >
          {byDate ? "⇅" : "☰"}
        </button>
      </div>
      <div className="hide-row">
        {MARKS.map((mk) => {
          const off = hide.includes(mk.id);
          return (
            <button
              key={mk.id}
              className={"hide-dot" + (off ? " off" : "")}
              style={{ ["--c" as string]: mk.color }}
              title={(off ? "Mostrar " : "Ocultar ") + mk.short.toLowerCase()}
              onClick={() => edit((p) => { p.hideMarks = off ? (p.hideMarks ?? []).filter((x) => x !== mk.id) : [...(p.hideMarks ?? []), mk.id]; })}
            />
          );
        })}
        {hiddenCount > 0 && <span className="hide-count">{hiddenCount} oculta{hiddenCount === 1 ? "" : "s"}</span>}
      </div>

      <div className="notes" ref={notesRef}>
        {groups.map((g) => {
          const items = byGroup(g);
          if (q && items.length === 0) return null;
          const isCollapsed = collapsed[g] && !q;
          return (
            <div key={g} className="group">
              <div className="group-head" onContextMenu={(e) => groupMenu(e, g)}>
                <button
                  className="group-name"
                  onClick={() => setCollapsed((c) => ({ ...c, [g]: !c[g] }))}
                  title="Clic: plegar · clic derecho: opciones"
                >
                  {g}
                </button>
                <button className="group-add" onClick={() => newNoteAsking(g)} title="Nueva nota en esta sección">+</button>
              </div>
              {!isCollapsed &&
                items.map((n) => {
                  const m = mediaOf(n, project.marks);
                  const nm = n.mark ?? m.best;
                  return (
                    <button
                      key={n.id}
                      data-id={n.id}
                      className={"note-item" + (n.id === activeNoteId ? " active" : "") + (m.thumb ? " has-thumb" : "")}
                      onClick={() => selectNote(n.id)}
                      onDoubleClick={async () => {
                        const t = await ask("Nombre de la nota", n.title);
                        if (t?.trim()) edit((p) => { const x = p.notes.find((y) => y.id === n.id)!; x.title = t.trim(); x.autoTitle = false; });
                      }}
                      onContextMenu={(e) => noteMenu(e, n.id)}
                      title={n.title}
                    >
                      {m.thumb ? (
                        <img className="thumb" src={thumbSrc(m.thumb)} alt="" draggable={false} />
                      ) : (
                        <span className="hash">{n.pinned ? "★" : "#"}</span>
                      )}
                      <span className="label">{n.title}</span>
                      <span className="kinds">
                        {nm && <span className={"note-mark" + (n.mark ? " own" : "")} style={{ background: markColor(nm)! }} title={MARKS.find((x) => x.id === nm)?.short} />}
                        {m.video && <span title="video">▶</span>}
                        {m.audio && <span title="audio">♪</span>}
                        {m.image && !m.thumb && <span title="imagen">▣</span>}
                        {n.panes.length > 1 && <span className="cols" title={`${n.panes.length} recuadros`}>{n.panes.length}</span>}
                      </span>
                      <span className="when">{when(byDate ? n.createdAt : n.updatedAt)}</span>
                    </button>
                  );
                })}
            </div>
          );
        })}
        {q && visible.length === 0 && <div className="empty">Sin resultados</div>}
      </div>

      <div className="sidebar-foot">
        <button className="add-note" onClick={() => newNoteAsking()} title="Nueva nota (Ctrl+N crea una directo)">+ Nota</button>
        <button className="add-note" onClick={addGroup} title="Nueva sección">+ Sección</button>
      </div>

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
