// Menús que se usan desde más de un lado: lo que se ve y lo que no, y las etiquetas.
import { AppState, TABS } from "./types";
import { MenuItem } from "./components/ContextMenu";
import { ask, confirmDlg, pick } from "./dialog";
import { openLabelView } from "./components/LabelView";

type Update = (fn: (d: AppState) => void) => void;

const check = (on: boolean) => (on ? "✓" : "○");

/** Todo lo de "ver / no ver": tema, columnas, panel de abajo y pestañas. */
export function viewMenuItems(state: AppState, update: Update): MenuItem[] {
  const hidden = state.hiddenTabs ?? [];
  const t = state.theme;
  return [
    {
      label: `Tema: ${t === "dark" ? "oscuro" : t === "light" ? "claro" : "sistema"}`,
      onClick: () => update((d) => (d.theme = d.theme === "dark" ? "light" : d.theme === "light" ? "system" : "dark")),
    },
    {
      label: `${check(state.rail !== false)}  Columna de proyectos`,
      separator: true,
      onClick: () => update((d) => (d.rail = d.rail === false)),
    },
    {
      label: `${check(state.sidebarMin !== true)}  Barra de la izquierda abierta`,
      onClick: () => update((d) => (d.sidebarMin = d.sidebarMin !== true)),
    },
    {
      label: `${check(state.bottomOpen !== false)}  Panel de abajo`,
      onClick: () => update((d) => (d.bottomOpen = d.bottomOpen === false)),
    },
    ...TABS.map((tab, i) => ({
      label: `${check(!hidden.includes(tab.id))}      ${tab.label}`,
      separator: i === 0,
      onClick: () =>
        update((d) => {
          const h = d.hiddenTabs ?? [];
          d.hiddenTabs = h.includes(tab.id) ? h.filter((x) => x !== tab.id) : [...h, tab.id];
        }),
    })),
    {
      label: `${check(state.showCommands !== false)}      Comandos (dentro de Accesos)`,
      onClick: () => update((d) => (d.showCommands = d.showCommands === false)),
    },
  ];
}

/**
 * Las etiquetas del proyecto: los títulos que usás siempre en los recuadros.
 * Acá se administran; se ponen con el clic derecho en un recuadro.
 */
export function labelMenuItems(labels: string[], update: Update, projectId: string): MenuItem[] {
  const setLabels = (fn: (l: string[]) => string[]) =>
    update((d) => {
      const p = d.projects.find((x) => x.id === projectId)!;
      p.labels = fn(p.labels ?? []);
    });

  /** Renombrar una etiqueta la cambia también en los recuadros que la tienen. */
  const rename = async (t: string) => {
    const v = (await ask("Nombre de la etiqueta", t))?.trim();
    if (!v || v === t) return;
    update((d) => {
      const p = d.projects.find((x) => x.id === projectId)!;
      p.labels = (p.labels ?? []).map((x) => (x === t ? v : x));
      for (const n of p.notes)
        for (const pane of n.panes) {
          if (pane.title.trim() === t) pane.title = v;
          for (const b of pane.panes ?? []) if (b.title.trim() === t) b.title = v;
        }
    });
  };

  return [
    ...labels.map((t) => ({
      label: t,
      onClick: () => {},
      items: [
        { label: "Ver todos los de esta etiqueta", onClick: () => openLabelView(t) },
        { label: "Renombrar…", separator: true, onClick: () => rename(t) },
        {
          label: "Borrar de la lista",
          danger: true,
          onClick: async () => {
            if (!(await confirmDlg(`¿Borrar la etiqueta "${t}"?`, "Los recuadros que ya la tienen conservan su título.", { danger: true, okLabel: "Borrar" }))) return;
            setLabels((l) => l.filter((x) => x !== t));
          },
        },
      ],
    })),
    {
      label: "+ Nueva etiqueta…",
      separator: labels.length > 0,
      onClick: async () => {
        const v = (await ask("Nueva etiqueta", "", { placeholder: "Ej: Idea, Prompt, Imagen, Escena, Video…" }))?.trim();
        if (!v) return;
        setLabels((l) => (l.includes(v) ? l : [...l, v]));
      },
    },
    ...(labels.length > 1
      ? [
          {
            label: "Ordenar alfabéticamente",
            onClick: () => setLabels((l) => [...l].sort((a, b) => a.localeCompare(b, "es"))),
          },
        ]
      : []),
    ...(labels.length
      ? [
          {
            label: "Vaciar la lista",
            danger: true,
            separator: true,
            onClick: async () => {
              if (!(await confirmDlg("¿Vaciar las etiquetas?", "Los títulos que ya pusiste en los recuadros no se tocan.", { danger: true, okLabel: "Vaciar" }))) return;
              setLabels(() => []);
            },
          },
        ]
      : []),
  ];
}

/** Para el diálogo de elegir etiqueta desde otro lado. */
export const pickLabel = (labels: string[]) =>
  pick("Etiquetas", labels.map((t) => ({ id: t, label: t })));
