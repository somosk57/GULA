import { useEffect, useRef, useState } from "react";
import { useAppState, activeProject } from "./store";
import { TitleBar, createProject } from "./components/TitleBar";
import { ProjectRail } from "./components/ProjectRail";
import { ShortcutsOverlay } from "./components/ShortcutsOverlay";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { LinksPanel } from "./components/LinksPanel";
import { PromptsPanel } from "./components/PromptsPanel";
import { ContextPanel } from "./components/ContextPanel";
import { TasksPanel } from "./components/TasksPanel";
import { CardsPanel } from "./components/CardsPanel";
import { GalleryPanel, collectMedia } from "./components/GalleryPanel";
import { UpdateBanner } from "./components/UpdateBanner";
import { Dialogs } from "./dialog";
import { SearchPalette, Hit } from "./components/SearchPalette";
import { pasteAs } from "./pasteAs";
import { HomeOverlay } from "./components/HomeOverlay";
import { firstRun } from "./onboarding";
import { setShortcut, win } from "./backend";
import { notify } from "./dialog";
import { Tab, newNote, uid } from "./types";
import { collectTasks } from "./ai";
import "./styles.css";

const TABS: { id: Tab; label: string }[] = [
  { id: "links", label: "Accesos" },
  { id: "gallery", label: "Galería" },
  { id: "prompts", label: "Prompts" },
  { id: "context", label: "Contexto" },
  { id: "cards", label: "Fichas" },
  { id: "tasks", label: "Tareas" },
];


const SPLIT_KEY = "gula-split";
const IS_MAC_APP = /Mac/i.test(navigator.platform);

export default function App() {
  const { state, update, replace, undo, redo } = useAppState();
  const [searchOpen, setSearchOpen] = useState(false);
  const [homeOpen, setHomeOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [split, setSplit] = useState<number>(() => Number(localStorage.getItem(SPLIT_KEY)) || 62);
  const [compact, setCompact] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem("gula-sidebar") !== "0");
  const dragging = useRef(false);
  const mainRef = useRef<HTMLDivElement>(null);

  // Modo compacto: si la ventana es angosta, se esconde la barra lateral
  useEffect(() => {
    const check = () => setCompact(window.innerWidth < 480);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Pestaña "Comandos" de versiones viejas → ahora vive en Accesos.
  useEffect(() => {
    if ((state?.bottomTab as string) === "snippets") update((d) => (d.bottomTab = "links"));
  }, [state?.bottomTab, update]);

  // Tema: data-theme en <html>; "system" no estampa nada y decide el sistema.
  useEffect(() => {
    const t = state?.theme ?? "dark";
    if (t === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }, [state?.theme]);

  // Primer arranque: bienvenida + crear el primer proyecto con perfil.
  useEffect(() => {
    if (state && !state.onboarded) firstRun(update);
  }, [state?.onboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atajo global: registrar el guardado (y avisar si está tomado por otro programa).
  useEffect(() => {
    if (!state?.shortcut) return;
    setShortcut(state.shortcut).then((err) => {
      if (err) notify("No pude registrar el atajo global", `${state.shortcut}: probablemente lo usa otro programa. Cambialo desde el menú ⋯.`);
    });
  }, [state?.shortcut]);

  // Aplicar "siempre arriba" al arrancar
  useEffect(() => {
    if (state) win.setAlwaysOnTop(state.alwaysOnTop);
  }, [state?.alwaysOnTop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atajos globales
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        if (compact) setDrawer((v) => !v);
        else setSidebarOpen((v) => { localStorage.setItem("gula-sidebar", v ? "0" : "1"); return !v; });
      } else if (k === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (k === "h") {
        e.preventDefault();
        setHomeOpen((v) => !v);
      } else if (k === "/" || k === "?") {
        e.preventDefault();
        setKeysOpen((v) => !v);
      } else if (k === "v" && e.shiftKey) {
        e.preventDefault();
        update((d) => {
          const p = activeProject(d);
          // pasteAs es async y usa update por su cuenta; acá solo lo disparamos con el estado actual.
          setTimeout(() => pasteAs(p, d.activeNoteId[p.id], update), 0);
        });
      } else if (k === "z") {
        // No pisar el deshacer nativo mientras se tipea en un campo.
        const t = e.target as HTMLElement;
        if (t.tagName === "TEXTAREA" || t.tagName === "INPUT") return;
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (k === "y" && !IS_MAC_APP) {
        e.preventDefault();
        redo();
      } else if (k === "n") {
        e.preventDefault();
        update((d) => {
          const p = activeProject(d);
          const cur = p.notes.find((n) => n.id === d.activeNoteId[p.id]);
          const group = cur?.group ?? "General";
          const n = newNote("Nueva nota", "", group);
          const lastIdx = p.notes.map((x) => x.group).lastIndexOf(group);
          const tpl = lastIdx >= 0 ? p.notes[lastIdx] : undefined;
          if (tpl && tpl.panes.length > 1) n.panes = tpl.panes.map((x) => ({ id: uid(), title: x.title, body: "" }));
          p.notes.splice(lastIdx < 0 ? p.notes.length : lastIdx + 1, 0, n);
          d.activeNoteId[p.id] = n.id;
        });
      } else if (k === "p" || k === "tab") {
        e.preventDefault();
        update((d) => {
          const i = TABS.findIndex((t) => t.id === d.bottomTab);
          const step = e.shiftKey ? -1 : 1;
          d.bottomTab = TABS[(i + step + TABS.length) % TABS.length].id;
        });
      } else if (/^[1-9]$/.test(k) && e.shiftKey) {
        e.preventDefault();
        update((d) => { const p = d.projects[Number(k) - 1]; if (p) d.activeProjectId = p.id; });
      } else if (/^[1-7]$/.test(k)) {
        e.preventDefault();
        update((d) => (d.bottomTab = TABS[Number(k) - 1].id));
      } else if ((k === "arrowup" || k === "arrowdown") && e.shiftKey) {
        e.preventDefault();
        update((d) => {
          const i = d.projects.findIndex((p) => p.id === d.activeProjectId);
          const j = (i + (k === "arrowdown" ? 1 : -1) + d.projects.length) % d.projects.length;
          d.activeProjectId = d.projects[j].id;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [update, compact, undo, redo]);

  // Divisor arrastrable entre editor y panel de abajo
  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!dragging.current || !mainRef.current) return;
      const r = mainRef.current.getBoundingClientRect();
      const pct = ((e.clientY - r.top) / r.height) * 100;
      setSplit(Math.min(85, Math.max(25, pct)));
    };
    const up = () => {
      if (dragging.current) localStorage.setItem(SPLIT_KEY, String(split));
      dragging.current = false;
      document.body.classList.remove("resizing");
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [split]);

  if (!state) return <div className="loading">GULA<span className="slogan">CONTROLA TU GULA.</span></div>;

  const goTo = (h: Hit) =>
    update((d) => {
      d.activeProjectId = h.projectId;
      if (h.noteId) d.activeNoteId[h.projectId] = h.noteId;
      if (h.tab) d.bottomTab = h.tab;
    });

  const project = activeProject(state);
  const note = project.notes.find((n) => n.id === state.activeNoteId[project.id]) ?? project.notes[0];

  return (
    <div className={"app" + (compact ? " compact" : "")}>
      <TitleBar
        state={state}
        project={project}
        update={update}
        sidebarOpen={compact ? drawer : sidebarOpen}
        onToggleSidebar={() => {
          if (compact) setDrawer((v) => !v);
          else setSidebarOpen((v) => { localStorage.setItem("gula-sidebar", v ? "0" : "1"); return !v; });
        }}
        onUndo={undo}
        onRedo={redo}
        onReplace={replace}
        onOpenSearch={() => setSearchOpen(true)}
        onPasteAs={() => pasteAs(project, state.activeNoteId[project.id], update)}
        onHome={() => setHomeOpen(true)}
        onKeys={() => setKeysOpen(true)}
      />
      <UpdateBanner />
      <Dialogs />
      {searchOpen && <SearchPalette state={state} onClose={() => setSearchOpen(false)} onGo={goTo} />}
      {keysOpen && <ShortcutsOverlay onClose={() => setKeysOpen(false)} />}
      {homeOpen && (
        <HomeOverlay
          state={state}
          onClose={() => setHomeOpen(false)}
          onGo={(pid, nid) => update((d) => { d.activeProjectId = pid; if (nid) d.activeNoteId[pid] = nid; })}
        />
      )}
      <div className="layout">
        {state.projects.length > 1 && !compact && state.rail !== false && (
          <ProjectRail state={state} update={update} onAdd={() => createProject(update)} />
        )}
        {((!compact && sidebarOpen) || (compact && drawer)) && (
          <div className={compact ? "drawer" : undefined} onClick={(e) => {
            if (!compact) return;
            const t = e.target as HTMLElement;
            if (t === e.currentTarget || t.closest(".note-item, .proj-item")) setDrawer(false);
          }}>
            <Sidebar state={state} project={project} update={update} search={search} onSearch={setSearch} />
          </div>
        )}
        <div className="main" ref={mainRef}>
          <div className="top" style={{ flexBasis: `${split}%` }}>
            <Editor project={project} note={note} update={update} />
          </div>
          <div
            className="divider"
            onMouseDown={() => {
              dragging.current = true;
              document.body.classList.add("resizing");
            }}
            onDoubleClick={() => setSplit(62)}
            title="Arrastrar para redimensionar · doble clic para restablecer"
          />
          <div className="bottom">
            <div className="tabs">
              <button
                className="tab-max"
                title={split <= 20 ? "Volver al tamaño normal" : "Agrandar el panel de abajo"}
                onClick={() => setSplit((v) => (v <= 20 ? 62 : 12))}
              >
                {split <= 20 ? "⤡" : "⤢"}
              </button>
              {TABS.map((t, i) => {
                const count =
                  t.id === "links" ? project.links.length + project.snippets.length
                  : t.id === "gallery" ? collectMedia(project).length
                  : t.id === "prompts" ? project.prompts.length
                  : t.id === "snippets" ? project.snippets.length
                  : t.id === "cards" ? project.cards.length
                  : t.id === "tasks" ? collectTasks(project).filter((x) => !x.done).length
                  : 0;
                return (
                  <button
                    key={t.id}
                    className={"tab" + (state.bottomTab === t.id ? " active" : "")}
                    onClick={() => update((d) => (d.bottomTab = t.id))}
                    title={`Ctrl+${i + 1}`}
                  >
                    {t.label}
                    {count > 0 && <span className="count">{count}</span>}
                  </button>
                );
              })}
            </div>
            {state.bottomTab === "links" && <LinksPanel project={project} update={update} />}
            {state.bottomTab === "prompts" && <PromptsPanel project={project} update={update} />}
            {state.bottomTab === "context" && <ContextPanel project={project} update={update} />}
            {state.bottomTab === "gallery" && <GalleryPanel project={project} update={update} allProjects={state.projects} />}
            {state.bottomTab === "cards" && <CardsPanel project={project} update={update} />}
            {state.bottomTab === "tasks" && <TasksPanel project={project} update={update} />}
          </div>
        </div>
      </div>
    </div>
  );
}
