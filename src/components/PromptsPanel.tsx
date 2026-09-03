import { useState } from "react";
import { AppState, Project, Prompt, uid } from "../types";
import { copyText, readClipboard } from "../backend";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "recién";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

export function PromptsPanel({ project, update }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const edit = (id: string, fn: (p: Prompt) => void) =>
    update((d) => {
      const pr = d.projects.find((p) => p.id === project.id)!.prompts.find((x) => x.id === id)!;
      fn(pr);
      pr.updatedAt = Date.now();
    });

  const add = (body = "", title = "Nuevo prompt") => {
    const id = uid();
    update((d) => {
      d.projects.find((p) => p.id === project.id)!.prompts.unshift({
        id, title, body, updatedAt: Date.now(), lastUsedAt: null,
      });
    });
    setOpenId(id);
  };

  const fromClipboard = async () => {
    const t = await readClipboard();
    if (!t?.trim()) return alert("El portapapeles está vacío.");
    const firstLine = t.trim().split("\n")[0].slice(0, 60);
    add(t, firstLine || "Prompt pegado");
  };

  const copy = async (p: Prompt) => {
    await copyText(p.body);
    edit(p.id, (x) => (x.lastUsedAt = Date.now()));
    setCopied(p.id);
    setTimeout(() => setCopied(null), 1200);
  };

  const remove = (p: Prompt) => {
    if (!confirm(`¿Eliminar el prompt "${p.title}"?`)) return;
    update((d) => {
      const pr = d.projects.find((x) => x.id === project.id)!;
      pr.prompts = pr.prompts.filter((x) => x.id !== p.id);
    });
  };

  const last = [...project.prompts].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0))[0];
  const lastId = last?.lastUsedAt ? last.id : null;
  const ordered = [...project.prompts].sort((a, b) => Number(b.id === lastId) - Number(a.id === lastId));

  return (
    <div className="prompts">
      <div className="panel-actions">
        <button className="chip" onClick={fromClipboard} title="Crea un prompt con lo que tengas copiado">
          Pegar del portapapeles
        </button>
        <button className="chip add" onClick={() => add()}>+ Nuevo</button>
      </div>
      <div className="prompt-list">
        {ordered.map((p) => {
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className={"prompt" + (p.id === lastId ? " last" : "") + (isOpen ? " open" : "")}>
              <div className="prompt-row" onClick={() => setOpenId(isOpen ? null : p.id)}>
                <div className="prompt-meta">
                  <span className="prompt-title">{p.title || "(sin título)"}</span>
                  <span className="prompt-sub">
                    {p.id === lastId ? `Último usado · ${ago(p.lastUsedAt!)}` : p.body.slice(0, 70).replace(/\n/g, " ")}
                  </span>
                </div>
                <button
                  className={"chip copy" + (copied === p.id ? " ok" : "")}
                  onClick={(e) => { e.stopPropagation(); copy(p); }}
                  title="Copiar prompt"
                >
                  {copied === p.id ? "Copiado ✓" : "Copiar"}
                </button>
              </div>
              {isOpen && (
                <div className="prompt-edit">
                  <input
                    value={p.title}
                    onChange={(e) => edit(p.id, (x) => (x.title = e.target.value))}
                    placeholder="Título"
                    spellCheck={false}
                  />
                  <textarea
                    value={p.body}
                    onChange={(e) => edit(p.id, (x) => (x.body = e.target.value))}
                    placeholder="Texto del prompt…"
                    spellCheck={false}
                    autoFocus
                  />
                  <div className="prompt-foot">
                    <span className="prompt-sub">{p.body.length} caracteres · editado {ago(p.updatedAt)}</span>
                    <button className="chip danger" onClick={() => remove(p)}>Eliminar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {project.prompts.length === 0 && (
          <div className="empty wide">
            Guardá acá los prompts del proyecto. El último que copies queda marcado arriba.
          </div>
        )}
      </div>
    </div>
  );
}
