import { useState } from "react";
import { AppState, Pane, Project, STAGES, findPane } from "../types";
import { collectMedia } from "./GalleryPanel";
import { assetUrl } from "../backend";
import { collectTasks } from "../ai";
import { goToPane } from "../navigate";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { projectMenuItems } from "./TitleBar";

interface Props {
  state: AppState;
  update: (fn: (d: AppState) => void) => void;
  onAdd: () => void;
}

const srcOf = (s: string) => (/^(https?:|data:)/i.test(s) ? s : assetUrl(s));

/** Columna de proyectos (como los servidores de Discord): un clic y estás en otro proyecto. */
export function ProjectRail({ state, update, onAdd }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  return (
    <nav className="rail" aria-label="Proyectos">
      {state.projects.map((p, i) => (
        <RailItem
          key={p.id}
          p={p}
          index={i}
          active={p.id === state.activeProjectId}
          onClick={() => update((d) => (d.activeProjectId = p.id))}
          onMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, items: projectMenuItems(p, state, update) });
          }}
        />
      ))}
      <button className="rail-item add" onClick={onAdd} title="Nuevo proyecto">+</button>
      <Pins state={state} update={update} />
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </nav>
  );
}

function RailItem({ p, index, active, onClick, onMenu }: { p: Project; index: number; active: boolean; onClick: () => void; onMenu: (e: React.MouseEvent) => void }) {
  const thumb = collectMedia(p).find((m) => m.kind === "image" && (p.marks[m.src] === "master"))?.src ?? collectMedia(p).find((m) => m.kind === "image")?.src ?? null;
  const pending = collectTasks(p).filter((t) => !t.done).length;
  const initials = p.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <button
      className={"rail-item" + (active ? " active" : "") + " " + p.stage}
      onClick={onClick}
      onContextMenu={onMenu}
      title={`${p.name} · ${STAGES.find((s) => s.id === p.stage)?.label}${p.now ? `\n${p.now}` : ""}${index < 9 ? `\nCtrl+Shift+${index + 1}` : ""}\nClic derecho: renombrar, exportar, eliminar`}
    >
      {thumb ? <img src={srcOf(thumb)} alt="" draggable={false} /> : <span>{initials}</span>}
      {p.sessionStartedAt && <span className="rail-dot" />}
      {pending > 0 && <span className="rail-badge">{pending > 9 ? "9+" : pending}</span>}
    </button>
  );
}

/**
 * Lo fijado: colecciones a las que volvés seguido, sin importar a qué
 * profundidad vivan. Van más chicas que los proyectos: ya sabés qué son.
 */
function Pins({ state, update }: { state: AppState; update: (fn: (d: AppState) => void) => void }) {
  const p = state.projects.find((x) => x.id === state.activeProjectId);
  const pins = (p?.pins ?? [])
    .map((id) => {
      for (const n of p!.notes) {
        if (n.id === id) return { id, name: n.title, pane: n as unknown as Pane, noteId: n.id };
        const found = findPane(n, id);
        if (found) return { id, name: found.title, pane: found, noteId: n.id };
      }
      return null;
    })
    .filter(Boolean) as { id: string; name: string; pane: Pane; noteId: string }[];
  if (!p || !pins.length) return null;

  const unpin = (id: string) =>
    update((d) => {
      const pr = d.projects.find((x) => x.id === p.id)!;
      pr.pins = (pr.pins ?? []).filter((x) => x !== id);
    });

  return (
    <>
      <div className="rail-sep" />
      {pins.map((x) => {
        const thumb = collectMedia(p).find((m) => paneHas(x.pane, m.src))?.src ?? null;
        const initials = (x.name || "··").slice(0, 2).toUpperCase();
        return (
          <button
            key={x.id}
            className="rail-item pin"
            onClick={() => goToPane(update, { projectId: p.id, noteId: x.noteId, paneId: x.id })}
            onContextMenu={(e) => { e.preventDefault(); unpin(x.id); }}
            title={`${x.name || "Sin nombre"}\nClic: ir · clic derecho: dejar de fijar`}
          >
            {thumb ? <img src={srcOf(thumb)} alt="" draggable={false} /> : <span>{initials}</span>}
          </button>
        );
      })}
    </>
  );
}

/** ¿Este archivo está adentro de este cuadrado (a cualquier profundidad)? */
function paneHas(p: Pane, src: string): boolean {
  if (p.panes) return p.panes.some((x) => paneHas(x, src));
  return p.body.includes(src);
}
