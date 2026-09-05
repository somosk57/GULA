import { useState } from "react";
import { copyText, dataDir, exportFiles, listBackups, loadState, openPath, pickFolder, readBackup, setDataLocation, snapshotNow, win } from "../backend";
import { ask, confirmDlg, notify, pick } from "../dialog";
import { migrate } from "../types";
import { lastDiaryLine } from "../diary";
import { AppState, PROFILES, Project, STAGES, TABS, newProject } from "../types";
import { ProfileId } from "../profiles";
import { collectTasks, fmtAgo, fmtDate } from "../ai";
import { buildAiPackage, exportProject } from "../ai";
import { buildReport } from "../report";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface Props {
  state: AppState;
  project: Project;
  update: (fn: (d: AppState) => void) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReplace: (s: AppState) => void;
  onOpenSearch: () => void;
  onPasteAs: () => void;
  onHome: () => void;
  onKeys: () => void;
}

const I = {
  pin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5" /><path d="M9 3h6l-1 7 3 3H7l3-3z" /></svg>,
  home: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>,
  paste: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11v6M9 14h6" /></svg>,
  dots: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>,
  search: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>,
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

/** Pide nombre y tipo, y crea el proyecto. */
export async function createProject(update: (fn: (d: AppState) => void) => void) {
  const name = await ask("Nuevo proyecto", "", { placeholder: "Ej: Canal de cocina, App de turnos, Novela…" });
  if (!name?.trim()) return;
  const profile = await pick("¿Qué tipo de proyecto es?", PROFILES.map((p) => ({ id: p.id, label: p.name, hint: p.hint })));
  if (!profile) return;
  update((d) => {
    const p = newProject(name.trim(), profile as ProfileId);
    d.projects.push(p);
    d.activeProjectId = p.id;
    d.activeNoteId[p.id] = p.notes[0].id;
  });
}

export function TitleBar({ state, project, update, sidebarOpen, onToggleSidebar, onUndo, onRedo, onReplace, onOpenSearch, onPasteAs, onHome, onKeys }: Props) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const addProject = async () => {
    setOpen(false);
    await createProject(update);
  };

  const projectMenu = (e: React.MouseEvent, p: Project = project) => {
    e.preventDefault();
    setOpen(false);
    setMenu({ x: e.clientX, y: e.clientY, items: projectMenuItems(p, state, update) });
  };

  const restoreBackup = async () => {
    const list = await listBackups();
    const id = await pick(
      "Restaurar una copia de seguridad",
      list.map((b) => ({ id: b.name, label: b.name.replace(/^data-|\.json$/g, ""), hint: `${Math.round(b.size / 1024)} KB` })),
    );
    if (!id) return;
    if (!(await confirmDlg("¿Restaurar esta copia?", "Se reemplaza todo por lo que había en esa fecha. Antes guardo una copia de lo actual, y Ctrl+Z también lo recupera.", { okLabel: "Restaurar" }))) return;
    try {
      await snapshotNow("antes-de-restaurar");
      const data = await readBackup(id);
      onReplace(migrate(data));
      notify("Copia restaurada", id);
    } catch (e) {
      notify("No se pudo restaurar", String(e));
    }
  };

  const settingsMenu = (e: React.MouseEvent) => {
    const mod = IS_MAC ? "⌘" : "Ctrl+";
    const t = state.theme;
    const hidden = state.hiddenTabs ?? [];
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: `Deshacer  (${mod}Z)`, onClick: onUndo },
        { label: `Rehacer  (${mod}Shift+Z)`, onClick: onRedo },
        { label: `Buscar en todo  (${mod}K)`, onClick: onOpenSearch, separator: true },
        { label: `Pegar como…  (${mod}Shift+V)`, onClick: onPasteAs },
        { label: `Hoy: todos los proyectos  (${mod}H)`, onClick: onHome },
        { label: `Atajos de teclado  (${mod}/)`, onClick: onKeys },
        {
          label: `Tema: ${t === "dark" ? "oscuro" : t === "light" ? "claro" : "sistema"}`,
          separator: true,
          onClick: () => update((d) => (d.theme = d.theme === "dark" ? "light" : d.theme === "light" ? "system" : "dark")),
        },
        {
          label: `${state.rail === false ? "○" : "✓"}  Columna de proyectos`,
          onClick: () => update((d) => (d.rail = d.rail === false)),
        },
        {
          label: `${state.bottomOpen === false ? "○" : "✓"}  Panel de abajo`,
          onClick: () => update((d) => (d.bottomOpen = d.bottomOpen === false)),
        },
        ...TABS.map((tab, i) => ({
          label: `${hidden.includes(tab.id) ? "○" : "✓"}      ${tab.label}`,
          separator: i === 0,
          onClick: () =>
            update((d) => {
              const h = d.hiddenTabs ?? [];
              d.hiddenTabs = h.includes(tab.id) ? h.filter((x) => x !== tab.id) : [...h, tab.id];
            }),
        })),
        {
          label: `${state.showCommands === false ? "○" : "✓"}      Comandos (dentro de Accesos)`,
          onClick: () => update((d) => (d.showCommands = d.showCommands === false)),
        },
        {
          label: `Atajo global: ${state.shortcut}`,
          separator: true,
          onClick: async () => {
            const v = await ask("Atajo para mostrar/ocultar GULA", state.shortcut, { placeholder: "Ej: Ctrl+Shift+Space, Alt+G, Ctrl+Alt+N" });
            if (v?.trim()) update((d) => (d.shortcut = v.trim()));
          },
        },
        { label: "Restaurar copia de seguridad…", onClick: restoreBackup, separator: true },
        { label: "Abrir carpeta de datos", onClick: async () => openPath(await dataDir()) },
        {
          label: "Mover los datos a otra carpeta… (OneDrive, Drive)",
          onClick: async () => {
            const dir = await pickFolder();
            if (!dir) return;
            if (!(await confirmDlg("¿Mover los datos de GULA?", `Se copian data.json, las copias de seguridad y las imágenes pegadas a:\n${dir}\n\nSi ahí ya hay datos de otra PC, se conservan y se usan esos.`, { okLabel: "Mover" }))) return;
            try {
              const to = await setDataLocation(dir);
              const fresh = await loadState();
              if (fresh) onReplace(migrate(fresh));
              notify("Datos movidos", to);
            } catch (e) {
              notify("No se pudieron mover", String(e));
            }
          },
        },
        { label: "GULA v2.10.0 · Controla tu gula.", onClick: () => {}, separator: true },
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
      <button className="tb-btn sm" title={`Hoy: todos los proyectos de un vistazo (${IS_MAC ? "⌘" : "Ctrl+"}H)`} onClick={onHome}>
        {I.home}
      </button>
      <button className="tb-btn sm" title={`Buscar en todos los proyectos (${IS_MAC ? "⌘" : "Ctrl+"}K)`} onClick={onOpenSearch}>
        {I.search}
      </button>
      <button className="tb-btn sm" title={`Pegar como… nota, bloque, prompt, comando o entrada del día (${IS_MAC ? "⌘" : "Ctrl+"}Shift+V)`} onClick={onPasteAs}>
        {I.paste}
      </button>
      <button className="tb-btn sm" title="Más opciones" onClick={settingsMenu}>
        {I.dots}
      </button>

      <div className="tb-center" data-tauri-drag-region>
        <button className="proj-name" onClick={() => setOpen((v) => !v)} onContextMenu={projectMenu} title="Cambiar de proyecto · clic derecho: renombrar, exportar, eliminar">
          {project.sessionStartedAt != null && <span className="session-dot" title="Sesión en curso" />}
          <span>{project.name}</span>
          {I.chev}
        </button>
        {open && (
          <>
            <div className="backdrop" onClick={() => setOpen(false)} />
            <div className="proj-list">
              {state.projects.map((p) => {
                const pending = collectTasks(p).filter((t) => !t.done).length;
                const last = lastDiaryLine(p);
                const touched = Math.max(p.lastSessionAt ?? 0, last?.at ?? 0, ...p.notes.map((n) => n.updatedAt));
                return (
                  <button
                    key={p.id}
                    className={"proj-item" + (p.id === project.id ? " active" : "")}
                    onClick={() => {
                      update((d) => (d.activeProjectId = p.id));
                      setOpen(false);
                    }}
                    onContextMenu={(e) => projectMenu(e, p)}
                    title="Clic derecho: renombrar, exportar, eliminar"
                  >
                    <span className="proj-row">
                      <span className="proj-title">
                        {p.name}
                        <span className={"stage mini " + p.stage}>{STAGES.find((s) => s.id === p.stage)?.label}</span>
                      </span>
                      <span className="proj-when">{touched ? fmtDate(touched) : ""}</span>
                    </span>
                    <span className="proj-sub">
                      {p.now ? <>{p.now}{p.nowAt && <span className="proj-age"> · {fmtAgo(p.nowAt)}</span>}</> : last ? last.text : "sin avances anotados"}
                      {pending > 0 && <span className="proj-pending">{pending} pendiente{pending === 1 ? "" : "s"}</span>}
                    </span>
                  </button>
                );
              })}
              <button className="proj-item add" onClick={addProject}>+ Nuevo proyecto</button>
            <button className="proj-item add" onClick={() => { setOpen(false); onHome(); }}>⌂ Ver todos (Hoy)</button>
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

/** Opciones de un proyecto: sirven para el nombre de arriba, la lista y la columna de la izquierda. */
export function projectMenuItems(
  project: Project,
  state: AppState,
  update: (fn: (d: AppState) => void) => void,
): MenuItem[] {
  return [
    {
      label: "Renombrar proyecto",
      onClick: async () => {
        const t = await ask("Nombre del proyecto", project.name);
        if (t?.trim()) update((d) => (d.projects.find((p) => p.id === project.id)!.name = t.trim()));
      },
    },
    {
      label: "Etapa: " + (STAGES.find((s) => s.id === project.stage)?.label ?? "Idea"),
      onClick: async () => {
        const id = await pick("¿En qué anda el proyecto?", STAGES.map((s) => ({ id: s.id, label: s.label })));
        if (id) update((d) => (d.projects.find((p) => p.id === project.id)!.stage = id as Project["stage"]));
      },
    },
    { label: "Copiar todo para la IA", separator: true, onClick: () => copyText(buildAiPackage(project)) },
    {
      label: "Informe del proyecto…",
      onClick: async () => {
        const range = await pick("¿Qué período?", [
          { id: "all", label: "Todo el proyecto", hint: "desde el inicio" },
          { id: "week", label: "Últimos 7 días", hint: "solo lo reciente" },
        ]);
        if (!range) return;
        const depth = await pick("¿Cuánto detalle?", [
          { id: "summary", label: "Resumido", hint: "título, fecha y primeras líneas de cada nota" },
          { id: "full", label: "Completo", hint: "el texto entero de cada nota y ficha" },
        ]);
        if (!depth) return;
        const text = buildReport(project, { range: range as "all" | "week", fullNotes: depth === "full" });
        const what = await pick(`Informe listo (≈ ${Math.round(text.length / 4).toLocaleString("es-AR")} tokens)`, [
          { id: "copy", label: "Copiar al portapapeles", hint: "para pegar en un chat" },
          { id: "file", label: "Guardar como archivo .md…", hint: "elegís la carpeta" },
          { id: "view", label: "Ver", hint: "leerlo acá" },
        ]);
        if (what === "copy") { await copyText(text); notify("Informe copiado"); }
        else if (what === "file") {
          const dir = await pickFolder();
          if (dir) { await exportFiles(dir, [{ name: `informe-${project.name}.md`, content: text }]); notify("Informe guardado", dir); }
        } else if (what === "view") notify("Informe del proyecto", text);
      },
    },
    {
      label: "Exportar a carpeta (.md)…",
      onClick: async () => {
        const dir = await pickFolder();
        if (!dir) return;
        const files = exportProject(project);
        await exportFiles(dir, files);
        notify(`Exportados ${files.length} archivos`, dir);
      },
    },
    {
      label: "Eliminar proyecto",
      danger: true,
      separator: true,
      onClick: async () => {
        if (state.projects.length === 1) return notify("No podés eliminar el único proyecto", "Creá otro primero y después borrá este.");
        if (!(await confirmDlg(`¿Eliminar el proyecto "${project.name}"?`, "Se borran sus notas, colecciones, prompts, comandos y sesiones. Ctrl+Z lo recupera mientras la app siga abierta.", { danger: true, okLabel: "Eliminar proyecto" }))) return;
        update((d) => {
          d.projects = d.projects.filter((p) => p.id !== project.id);
          if (!d.projects.some((p) => p.id === d.activeProjectId)) d.activeProjectId = d.projects[0].id;
        });
      },
    },
  ];
}
