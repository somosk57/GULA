import { useState } from "react";
import { ask, confirmDlg } from "../dialog";
import { useReorder } from "../reorder";
import { AppState, DEFAULT_GROUP, Project, newNote } from "../types";
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

export function Sidebar({ state, project, update, search, onSearch }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const activeNoteId = state.activeNoteId[project.id];
  const q = search.trim().toLowerCase();
  const visible = project.notes.filter(
    (n) => !q || n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
  );

  // Secciones en orden de aparición; fijadas primero dentro de cada una.
  const groups: string[] = [];
  for (const n of project.notes) if (!groups.includes(n.group)) groups.push(n.group);
  const byGroup = (g: string) =>
    visible.filter((n) => n.group === g).sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const edit = (fn: (p: Project, d: AppState) => void) =>
    update((d) => fn(d.projects.find((p) => p.id === project.id)!, d));

  const selectNote = (id: string) => edit((_, d) => (d.activeNoteId[project.id] = id));

  const addNote = (group = DEFAULT_GROUP) =>
    edit((p, d) => {
      const n = newNote("Nueva nota", "", group);
      // Insertar al final de su sección para que quede agrupada.
      const lastIdx = p.notes.map((x) => x.group).lastIndexOf(group);
      p.notes.splice(lastIdx < 0 ? p.notes.length : lastIdx + 1, 0, n);
      d.activeNoteId[p.id] = n.id;
    });

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
    if (name?.trim()) addNote(name.trim());
  };

  const noteMenu = (e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    const note = project.notes.find((n) => n.id === noteId)!;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: note.pinned ? "Desfijar" : "Fijar arriba",
          onClick: () => edit((p) => { const n = p.notes.find((n) => n.id === noteId)!; n.pinned = !n.pinned; }),
        },
        {
          label: "Renombrar",
          onClick: async () => {
            const t = await ask("Nombre de la nota", note.title);
            if (t?.trim()) edit((p) => (p.notes.find((n) => n.id === noteId)!.title = t.trim()));
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
        { label: "Nueva nota acá", onClick: () => addNote(g) },
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
      <input
        className="search"
        placeholder="Filtrar notas de este proyecto…"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        id="search-box"
      />

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
                <button className="group-add" onClick={() => addNote(g)} title="Nueva nota en esta sección">+</button>
              </div>
              {!isCollapsed &&
                items.map((n) => (
                  <button
                    key={n.id}
                    data-id={n.id}
                    className={"note-item" + (n.id === activeNoteId ? " active" : "")}
                    onClick={() => selectNote(n.id)}
                    onContextMenu={(e) => noteMenu(e, n.id)}
                    title={n.title}
                  >
                    <span className="hash">{n.pinned ? "★" : "#"}</span>
                    <span className="label">{n.title}</span>
                    <span className="when">{when(n.updatedAt)}</span>
                  </button>
                ))}
            </div>
          );
        })}
        {q && visible.length === 0 && <div className="empty">Sin resultados</div>}
      </div>

      <div className="sidebar-foot">
        <button className="add-note" onClick={() => addNote()} title="Nueva nota (Ctrl+N)">+ Nota</button>
        <button className="add-note" onClick={addGroup} title="Nueva sección">+ Sección</button>
      </div>

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
