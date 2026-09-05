import { useState } from "react";
import { AppState, Project, STAGES } from "../types";
import { fmtAgo } from "../ai";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { labelMenuItems, viewMenuItems } from "../menus";

interface Props {
  state: AppState;
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

/**
 * Lo único que queda a la izquierda: en qué andás, las etiquetas y qué se ve.
 * La lista de notas se fue: ahora todo el proyecto es el mapa de cuadrados.
 */
export function Sidebar({ state, project, update }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const edit = (fn: (p: Project) => void) => update((d) => fn(d.projects.find((p) => p.id === project.id)!));
  const labels = project.labels ?? [];

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
      </div>

      <textarea
        className="now-line big"
        value={project.now}
        onChange={(e) => edit((p) => { p.now = e.target.value; p.nowAt = Date.now(); })}
        placeholder={"Idea…\n\n¿En qué andás? Una línea para cuando vuelvas."}
        spellCheck={false}
      />
      {project.now && project.nowAt && (
        <div className={"now-age" + (Date.now() - project.nowAt > 7 * 86_400_000 ? " stale" : "")}>escrito {fmtAgo(project.nowAt)}</div>
      )}

      <div className="sidebar-foot tools">
        <button
          className="foot-btn"
          title="Los títulos que usás siempre. Se ponen con el clic derecho en un cuadrado; acá se administran y se ven todos juntos."
          onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, items: labelMenuItems(labels, update, project.id) })}
        >
          Etiquetas{labels.length > 0 && <span className="count">{labels.length}</span>}
        </button>
        <button
          className="foot-btn"
          title="Qué se ve y qué no: tema, columna de proyectos, panel de abajo y pestañas"
          onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, items: viewMenuItems(state, update) })}
        >
          Ver…
        </button>
      </div>

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </aside>
  );
}
