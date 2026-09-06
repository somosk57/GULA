import { ask } from "../dialog";
import { useEffect, useState } from "react";
import { AppState, Link, LinkKind, Project, uid } from "../types";
import {
  copyText,
  openInVSCode,
  openPath,
  openTerminal,
  openUrl,
  pickFile,
  pickFolder,
  revealInExplorer,
  win,
} from "../backend";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { siteBadge } from "../sites";
import { useReorder } from "../reorder";
import { SnippetsPanel } from "./SnippetsPanel";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
  /** Sección "Comandos" al pie (se apaga desde el menú ⋯). */
  showCommands?: boolean;
}

function baseName(p: string) {
  const clean = p.replace(/[\\/]+$/, "");
  const i = Math.max(clean.lastIndexOf("\\"), clean.lastIndexOf("/"));
  return i >= 0 ? clean.slice(i + 1) : clean;
}

function niceName(p: string): string {
  if (/^https?:\/\//i.test(p)) {
    try {
      const u = new URL(p);
      const host = u.hostname.replace(/^www\./, "");
      const first = u.pathname.split("/").filter(Boolean)[0];
      return first && first.length < 24 ? `${host}/${first}` : host;
    } catch { /* cae al nombre por defecto */ }
  }
  return baseName(p) || p;
}

function guessKind(p: string): LinkKind {
  if (/^https?:\/\//i.test(p)) return "url";
  const last = baseName(p);
  return /\.[a-z0-9]{1,5}$/i.test(last) ? "file" : "folder";
}

function Icon({ kind, path }: { kind: LinkKind; path: string }) {
  if (kind === "url") {
    const b = siteBadge(path);
    if (b)
      return (
        <span className="ic badge" style={{ background: b.bg, color: b.fg ?? "#fff" }}>
          {b.label}
        </span>
      );
  }
  if (kind === "folder")
    return (
      <svg className="ic folder" viewBox="0 0 24 24" width="30" height="30">
        <path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1H3z" fill="#e3b04b" />
        <path d="M3 9h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#f2c55c" />
      </svg>
    );
  if (kind === "url")
    return (
      <svg className="ic url" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#6ea8fe" strokeWidth="1.6">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
      </svg>
    );
  return (
    <svg className="ic file" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#b9c1cc" strokeWidth="1.6">
      <path d="M6 3h8l5 5v13H6z" />
      <path d="M14 3v5h5" />
    </svg>
  );
}

export function LinksPanel({ project, update, showCommands = true }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dragging, setDragging] = useState(false);

  const addLinks = (paths: string[]) =>
    update((d) => {
      const p = d.projects.find((p) => p.id === project.id)!;
      for (const path of paths) {
        if (p.links.some((l) => l.path === path)) continue;
        p.links.push({ id: uid(), name: niceName(path), path, kind: guessKind(path) });
      }
    });

  // Drag & drop desde el Explorador (evento nativo de Tauri)
  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    win.onDrop((paths, at) => {
      // Solo si se soltó sobre el panel de abajo; lo que cae sobre la nota lo toma el editor.
      if (at) {
        const el = document.elementFromPoint(at.x, at.y);
        if (!el?.closest(".bottom")) return;
      }
      addLinks(paths);
    }).then((f) => {
      off = f;
      // Si el efecto se limpió mientras se registraba, soltarlo ya (si no, quedan
      // dos listeners y el archivo entra dos veces).
      if (dead) f();
    });
    const enter = () => setDragging(true);
    const leave = () => setDragging(false);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", leave);
    return () => {
      dead = true;
      off?.();
      off = undefined;
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", leave);
    };
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const gridRef = useReorder<HTMLDivElement>({
    item: ".tile",
    axis: "xy",
    onDrop: (dragId, overId, before) =>
      update((d) => {
        const p = d.projects.find((p) => p.id === project.id)!;
        const from = p.links.findIndex((l) => l.id === dragId);
        if (from < 0) return;
        const [l] = p.links.splice(from, 1);
        const overIdx = p.links.findIndex((x) => x.id === overId);
        if (overIdx < 0) { p.links.push(l); return; }
        p.links.splice(before ? overIdx : overIdx + 1, 0, l);
      }),
  });

  const open = (l: Link) => (l.kind === "url" ? openUrl(l.path) : openPath(l.path));

  const addMenu = (e: React.MouseEvent) => {
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Carpeta…", onClick: async () => { const p = await pickFolder(); if (p) addLinks([p]); } },
        { label: "Archivo…", onClick: async () => { const p = await pickFile(); if (p) addLinks([p]); } },
        {
          label: "Link (URL)…",
          onClick: async () => {
            const u = await ask("Link (URL)", "https://", { placeholder: "https://…" });
            if (u && u.trim() !== "https://") addLinks([u.trim()]);
          },
        },
      ],
    });
  };

  const linkMenu = (e: React.MouseEvent, l: Link) => {
    e.preventDefault();
    const items: MenuItem[] = [{ label: "Abrir", onClick: () => open(l) }];
    if (l.kind !== "url") {
      items.push(
        { label: "Abrir PowerShell acá", onClick: () => openTerminal(l.path) },
        { label: "Abrir en VS Code", onClick: () => openInVSCode(l.path) },
        { label: "Mostrar en Explorador", onClick: () => revealInExplorer(l.path) },
      );
    }
    items.push(
      { label: l.kind === "url" ? "Copiar URL" : "Copiar ruta", onClick: () => copyText(l.path), separator: true },
      {
        label: "Renombrar",
        onClick: async () => {
          const t = await ask("Nombre", l.name);
          if (t?.trim())
            update((d) => {
              d.projects.find((p) => p.id === project.id)!.links.find((x) => x.id === l.id)!.name = t.trim();
            });
        },
      },
      {
        label: "Quitar",
        danger: true,
        separator: true,
        onClick: () =>
          update((d) => {
            const p = d.projects.find((p) => p.id === project.id)!;
            p.links = p.links.filter((x) => x.id !== l.id);
          }),
      },
    );
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const firstFolder = project.links.find((l) => l.kind === "folder");

  return (
    <div className={"links accesos" + (dragging ? " dragging" : "")}>
      <div className="panel-actions">
        {firstFolder && (
          <button className="chip" onClick={() => openTerminal(firstFolder.path)} title={`PowerShell en ${firstFolder.name}`}>
            &gt;_ PowerShell
          </button>
        )}
        {project.links.length > 1 && (
          <button className="chip" onClick={() => project.links.forEach(open)} title="Abrir todo lo pinneado">
            Abrir todo
          </button>
        )}
        <button
          className="chip"
          title="Colecciones: carpetas con nombre (Clips, Artworks, Docs…) que la Galería muestra"
          onClick={async () => {
            const name = await ask("Nombre de la colección", "", { placeholder: "Ej: Clips, Highlights, Artworks, Docs, Assets…" });
            if (!name?.trim()) return;
            const dir = await pickFolder();
            if (!dir) return;
            update((d) => {
              const p = d.projects.find((p) => p.id === project.id)!;
              p.collections.push({ id: uid(), name: name.trim(), path: dir });
              d.bottomTab = "gallery";
            });
          }}
        >
          + Colección
        </button>
        <button className="chip" onClick={addMenu}>+ Agregar</button>
      </div>
      <div className="grid" ref={gridRef}>
        {project.links.map((l) => (
          <button
            key={l.id}
            data-id={l.id}
            className="tile"
            onClick={() => open(l)}
            onContextMenu={(e) => linkMenu(e, l)}
            title={l.path + "\n(clic derecho: opciones)"}
          >
            <Icon kind={l.kind} path={l.path} />
            <span>{l.name}</span>
          </button>
        ))}
        {project.links.length === 0 && (
          <div className="empty wide">Arrastrá carpetas o archivos acá, o usá “+ Agregar”.</div>
        )}
      </div>
      {showCommands && <>
        <div className="accesos-divider"><span>Comandos</span></div>
        <SnippetsPanel project={project} update={update} embedded />
      </>}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
