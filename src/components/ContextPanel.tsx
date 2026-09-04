import { useState } from "react";
import { AppState, ContextBlock, Project, uid } from "../types";
import { copyText } from "../backend";
import { buildAiPackage, contextText, estimateTokens } from "../ai";
import { ask, confirmDlg, notify } from "../dialog";
import { closeSession, startSession, fmtMinutes, openInAi } from "../session";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

/**
 * Contexto en bloques. Cada bloque tiene interruptor: los apagados no van en
 * "Copiar para la IA". Arriba, cuántos tokens aproximados tiene el paquete.
 */
export function ContextPanel({ project, update }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(project.blocks.find((b) => !b.body.trim())?.id ?? null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const flash = (k: string) => {
    setCopied(k);
    setTimeout(() => setCopied(null), 1200);
  };

  const edit = (id: string, fn: (b: ContextBlock) => void) =>
    update((d) => {
      fn(d.projects.find((p) => p.id === project.id)!.blocks.find((b) => b.id === id)!);
    });

  const addBlock = async () => {
    const title = await ask("Nuevo bloque de contexto", "", { placeholder: "Ej: Guía de estilo, Stack, Audiencia…" });
    if (!title?.trim()) return;
    const id = uid();
    update((d) => {
      d.projects.find((p) => p.id === project.id)!.blocks.push({ id, title: title.trim(), body: "", enabled: true });
    });
    setOpen(id);
  };

  const blockMenu = (e: React.MouseEvent, b: ContextBlock) => {
    e.preventDefault();
    const i = project.blocks.findIndex((x) => x.id === b.id);
    const move = (dir: -1 | 1) =>
      update((d) => {
        const bs = d.projects.find((p) => p.id === project.id)!.blocks;
        const j = i + dir;
        if (j < 0 || j >= bs.length) return;
        [bs[i], bs[j]] = [bs[j], bs[i]];
      });
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "Renombrar",
          onClick: async () => {
            const t = await ask("Nombre del bloque", b.title);
            if (t?.trim()) edit(b.id, (x) => (x.title = t.trim()));
          },
        },
        { label: "Subir", onClick: () => move(-1) },
        { label: "Bajar", onClick: () => move(1) },
        {
          label: "Eliminar bloque",
          danger: true,
          separator: true,
          onClick: async () => {
            if (!(await confirmDlg(`¿Eliminar el bloque "${b.title}"?`, undefined, { danger: true, okLabel: "Eliminar" }))) return;
            update((d) => {
              const p = d.projects.find((p) => p.id === project.id)!;
              p.blocks = p.blocks.filter((x) => x.id !== b.id);
            });
          },
        },
      ],
    });
  };

  const pkg = buildAiPackage(project);
  const tokens = estimateTokens(pkg);
  const ctxTokens = estimateTokens(contextText(project));
  const on = project.blocks.filter((b) => b.enabled).length;
  const inSession = project.sessionStartedAt != null;
  const elapsed = inSession ? Math.max(1, Math.round((Date.now() - project.sessionStartedAt!) / 60000)) : 0;

  return (
    <div className="context">
      <div className="panel-actions">
        {inSession ? (
          <button className="chip session" onClick={() => closeSession(project, update)} title="Anota qué lograste en la bitácora y cierra la sesión">
            ● Cerrar sesión · {fmtMinutes(elapsed)}
          </button>
        ) : (
          <button className="chip primary" onClick={() => startSession(project, update)} title="Copia el paquete para la IA y empieza a contar el tiempo">
            ▶ Empezar sesión
          </button>
        )}
        <button
          className={"chip" + (copied === "ai" ? " ok" : "")}
          onClick={async () => {
            await copyText(pkg);
            update((d) => (d.projects.find((p) => p.id === project.id)!.lastSessionAt = Date.now()));
            flash("ai");
          }}
          title="Bloques encendidos + tareas pendientes + bitácora reciente + último prompt. Listo para un chat nuevo."
        >
          {copied === "ai" ? "Copiado ✓" : "Copiar para la IA"}
        </button>
        <button
          className="chip"
          onClick={(e) =>
            setMenu({
              x: e.clientX,
              y: e.clientY,
              items: [
                { label: "Claude (claude.ai)", onClick: () => openInAi(project, update, "claude") },
                { label: "ChatGPT (chatgpt.com)", onClick: () => openInAi(project, update, "chatgpt") },
                { label: "Ver el paquete", separator: true, onClick: () => notify("Esto es lo que se copia", pkg) },
              ],
            })
          }
          title="Abre un chat nuevo en el navegador con el paquete ya escrito"
        >
          Abrir en ▾
        </button>
        <span className="prompt-sub tokens" title={`Contexto ≈ ${ctxTokens} tokens · paquete completo ≈ ${tokens} tokens`}>
          ≈ {tokens.toLocaleString("es-AR")} tokens · {on}/{project.blocks.length} bloques
        </span>
        <button className="chip add" onClick={addBlock}>+ Bloque</button>
      </div>
      <div className="block-list">
        {project.blocks.map((b) => {
          const isOpen = open === b.id;
          const t = estimateTokens(b.body);
          return (
            <div key={b.id} className={"block" + (b.enabled ? "" : " off") + (isOpen ? " open" : "")} onContextMenu={(e) => blockMenu(e, b)}>
              <div className="block-head">
                <button
                  className={"switch" + (b.enabled ? " on" : "")}
                  onClick={() => edit(b.id, (x) => (x.enabled = !x.enabled))}
                  title={b.enabled ? "Incluido en Copiar para la IA" : "Excluido de Copiar para la IA"}
                  aria-pressed={b.enabled}
                />
                <button className="block-title" onClick={() => setOpen(isOpen ? null : b.id)}>
                  <span>{b.title}</span>
                  <span className="block-meta">
                    {b.body.trim() ? `≈ ${t} tok` : "vacío"} · {isOpen ? "cerrar" : "editar"}
                  </span>
                </button>
              </div>
              {isOpen ? (
                <textarea
                  className="block-body"
                  value={b.body}
                  onChange={(e) => edit(b.id, (x) => (x.body = e.target.value))}
                  placeholder="Escribí lo que la IA tiene que saber sobre esto…"
                  spellCheck={false}
                  autoFocus
                />
              ) : (
                b.body.trim() && <div className="block-preview" onClick={() => setOpen(b.id)}>{b.body.trim().slice(0, 160).replace(/\n+/g, " · ")}</div>
              )}
            </div>
          );
        })}
        {project.blocks.length === 0 && (
          <div className="empty wide">Agregá bloques: qué es el proyecto, estilo, decisiones, estado. Todo lo que la IA necesita en un chat nuevo.</div>
        )}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
