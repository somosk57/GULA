import { useEffect, useState } from "react";
import { AppState, Project } from "../types";
import { goToPane, walkPanes } from "../navigate";
import { copyText } from "../backend";

const EVENT = "gula:ver-etiqueta";

/** Abre la vista de una etiqueta desde cualquier menú. */
export const openLabelView = (label: string) => window.dispatchEvent(new CustomEvent(EVENT, { detail: label }));

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

/**
 * El mapa cortado de costado: todos los recuadros que llevan una etiqueta,
 * estén en la colección que estén. No hay que recordar dónde se guardó algo,
 * solo qué era.
 */
export function LabelView({ project, update }: Props) {
  const [label, setLabel] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => setLabel((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!label) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setLabel(null); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [label]);

  if (!label) return null;
  const rows = walkPanes(project).filter((x) => x.pane.title.trim().toLowerCase() === label.toLowerCase());

  const copy = async (id: string, text: string) => {
    await copyText(text.trim());
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
  };

  return (
    <div className="dlg-backdrop home-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setLabel(null)}>
      <div className="home keys">
        <div className="home-head">
          <span className="home-h">{label}</span>
          <span className="prompt-sub">
            {rows.length} recuadro{rows.length === 1 ? "" : "s"} en todo el proyecto · Esc cierra
          </span>
        </div>
        <div className="label-list">
          {rows.map((r) => (
            <div key={r.paneId} className="label-row">
              <button
                className="label-go"
                onClick={() => { goToPane(update, { projectId: r.projectId, noteId: r.noteId, paneId: r.paneId }); setLabel(null); }}
                title="Ir al recuadro"
              >
                <span className="label-path">{r.path.split(" › ").slice(0, -1).join(" › ")}</span>
                <span className="label-text">{r.pane.body.trim().replace(/\s+/g, " ").slice(0, 160) || "(vacío)"}</span>
              </button>
              {r.pane.body.trim() && (
                <button className={"chip" + (copied === r.paneId ? " ok" : "")} onClick={() => copy(r.paneId, r.pane.body)}>
                  {copied === r.paneId ? "Copiado ✓" : "Copiar"}
                </button>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <div className="empty wide">Ningún recuadro se llama “{label}” todavía. Ponés el título con el clic derecho → Etiquetas.</div>
          )}
        </div>
      </div>
    </div>
  );
}
