import { useRef, useState } from "react";
import { AppState, Pane, Project, Shelf, uid } from "../types";
import { assetUrl } from "../backend";
import { collectMedia } from "./GalleryPanel";
import { goToPane, locatePane, paneHas, paneName, walkPanes } from "../navigate";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { ask, confirmDlg, pick } from "../dialog";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

const srcOf = (s: string) => (/^(https?:|data:)/i.test(s) ? s : assetUrl(s));

/**
 * Los estantes: filas con nombre ("PERSONAJES") donde juntás colecciones que
 * viven en lugares distintos del mapa. Cada fila se corre a los costados con
 * las flechas; el mapa no se toca, esto es sólo otra manera de mirarlo.
 */
export function Shelves({ project, update }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const shelves = project.shelves ?? [];

  const edit = (fn: (s: Shelf[]) => Shelf[]) =>
    update((d) => {
      const p = d.projects.find((x) => x.id === project.id)!;
      p.shelves = fn(p.shelves ?? []);
    });

  const addShelf = async () => {
    const t = (await ask("Nuevo estante", "", { placeholder: "Ej: PERSONAJES, ESCENAS, REFERENCIAS…" }))?.trim();
    if (!t) return;
    edit((l) => [...l, { id: uid(), title: t, ids: [] }]);
  };

  /** Elegir un cuadrado del proyecto —colección o recuadro— y ponerlo en el estante. */
  const addTo = async (sh: Shelf) => {
    const all = walkPanes(project, true).filter((x) => !sh.ids.includes(x.paneId));
    if (!all.length) return void (await confirmDlg("No hay nada para agregar", "Creá una colección o un recuadro en el mapa y volvé.", { okLabel: "Listo" }));
    const id = await pick(`Poner en ${sh.title}`, all.map((x) => ({
      id: x.paneId,
      label: (x.pane.panes ? "▣ " : "▤ ") + paneName(x.pane, x.pane.panes ? "Colección" : "Recuadro"),
      hint: x.path,
    })));
    if (!id) return;
    edit((l) => l.map((x) => (x.id === sh.id ? { ...x, ids: [...x.ids, id] } : x)));
  };

  const shelfMenu = (e: React.MouseEvent, sh: Shelf) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "+ Agregar un cuadrado…", onClick: () => addTo(sh) },
        {
          label: "Renombrar…",
          separator: true,
          onClick: async () => {
            const t = (await ask("Nombre del estante", sh.title))?.trim();
            if (t) edit((l) => l.map((x) => (x.id === sh.id ? { ...x, title: t } : x)));
          },
        },
        {
          label: "Borrar el estante",
          danger: true,
          onClick: async () => {
            if (!(await confirmDlg(`¿Borrar el estante "${sh.title}"?`, "Las colecciones siguen donde están: se borra sólo la fila.", { danger: true, okLabel: "Borrar" }))) return;
            edit((l) => l.filter((x) => x.id !== sh.id));
          },
        },
      ],
    });
  };

  const itemMenu = (e: React.MouseEvent, sh: Shelf, id: string) => {
    e.preventDefault();
    const others = shelves.filter((x) => x.id !== sh.id);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...(others.length
          ? [{
              label: "Mover a otro estante",
              onClick: () => {},
              items: others.map((o) => ({
                label: o.title,
                onClick: () =>
                  edit((l) =>
                    l.map((x) =>
                      x.id === sh.id ? { ...x, ids: x.ids.filter((y) => y !== id) } : x.id === o.id ? { ...x, ids: [...x.ids, id] } : x,
                    ),
                  ),
              })),
            }]
          : []),
        {
          label: `Sacar de ${sh.title}`,
          separator: others.length > 0,
          danger: true,
          onClick: () => edit((l) => l.map((x) => (x.id === sh.id ? { ...x, ids: x.ids.filter((y) => y !== id) } : x))),
        },
      ],
    });
  };

  return (
    <div className="shelves">
      {shelves.map((sh) => (
        <ShelfRow
          key={sh.id}
          sh={sh}
          project={project}
          onTitle={(e) => shelfMenu(e, sh)}
          onAdd={() => addTo(sh)}
          onGo={(noteId, id) => goToPane(update, { projectId: project.id, noteId, paneId: id })}
          onItemMenu={(e, id) => itemMenu(e, sh, id)}
        />
      ))}
      <button className="shelf-new" onClick={addShelf} title="Una fila con nombre para juntar cuadrados de distintos lados del mapa">
        + Estante
      </button>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function ShelfRow({
  sh,
  project,
  onTitle,
  onAdd,
  onGo,
  onItemMenu,
}: {
  sh: Shelf;
  project: Project;
  onTitle: (e: React.MouseEvent) => void;
  onAdd: () => void;
  onGo: (noteId: string, id: string) => void;
  onItemMenu: (e: React.MouseEvent, id: string) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const media = collectMedia(project);
  const items = sh.ids
    .map((id) => {
      const found = locatePane(project, id);
      return found ? { id, ...found } : null;
    })
    .filter(Boolean) as { id: string; pane: Pane; noteId: string; name: string }[];

  const scroll = (dir: number) => strip.current?.scrollBy({ left: dir * 96, behavior: "smooth" });

  return (
    <div className="shelf">
      <button className="shelf-title" onClick={onTitle} onContextMenu={onTitle} title="Clic: renombrar, agregar, borrar">
        {sh.title}
      </button>
      <div className="shelf-row">
        <button className="shelf-arrow" onClick={() => scroll(-1)} title="Ver lo de la izquierda">‹</button>
        <div className="shelf-strip" ref={strip}>
          {items.map((x) => {
            const thumb = media.find((m) => paneHas(x.pane, m.src))?.src ?? null;
            return (
              <button
                key={x.id}
                className={"shelf-item" + (x.pane.panes ? "" : " box")}
                onClick={() => onGo(x.noteId, x.id)}
                onContextMenu={(e) => onItemMenu(e, x.id)}
                title={`${paneName(x.pane, x.pane.panes ? "Colección" : "Recuadro")}\nClic: ir · clic derecho: mover o sacar`}
              >
                {thumb ? <img src={srcOf(thumb)} alt="" draggable={false} /> : <span>{paneName(x.pane, "··").slice(0, 2).toUpperCase()}</span>}
              </button>
            );
          })}
          <button className="shelf-item add" onClick={onAdd} title="Agregar una colección o un recuadro a este estante">+</button>
        </div>
        <button className="shelf-arrow" onClick={() => scroll(1)} title="Ver lo de la derecha">›</button>
      </div>
    </div>
  );
}

/**
 * El "★ Fijar a la izquierda" del clic derecho en una colección: una sola
 * entrada donde elegís el lugar — la columna, o cualquier estante.
 */
export function pinMenuItem(
  pane: Pane,
  project: Project,
  update: (fn: (d: AppState) => void) => void,
): MenuItem {
  const id = pane.id;
  const shelves = project.shelves ?? [];
  const pinned = (project.pins ?? []).includes(id);
  const mark = (on: boolean) => (on ? "✓" : "○");
  const editProject = (fn: (p: Project) => void) => update((d) => fn(d.projects.find((x) => x.id === project.id)!));

  return {
    label: "★ Fijar a la izquierda",
    onClick: () => {},
    items: [
      {
        label: `${mark(pinned)}  En la columna (siempre a la vista)`,
        onClick: () =>
          editProject((p) => {
            const pins = p.pins ?? [];
            p.pins = pinned ? pins.filter((x) => x !== id) : [...pins, id];
          }),
      },
      ...shelves.map((sh, i) => ({
        label: `${mark(sh.ids.includes(id))}  ${sh.title}`,
        separator: i === 0,
        onClick: () =>
          editProject((p) => {
            p.shelves = (p.shelves ?? []).map((x) =>
              x.id === sh.id ? { ...x, ids: x.ids.includes(id) ? x.ids.filter((y) => y !== id) : [...x.ids, id] } : x,
            );
          }),
      })),
      {
        label: "+ Nuevo estante…",
        separator: shelves.length === 0,
        onClick: async () => {
          const t = (await ask("Nuevo estante", "", { placeholder: "Ej: PERSONAJES, ESCENAS, REFERENCIAS…" }))?.trim();
          if (!t) return;
          editProject((p) => (p.shelves = [...(p.shelves ?? []), { id: uid(), title: t, ids: [id] }]));
        },
      },
    ],
  };
}
