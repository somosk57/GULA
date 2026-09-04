/**
 * Atajos configurables. Cada acción tiene un combo por defecto; el usuario puede
 * cambiarlo desde el panel de atajos (Ctrl+/) y queda guardado en `state.keys`.
 */

export interface KeyAction {
  id: string;
  label: string;
  group: string;
  /** Combo por defecto. */
  def: string;
  /** No se puede cambiar (lo maneja el sistema o son varias teclas). */
  fixed?: boolean;
}

export const ACTIONS: KeyAction[] = [
  { id: "newNote", label: "Nota nueva", group: "Notas", def: "Ctrl+N" },
  { id: "preview", label: "Editar / vista", group: "Notas", def: "Ctrl+E" },
  { id: "collection", label: "Ver los recuadros como colección", group: "Notas", def: "Ctrl+G" },
  { id: "sidebar", label: "Mostrar u ocultar la barra de notas", group: "Notas", def: "Ctrl+B" },

  { id: "search", label: "Buscar en todo", group: "Proyectos", def: "Ctrl+K" },
  { id: "home", label: "Hoy: todos los proyectos", group: "Proyectos", def: "Ctrl+H" },
  { id: "prevProject", label: "Proyecto anterior", group: "Proyectos", def: "Ctrl+Shift+ArrowUp" },
  { id: "nextProject", label: "Proyecto siguiente", group: "Proyectos", def: "Ctrl+Shift+ArrowDown" },

  { id: "bottom", label: "Mostrar u ocultar el panel de abajo", group: "Panel de abajo", def: "Ctrl+J" },
  { id: "nextTab", label: "Pestaña siguiente", group: "Panel de abajo", def: "Ctrl+Tab" },
  { id: "pasteAs", label: "Pegar como…", group: "Panel de abajo", def: "Ctrl+Shift+V" },

  { id: "keys", label: "Este panel de atajos", group: "General", def: "Ctrl+/" },
  { id: "undo", label: "Deshacer", group: "General", def: "Ctrl+Z", fixed: true },
  { id: "redo", label: "Rehacer", group: "General", def: "Ctrl+Shift+Z", fixed: true },
];

const MOD_ORDER = ["Ctrl", "Alt", "Shift"];

/** "shift+ctrl+k" → "Ctrl+Shift+K" */
export function normalizeCombo(combo: string): string {
  const parts = combo.split("+").map((p) => p.trim()).filter(Boolean);
  const mods: string[] = [];
  let key = "";
  for (const p of parts) {
    const low = p.toLowerCase();
    if (low === "ctrl" || low === "control" || low === "cmd" || low === "meta" || low === "⌘") { if (!mods.includes("Ctrl")) mods.push("Ctrl"); }
    else if (low === "alt" || low === "option") { if (!mods.includes("Alt")) mods.push("Alt"); }
    else if (low === "shift") { if (!mods.includes("Shift")) mods.push("Shift"); }
    else key = normalizeKey(p);
  }
  mods.sort((a, b) => MOD_ORDER.indexOf(a) - MOD_ORDER.indexOf(b));
  return [...mods, key].filter(Boolean).join("+");
}

function normalizeKey(k: string): string {
  if (k === " " || /^space$/i.test(k)) return "Space";
  if (k.length === 1) return k.toUpperCase();
  const named: Record<string, string> = {
    arrowup: "ArrowUp", arrowdown: "ArrowDown", arrowleft: "ArrowLeft", arrowright: "ArrowRight",
    tab: "Tab", enter: "Enter", escape: "Escape", backspace: "Backspace", delete: "Delete",
    home: "Home", end: "End", pageup: "PageUp", pagedown: "PageDown",
  };
  return named[k.toLowerCase()] ?? k;
}

/** El combo que representa un evento de teclado. Meta (⌘) cuenta como Ctrl. */
export function comboFromEvent(e: KeyboardEvent): string {
  const k = e.key;
  if (["Control", "Meta", "Alt", "Shift"].includes(k)) return "";
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  return [...mods, normalizeKey(k)].join("+");
}

/** Combo configurado para una acción (o el por defecto). */
export function comboFor(keys: Record<string, string> | undefined, id: string): string {
  const a = ACTIONS.find((x) => x.id === id);
  return normalizeCombo(keys?.[id] || a?.def || "");
}

/** Cómo se muestra: en Mac, Ctrl se ve ⌘. */
export function prettyCombo(combo: string, isMac: boolean): string {
  if (!combo) return "—";
  let c = combo.replace(/ArrowUp/g, "↑").replace(/ArrowDown/g, "↓").replace(/ArrowLeft/g, "←").replace(/ArrowRight/g, "→");
  if (isMac) c = c.replace(/Ctrl\+/g, "⌘").replace(/Alt\+/g, "⌥").replace(/Shift\+/g, "⇧");
  return c;
}

/** Un combo sin modificadores (o solo Shift) se comería lo que escribís. */
export function comboIsSafe(combo: string): boolean {
  return /^(Ctrl|Alt)\+/.test(combo) && combo.split("+").length >= 2;
}
