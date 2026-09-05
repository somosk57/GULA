import { useState } from "react";
import { ask, confirmDlg, notify } from "../dialog";

const VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Reemplaza {{variables}} preguntando cada una (una sola vez por nombre). */
async function fillVariables(body: string): Promise<string | null> {
  const names = Array.from(new Set(Array.from(body.matchAll(VAR_RE), (m) => m[1])));
  const values: Record<string, string> = {};
  for (const n of names) {
    const v = await ask(`Valor para {{${n}}}`, "", { placeholder: n, multiline: true });
    if (v === null) return null;
    values[n] = v;
  }
  return body.replace(VAR_RE, (_, n) => values[n.trim()] ?? "");
}
import { AppState, Project, Prompt, uid } from "../types";
import { copyText, pickFolder, readClipboard } from "../backend";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { pick } from "../dialog";
import { dumpTexts, textFiles } from "../dump";

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
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

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
    if (!t?.trim()) return notify("El portapapeles está vacío");
    const firstLine = t.trim().split("\n")[0].slice(0, 60);
    add(t, firstLine || "Prompt pegado");
  };

  const copy = async (p: Prompt) => {
    const text = await fillVariables(p.body);
    if (text === null) return;
    await copyText(text);
    edit(p.id, (x) => (x.lastUsedAt = Date.now()));
    setCopied(p.id);
    setTimeout(() => setCopied(null), 1200);
  };

  const remove = async (p: Prompt) => {
    if (!(await confirmDlg(`¿Eliminar el prompt "${p.title}"?`, undefined, { danger: true, okLabel: "Eliminar" }))) return;
    update((d) => {
      const pr = d.projects.find((x) => x.id === project.id)!;
      pr.prompts = pr.prompts.filter((x) => x.id !== p.id);
    });
  };

  /** Guarda en una carpeta el texto de cada recuadro del proyecto. */
  const dumpAll = async () => {
    const total = textFiles(project).length;
    if (!total) return notify("No hay textos", "Todavía no escribiste nada en los recuadros de este proyecto.");
    const how = await pick(`Bajar los textos (${total} recuadros con texto)`, [
      { id: "box", label: "Un .txt por recuadro", hint: "Nota / Colección / 01 - Idea.txt — para usar cada prompt suelto" },
      { id: "coll", label: "Un .txt por colección", hint: "todos los recuadros de una colección en un solo archivo" },
    ]);
    if (!how) return;
    const dir = await pickFolder();
    if (!dir) return;
    try {
      const n = await dumpTexts(project, dir, how === "coll");
      notify(`${n} archivo${n === 1 ? "" : "s"} en la carpeta`, dir);
    } catch (e) {
      notify("No se pudieron guardar", String(e));
    }
  };

  const promptMenu = (e: React.MouseEvent, p: Prompt) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Copiar", onClick: () => copy(p) },
        { label: "Editar", onClick: () => setOpenId(p.id) },
        {
          label: "Renombrar",
          onClick: async () => {
            const t = await ask("Título del prompt", p.title);
            if (t !== null) edit(p.id, (x) => (x.title = t.trim()));
          },
        },
        {
          label: "Duplicar",
          onClick: () =>
            update((d) => {
              const pr = d.projects.find((x) => x.id === project.id)!;
              const i = pr.prompts.findIndex((x) => x.id === p.id);
              pr.prompts.splice(i + 1, 0, { id: uid(), title: p.title + " (copia)", body: p.body, updatedAt: Date.now(), lastUsedAt: null });
            }),
        },
        { label: "Eliminar", danger: true, separator: true, onClick: () => remove(p) },
      ],
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
        <button
          className="chip"
          title="Guardar en una carpeta el texto de cada recuadro de este proyecto, como .txt"
          onClick={dumpAll}
        >
          ⤓ Bajar textos…
        </button>
        <button className="chip add" onClick={() => add()}>+ Nuevo</button>
      </div>
      <div
        className="prompt-list"
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest(".prompt")) return;
          e.preventDefault();
          setMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
              { label: "+ Nuevo prompt", onClick: () => add() },
              { label: "Pegar del portapapeles", onClick: fromClipboard },
              { label: "⤓ Bajar los textos del proyecto…", separator: true, onClick: dumpAll },
            ],
          });
        }}
      >
        {ordered.map((p) => {
          const isOpen = openId === p.id;
          return (
            <div key={p.id} className={"prompt" + (p.id === lastId ? " last" : "") + (isOpen ? " open" : "")}>
              <div className="prompt-row" onClick={() => setOpenId(isOpen ? null : p.id)} onContextMenu={(e) => promptMenu(e, p)} title="Clic: abrir · clic derecho: copiar, renombrar, duplicar, eliminar">
                <div className="prompt-meta">
                  <span className="prompt-title">{p.title || "(sin título)"}</span>
                  <span className="prompt-sub">
                    {p.id === lastId ? `Último usado · ${ago(p.lastUsedAt!)}` : p.body.slice(0, 70).replace(/\n/g, " ")}
                    {(() => { const n = new Set(Array.from(p.body.matchAll(VAR_RE), (m) => m[1])).size; return n ? ` · ${n} variable${n === 1 ? "" : "s"}` : ""; })()}
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
                    placeholder={"Texto del prompt… Usá {{variable}} para que te lo pida al copiar."}
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
        {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
        {project.prompts.length === 0 && (
          <div className="empty wide">
            Guardá acá los prompts del proyecto. El último que copies queda marcado arriba.
          </div>
        )}
      </div>
    </div>
  );
}
