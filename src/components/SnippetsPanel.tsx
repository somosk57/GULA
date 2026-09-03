import { useState } from "react";
import { AppState, Project, Snippet, uid } from "../types";
import { copyText, runCommand } from "../backend";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

const SUGGESTED: Omit<Snippet, "id">[] = [
  { title: "Dev", body: "npm run dev", kind: "command" },
  { title: "Instalar deps", body: "npm install", kind: "command" },
  { title: "Estado git", body: "git status", kind: "command" },
  { title: "Commit rápido", body: 'git add -A; git commit -m "wip"', kind: "command" },
];

/** Comandos y textos cortos: copiar con un clic, o correr en PowerShell en la carpeta del proyecto. */
export function SnippetsPanel({ project, update }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const projectDir = project.links.find((l) => l.kind === "folder")?.path ?? null;

  const edit = (id: string, fn: (s: Snippet) => void) =>
    update((d) => {
      fn(d.projects.find((p) => p.id === project.id)!.snippets.find((s) => s.id === id)!);
    });

  const add = (s: Omit<Snippet, "id"> = { title: "", body: "", kind: "command" }) => {
    const id = uid();
    update((d) => {
      d.projects.find((p) => p.id === project.id)!.snippets.push({ id, ...s });
    });
    if (!s.title) setEditing(id);
  };

  const copy = async (s: Snippet) => {
    await copyText(s.body);
    setCopied(s.id);
    setTimeout(() => setCopied(null), 1200);
  };

  const onMenu = (e: React.MouseEvent, s: Snippet) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Editar", onClick: () => setEditing(s.id) },
        {
          label: s.kind === "command" ? "Marcar como texto" : "Marcar como comando",
          onClick: () => edit(s.id, (x) => (x.kind = x.kind === "command" ? "text" : "command")),
        },
        {
          label: "Eliminar",
          danger: true,
          separator: true,
          onClick: () =>
            update((d) => {
              const p = d.projects.find((p) => p.id === project.id)!;
              p.snippets = p.snippets.filter((x) => x.id !== s.id);
            }),
        },
      ],
    });
  };

  return (
    <div className="snippets">
      <div className="panel-actions">
        {projectDir ? (
          <span className="prompt-sub" title={projectDir}>Se corren en: {projectDir.split(/[\\/]/).pop()}</span>
        ) : (
          <span className="prompt-sub">Pinneá una carpeta para correr comandos ahí</span>
        )}
        <button className="chip add" onClick={() => add()}>+ Nuevo</button>
      </div>
      <div className="snippet-list">
        {project.snippets.map((s) =>
          editing === s.id ? (
            <div key={s.id} className="snippet editing">
              <input
                value={s.title}
                onChange={(e) => edit(s.id, (x) => (x.title = e.target.value))}
                placeholder="Nombre (ej: Levantar dev)"
                autoFocus
                spellCheck={false}
              />
              <input
                className="mono"
                value={s.body}
                onChange={(e) => edit(s.id, (x) => (x.body = e.target.value))}
                placeholder="npm run dev"
                spellCheck={false}
                onKeyDown={(e) => e.key === "Enter" && setEditing(null)}
              />
              <button className="chip" onClick={() => setEditing(null)}>Listo</button>
            </div>
          ) : (
            <div key={s.id} className="snippet" onContextMenu={(e) => onMenu(e, s)} onDoubleClick={() => setEditing(s.id)}>
              <div className="snippet-meta">
                <span className="snippet-title">{s.title || "(sin nombre)"}</span>
                <code className="snippet-body">{s.body}</code>
              </div>
              {s.kind === "command" && (
                <button className="chip" onClick={() => runCommand(s.body, projectDir)} title="Correr en PowerShell">
                  ▶ Correr
                </button>
              )}
              <button className={"chip copy" + (copied === s.id ? " ok" : "")} onClick={() => copy(s)}>
                {copied === s.id ? "Copiado ✓" : "Copiar"}
              </button>
            </div>
          ),
        )}
        {project.snippets.length === 0 && (
          <div className="empty wide">
            Comandos y textos que usás seguido en este proyecto.
            <div className="suggest">
              {SUGGESTED.map((s) => (
                <button key={s.title} className="chip" onClick={() => add(s)}>+ {s.title}</button>
              ))}
            </div>
          </div>
        )}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
