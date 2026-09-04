import { useEffect, useState } from "react";
import { IS_MAC } from "./TitleBar";
import { ACTIONS, comboFor, comboFromEvent, comboIsSafe, prettyCombo } from "../keys";
import { AppState } from "../types";

const mod = IS_MAC ? "⌘" : "Ctrl+";

/** Cosas que no son teclas configurables, pero conviene tener a mano. */
const NOTES: [string, string][] = [
  [`${mod}1…6`, "ir a una pestaña del panel de abajo"],
  [`${mod}Shift+1…9`, "ir al proyecto N"],
  [`${mod}Enter`, "marcar / desmarcar la tarea de la línea"],
  [`${mod}B / ${mod}I`, "negrita / cursiva (dentro del texto)"],
  ["Clic derecho en una nota", "marcar de color, fijar, mover, duplicar"],
  ["Esc", "salir de una colección y volver a la lista de colecciones"],
  ["Clic derecho en un recuadro", "copiar, duplicar, renombrar, color, sacar"],
  ["Arrastrar desde el borde de un recuadro", "reordenar"],
  ["− del recuadro", "sacarlo"],
  ["Clic derecho en una pestaña", "ocultarla (vuelve desde el menú ⋯)"],
  ["Galería: ← → · 1 2 3 4 · 0 · N · Enter", "pasar · marcar · quitar marca · nueva entrada · abrir"],
];

interface Props {
  state: AppState;
  update: (fn: (d: AppState) => void) => void;
  onClose: () => void;
}

export function ShortcutsOverlay({ state, update, onClose }: Props) {
  const [rec, setRec] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const keys = state.keys;

  // Mientras se graba, el teclado es del panel; si no, Esc cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!rec) {
        if (e.key === "Escape") onClose();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setRec(null); setErr(""); return; }
      const c = comboFromEvent(e);
      if (!c) return; // todavía solo modificadores
      if (!comboIsSafe(c)) { setErr("Usá al menos Ctrl o Alt, si no te come lo que escribís."); return; }
      const clash = ACTIONS.find((a) => a.id !== rec && comboFor(keys, a.id) === c);
      if (clash) { setErr(`Ya lo usa: ${clash.label}.`); return; }
      update((d) => { d.keys = { ...(d.keys ?? {}), [rec]: c }; });
      setRec(null);
      setErr("");
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [rec, onClose, keys, update]);

  const groups = [...new Set(ACTIONS.map((a) => a.group))];

  return (
    <div className="dlg-backdrop home-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !rec && onClose()}>
      <div className="home keys">
        <div className="home-head">
          <span className="home-h">Atajos</span>
          <span className="prompt-sub">
            {rec ? err || "Presioná la combinación… (Esc cancela)" : "Clic en una tecla para cambiarla · Esc cierra"}
          </span>
          <button
            className="chip"
            onClick={() => update((d) => (d.keys = {}))}
            title="Volver a los atajos de fábrica"
          >
            Restablecer
          </button>
        </div>
        <div className="keys-grid">
          {groups.map((g) => (
            <div key={g} className="keys-group">
              <div className="group-name">{g}</div>
              {ACTIONS.filter((a) => a.group === g).map((a) => {
                const combo = comboFor(keys, a.id);
                const custom = !!keys?.[a.id];
                return (
                  <div key={a.id} className="keys-row">
                    <kbd
                      className={"key-set" + (rec === a.id ? " rec" : "") + (a.fixed ? " fixed" : "")}
                      onClick={() => { if (!a.fixed) { setErr(""); setRec(a.id); } }}
                      title={a.fixed ? "Este no se cambia" : "Clic para cambiar"}
                    >
                      {rec === a.id ? "…" : prettyCombo(combo, IS_MAC)}
                    </kbd>
                    <span>
                      {a.label}
                      {custom && (
                        <button
                          className="key-reset"
                          title="Volver al de fábrica"
                          onClick={() => update((d) => { const k = { ...(d.keys ?? {}) }; delete k[a.id]; d.keys = k; })}
                        >
                          ↺
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          <div className="keys-group">
            <div className="group-name">Con el mouse y otras</div>
            {NOTES.map(([k, what]) => (
              <div key={k} className="keys-row"><kbd>{k}</kbd><span>{what}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
