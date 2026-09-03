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

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

function baseName(p: string) {
  const clean = p.replace(/[\\/]+$/, "");
  const i = Math.max(clean.lastIndexOf("\\"), clean.lastIndexOf("/"));
  return i >= 0 ? clean.slice(i + 1) : clean;
}

function guessKind(p: string): LinkKind {
  if (/^https?:\/\//i.test(p)) return "url";
  const last = baseName(p);
  return /\.[a-z0-9]{1,5}$/i.test(last) ? "file" : "folder";
}

function Icon({ kind }: { kind: LinkKind }) {
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

export function LinksPanel({ project, update }: Props) {
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dragging, setDragging] = useState(false);

  const addLinks = (paths: string[]) =>
    update((d) => {
      const p = d.projects.find((p) => p.id === project.id)!;
      for (const path of paths) {
        if (p.links.some((l) => l.path === path)) continue;
        p.links.push({ id: uid(), name: baseName(path) || path, path, kind: guessKind(path) });
      }
    });

  // Drag & drop desde el Explorador (evento nativo de Tauri)
  useEffect(() => {
    let off: (() => void) | undefined;
    win.onDrop((paths) => addLinks(paths)).then((f) => (off = f));
    const enter = () => setDragging(true);
    const leave = () => setDragging(false);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", leave);
    return () => {
      off?.();
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", leave);
    };
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className={"links" + (dragging ? " dragging" : "")}>
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
        <button className="chip add" onClick={addMenu}>+ Agregar</button>
      </div>
      <div className="grid">
        {project.links.map((l) => (
          <button
            key={l.id}
            className="tile"
            onClick={() => open(l)}
            onContextMenu={(e) => linkMenu(e, l)}
            title={l.path + "\n(clic derecho: opciones)"}
          >
            <Icon kind={l.kind} />
            <span>{l.name}</span>
          </button>
        ))}
        {project.links.length === 0 && (
          <div className="empty wide">Arrastrá carpetas o archivos acá, o usá “+ Agregar”.</div>
        )}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
