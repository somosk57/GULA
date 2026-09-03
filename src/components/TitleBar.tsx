import { useState } from "react";
import { copyText, exportFiles, pickFolder, win } from "../backend";
import { AppState, Project, newProject } from "../types";
import { buildAiPackage, exportProject } from "../ai";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface Props {
  state: AppState;
  project: Project;
  update: (fn: (d: AppState) => void) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

const I = {
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 3h6l-1 7 3 3H7l3-3z" /></svg>,
  side: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>,
  chev: <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>,
  min: <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" /></svg>,
  max: <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" /></svg>,
  close: <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1.1" /></svg>,
};

export const IS_MAC = /Mac/i.test(navigator.platform) || /Macintosh/i.test(navigator.userAgent);

/** Semáforos estilo macOS (cerrar, minimizar, maximizar) para la barra propia. */
function TrafficLights() {
  return (
    <div className="lights">
      <button className="light close" title="Ocultar (queda en la barra de menú)" onClick={() => win.close()} />
      <button className="light min" title="Minimizar" onClick={() => win.minimize()} />
      <button className="light max" title="Maximizar" onClick={() => win.toggleMaximize()} />
    </div>
  );
}

export function TitleBar({ state, project, update, sidebarOpen, onToggleSidebar }: Props) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const addProject = () => {
    const name = prompt("Nombre del proyecto:");
    if (!name?.trim()) return;
    update((d) => {
      const p = newProject(name.trim());
      d.projects.push(p);
      d.activeProjectId = p.id;
      d.activeNoteId[p.id] = p.notes[0].id;
    });
    setOpen(false);
  };

  const projectMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setOpen(false);
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Renombrar proyecto",
          onClick: () => {
            const t = prompt("Nombre del proyecto:", project.name);
            if (t?.trim()) update((d) => (d.projects.find((p) => p.id === project.id)!.name = t.trim()));
          },
        },
        { label: "Copiar todo para la IA", onClick: () => copyText(buildAiPackage(project)) },
        {
          label: "Exportar a carpeta (.md)…",
          onClick: async () => {
            const dir = await pickFolder();
            if (!dir) return;
            const files = exportProject(project);
            await exportFiles(dir, files);
            alert(`Exportados ${files.length} archivos a:\n${dir}`);
          },
        },
        {
          label: "Eliminar proyecto",
          danger: true,
          separator: true,
          onClick: () => {
            if (state.projects.length === 1) return alert("No podés eliminar el único proyecto.");
            if (!confirm(`¿Eliminar el proyecto "${project.name}" con todas sus notas?`)) return;
            update((d) => {
              d.projects = d.projects.filter((p) => p.id !== project.id);
              d.activeProjectId = d.projects[0].id;
            });
          },
        },
      ],
    });
  };

  return (
    <div className={"titlebar" + (IS_MAC ? " mac" : "")} data-tauri-drag-region>
      {IS_MAC && <TrafficLights />}
      <button
        className={"tb-btn sm" + (state.alwaysOnTop ? " active" : "")}
        title={state.alwaysOnTop ? "Dejar de fijar" : "Siempre arriba"}
        onClick={() => update((d) => (d.alwaysOnTop = !d.alwaysOnTop))}
      >
        {I.pin}
      </button>
      <button className={"tb-btn sm" + (sidebarOpen ? "" : " dim")} title={`Mostrar/ocultar notas (${IS_MAC ? "⌘" : "Ctrl+"}B)`} onClick={onToggleSidebar}>
        {I.side}
      </button>

      <div className="tb-center" data-tauri-drag-region>
        <button className="proj-name" onClick={() => setOpen((v) => !v)} onContextMenu={projectMenu} title="Cambiar de proyecto · clic derecho: opciones">
          <span>{project.name}</span>
          {I.chev}
        </button>
        {open && (
          <>
            <div className="backdrop" onClick={() => setOpen(false)} />
            <div className="proj-list">
              {state.projects.map((p) => (
                <button
                  key={p.id}
                  className={"proj-item" + (p.id === project.id ? " active" : "")}
                  onClick={() => {
                    update((d) => (d.activeProjectId = p.id));
                    setOpen(false);
                  }}
                >
                  {p.name}
                </button>
              ))}
              <button className="proj-item add" onClick={addProject}>+ Nuevo proyecto</button>
            </div>
          </>
        )}
      </div>

      {!IS_MAC && (
        <>
          <button className="tb-btn" title="Minimizar" onClick={() => win.minimize()}>{I.min}</button>
          <button className="tb-btn" title="Maximizar" onClick={() => win.toggleMaximize()}>{I.max}</button>
          <button className="tb-btn close" title="Ocultar (queda en la bandeja)" onClick={() => win.close()}>{I.close}</button>
        </>
      )}

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
