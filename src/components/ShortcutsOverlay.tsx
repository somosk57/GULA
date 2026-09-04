import { useEffect } from "react";
import { IS_MAC } from "./TitleBar";

const mod = IS_MAC ? "⌘" : "Ctrl+";

const GROUPS: [string, [string, string][]][] = [
  ["Notas", [
    [`${mod}N`, "nota nueva (hereda los recuadros de la última)"],
    [`${mod}E`, "editar / vista"],
    [`${mod}B`, "mostrar u ocultar la barra izquierda"],
    [`${mod}Enter`, "marcar / desmarcar la tarea de la línea"],
    [`${mod}B / ${mod}I`, "negrita / cursiva"],
    ["Clic derecho en una nota", "marcar (azul/verde/amarillo/rojo), fijar, mover, duplicar"],
    ["Puntos bajo el filtro", "ocultar las notas de ese color"],
  ]],
  ["Proyectos", [
    [`${mod}Shift+1…9`, "ir al proyecto N (la columna de la izquierda)"],
    [`${mod}Shift+↑ / ↓`, "proyecto anterior / siguiente"],
    [`${mod}H`, "Hoy: todos los proyectos"],
    [`${mod}K`, "buscar en todo"],
  ]],
  ["Panel de abajo", [
    [`${mod}1…6`, "Accesos · Galería · Prompts · Contexto · Fichas · Tareas"],
    [`${mod}Tab`, "siguiente pestaña"],
    [`${mod}Shift+V`, "pegar como… (nota, bloque, prompt, comando, línea del día, repartir)"],
  ]],
  ["Galería (vista grande)", [
    ["← →", "pasar"],
    ["1 2 3 4", "marcar azul / verde / amarillo / rojo · 0 quita"],
    ["N", "nueva entrada con este archivo"],
    ["Enter", "abrir el archivo · Esc cierra"],
    ["Arrastrar una casilla", "a un recuadro de la nota o a una nota de la barra"],
  ]],
  ["General", [
    [`${mod}Z / ${mod}Shift+Z`, "deshacer / rehacer"],
    [`${mod}/`, "esta ayuda"],
    ["Atajo global", "mostrar u ocultar GULA desde cualquier lado (se cambia en ⋯)"],
  ]],
];

export function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="dlg-backdrop home-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="home keys">
        <div className="home-head">
          <span className="home-h">Atajos</span>
          <span className="prompt-sub">Esc para cerrar</span>
        </div>
        <div className="keys-grid">
          {GROUPS.map(([title, rows]) => (
            <div key={title} className="keys-group">
              <div className="group-name">{title}</div>
              {rows.map(([k, what]) => (
                <div key={k} className="keys-row"><kbd>{k}</kbd><span>{what}</span></div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
