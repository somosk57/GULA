import { useState } from "react";
import { AppState, Project, uid } from "../types";
import { fmtDate } from "../ai";
import { openUrl } from "../backend";
import { closeSession, startSession, fmtMinutes } from "../session";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

/** Bitácora: una línea por avance, fecha automática. Para retomar y para contarle a la IA. */
export function LogPanel({ project, update }: Props) {
  const [text, setText] = useState("");

  const add = () => {
    const t = text.trim();
    if (!t) return;
    update((d) => {
      d.projects.find((p) => p.id === project.id)!.log.unshift({ id: uid(), at: Date.now(), text: t });
    });
    setText("");
  };

  const remove = (id: string) =>
    update((d) => {
      const p = d.projects.find((p) => p.id === project.id)!;
      p.log = p.log.filter((e) => e.id !== id);
    });

  const entries = [...project.log].sort((a, b) => b.at - a.at);
  let lastDay = "";

  return (
    <div className="log">
      <div className="panel-actions">
        {project.sessionStartedAt != null ? (
          <button className="chip session" onClick={() => closeSession(project, update)}>
            ● Cerrar sesión · {fmtMinutes(Math.max(1, Math.round((Date.now() - project.sessionStartedAt) / 60000)))}
          </button>
        ) : (
          <button className="chip primary" onClick={() => startSession(project, update)} title="Copia el paquete para la IA y empieza a contar el tiempo">▶ Empezar sesión</button>
        )}
        <span className="prompt-sub">{project.log.length} entrada{project.log.length === 1 ? "" : "s"}</span>
      </div>
      <div className="log-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="¿Qué hiciste? (Enter para guardar)"
          spellCheck={false}
        />
        <button className="chip" onClick={add} disabled={!text.trim()}>Anotar</button>
      </div>
      <div className="log-list">
        {entries.map((e) => {
          const day = fmtDate(e.at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={e.id} className="log-entry">
              <span className="log-day">{showDay ? day : ""}</span>
              <span className="log-text">
                {e.text}
                {e.minutes ? <span className="log-min"> · {fmtMinutes(e.minutes)}</span> : null}
                {e.link && (
                  <button className="log-link" onClick={() => openUrl(e.link!)} title={e.link}>↗ chat</button>
                )}
              </span>
              <button className="log-del" onClick={() => remove(e.id)} title="Borrar">×</button>
            </div>
          );
        })}
        {entries.length === 0 && (
          <div className="empty wide">
            Anotá cada avance en una línea: "armé el login", "falta el deploy". Sirve para retomar después y se incluye en "Copiar para la IA".
          </div>
        )}
      </div>
    </div>
  );
}
