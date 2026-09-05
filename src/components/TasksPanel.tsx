import { useState } from "react";
import { AppState, Project, findPane, syncNote } from "../types";
import { collectTasks, toggleTaskInNote } from "../ai";
import { Located, goToPane, walkPanes } from "../navigate";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

/**
 * Las migajas del mapa: los recuadros marcados con el círculo, y las líneas
 * `- [ ]` que escribas a mano. De cada una se salta al lugar exacto.
 */
export function TasksPanel({ project, update }: Props) {
  const [showDone, setShowDone] = useState(false);

  const marked: Located[] = walkPanes(project).filter((x) => x.pane.todo !== undefined);
  const lines = collectTasks(project);

  const pendientes = marked.filter((x) => x.pane.todo).length + lines.filter((t) => !t.done).length;
  const hechas = marked.filter((x) => !x.pane.todo).length + lines.filter((t) => t.done).length;

  const togglePane = (paneId: string, noteId: string) =>
    update((d) => {
      const n = d.projects.find((p) => p.id === project.id)!.notes.find((x) => x.id === noteId)!;
      const p = findPane(n, paneId);
      if (p) p.todo = !p.todo;
      syncNote(n);
    });

  const toggleLine = (noteId: string, line: number) =>
    update((d) => {
      const n = d.projects.find((p) => p.id === project.id)!.notes.find((n) => n.id === noteId)!;
      toggleTaskInNote(n, line);
    });

  const go = (noteId: string, paneId?: string) => goToPane(update, { projectId: project.id, noteId, paneId });

  const rows = [
    ...marked.filter((x) => showDone || x.pane.todo).map((x) => ({ kind: "pane" as const, x })),
    ...lines.filter((t) => showDone || !t.done).map((t) => ({ kind: "line" as const, t })),
  ];

  return (
    <div className="tasks">
      <div className="panel-actions">
        <span className="prompt-sub">
          {pendientes} pendiente{pendientes === 1 ? "" : "s"} · {hechas} hecha{hechas === 1 ? "" : "s"}
        </span>
        <button className={"chip add" + (showDone ? " ok" : "")} onClick={() => setShowDone((v) => !v)}>
          {showDone ? "Ocultar hechas" : "Ver hechas"}
        </button>
      </div>
      <div className="task-list">
        {rows.map((row) =>
          row.kind === "pane" ? (
            <div key={row.x.paneId} className={"task" + (row.x.pane.todo ? "" : " done")}>
              <input
                type="checkbox"
                checked={!row.x.pane.todo}
                onChange={() => togglePane(row.x.paneId, row.x.noteId)}
                title={row.x.pane.todo ? "Marcar como hecho" : "Volver a dejarlo pendiente"}
              />
              <button className="task-text go" onClick={() => go(row.x.noteId, row.x.paneId)} title="Ir al recuadro">
                <span>{row.x.path.split(" › ").pop()}</span>
                <span className="task-path">{row.x.path.split(" › ").slice(0, -1).join(" › ")}</span>
              </button>
            </div>
          ) : (
            <div key={row.t.noteId + ":" + row.t.line} className={"task" + (row.t.done ? " done" : "")}>
              <input type="checkbox" checked={row.t.done} onChange={() => toggleLine(row.t.noteId, row.t.line)} />
              <button className="task-text go" onClick={() => go(row.t.noteId)} title="Ir a la nota">
                <span>{row.t.text}</span>
                <span className="task-path">{row.t.noteTitle}</span>
              </button>
            </div>
          ),
        )}
        {rows.length === 0 && (
          <div className="empty wide">
            {marked.length + lines.length === 0
              ? "Tocá el ○ de un recuadro para dejarlo pendiente: aparece acá con el camino para volver."
              : "Todo hecho. 🎉"}
          </div>
        )}
      </div>
    </div>
  );
}
