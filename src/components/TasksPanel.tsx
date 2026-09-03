import { useState } from "react";
import { AppState, Project } from "../types";
import { collectTasks } from "../ai";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

/** Todas las `- [ ]` de todas las notas del proyecto, en un solo lugar. */
export function TasksPanel({ project, update }: Props) {
  const [showDone, setShowDone] = useState(false);
  const tasks = collectTasks(project);
  const pending = tasks.filter((t) => !t.done);
  const shown = showDone ? tasks : pending;

  const toggle = (noteId: string, line: number) =>
    update((d) => {
      const n = d.projects.find((p) => p.id === project.id)!.notes.find((n) => n.id === noteId)!;
      const lines = n.body.split("\n");
      lines[line] = lines[line].replace(/\[([ xX])\]/, (_, x) => (x === " " ? "[x]" : "[ ]"));
      n.body = lines.join("\n");
      n.updatedAt = Date.now();
    });

  const goTo = (noteId: string) =>
    update((d) => {
      d.activeNoteId[project.id] = noteId;
    });

  return (
    <div className="tasks">
      <div className="panel-actions">
        <span className="prompt-sub">
          {pending.length} pendiente{pending.length === 1 ? "" : "s"} · {tasks.length - pending.length} hecha{tasks.length - pending.length === 1 ? "" : "s"}
        </span>
        <button className={"chip add" + (showDone ? " ok" : "")} onClick={() => setShowDone((v) => !v)}>
          {showDone ? "Ocultar hechas" : "Ver hechas"}
        </button>
      </div>
      <div className="task-list">
        {shown.map((t) => (
          <div key={t.noteId + ":" + t.line} className={"task" + (t.done ? " done" : "")}>
            <input type="checkbox" checked={t.done} onChange={() => toggle(t.noteId, t.line)} />
            <span className="task-text">{t.text}</span>
            <button className="task-note" onClick={() => goTo(t.noteId)} title="Ir a la nota">
              # {t.noteTitle}
            </button>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="empty wide">
            {tasks.length === 0 ? "Escribí `- [ ] algo` en cualquier nota y aparece acá." : "Todo hecho. 🎉"}
          </div>
        )}
      </div>
    </div>
  );
}
