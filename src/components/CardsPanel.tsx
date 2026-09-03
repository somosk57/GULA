import { useState } from "react";
import { AppState, Card, CardKind, Project, SceneStatus, uid } from "../types";
import { assetUrl, openPath, pickImage } from "../backend";
import { ask, confirmDlg } from "../dialog";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { MarkdownEditor } from "./MarkdownEditor";
import { useReorder } from "../reorder";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

export const KINDS: { id: CardKind; label: string; plural: string; icon: string; placeholder: string }[] = [
  { id: "character", label: "Personaje", plural: "Personajes", icon: "☺", placeholder: "Quién es, qué quiere, cómo habla" },
  { id: "place", label: "Lugar", plural: "Lugares", icon: "⌂", placeholder: "Cómo es, qué pasa ahí, qué transmite" },
  { id: "item", label: "Objeto", plural: "Objetos", icon: "◆", placeholder: "Qué es, quién lo tiene, por qué importa" },
  { id: "scene", label: "Escena", plural: "Escenas", icon: "▤", placeholder: "Qué pasa, quién está, qué cambia al final" },
];

const STATUS: { id: SceneStatus; label: string }[] = [
  { id: "idea", label: "Idea" },
  { id: "draft", label: "Borrador" },
  { id: "done", label: "Lista" },
];

/** Fichas de la biblia: personajes, lugares, objetos y escenas, con imagen de referencia. */
export function CardsPanel({ project, update }: Props) {
  const [kind, setKind] = useState<CardKind | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const edit = (id: string, fn: (c: Card) => void) =>
    update((d) => {
      fn(d.projects.find((p) => p.id === project.id)!.cards.find((c) => c.id === id)!);
    });

  const add = async (k: CardKind) => {
    const meta = KINDS.find((x) => x.id === k)!;
    const name = await ask(`Nuevo ${meta.label.toLowerCase()}`, "", { placeholder: k === "scene" ? "Ej: La llegada al puerto" : "Nombre" });
    if (!name?.trim()) return;
    const id = uid();
    update((d) => {
      d.projects.find((p) => p.id === project.id)!.cards.push({
        id, kind: k, name: name.trim(), summary: "", body: "", inContext: k !== "scene",
        status: k === "scene" ? "idea" : undefined,
      });
    });
    setOpenId(id);
  };

  const gridRef = useReorder<HTMLDivElement>({
    item: ".card",
    axis: "xy",
    onDrop: (dragId, overId, before) =>
      update((d) => {
        const cs = d.projects.find((p) => p.id === project.id)!.cards;
        const from = cs.findIndex((c) => c.id === dragId);
        if (from < 0) return;
        const [c] = cs.splice(from, 1);
        const over = cs.findIndex((x) => x.id === overId);
        cs.splice(over < 0 ? cs.length : before ? over : over + 1, 0, c);
      }),
  });

  const cardMenu = (e: React.MouseEvent, c: Card) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Abrir", onClick: () => setOpenId(c.id) },
        {
          label: "Renombrar",
          onClick: async () => {
            const t = await ask("Nombre", c.name);
            if (t?.trim()) edit(c.id, (x) => (x.name = t.trim()));
          },
        },
        { label: c.inContext ? "Sacar de Copiar para la IA" : "Incluir en Copiar para la IA", onClick: () => edit(c.id, (x) => (x.inContext = !x.inContext)) },
        {
          label: "Duplicar",
          onClick: () =>
            update((d) => {
              const cs = d.projects.find((p) => p.id === project.id)!.cards;
              const i = cs.findIndex((x) => x.id === c.id);
              cs.splice(i + 1, 0, { ...c, id: uid(), name: c.name + " (copia)" });
            }),
        },
        {
          label: "Eliminar",
          danger: true,
          separator: true,
          onClick: async () => {
            if (!(await confirmDlg(`¿Eliminar "${c.name}"?`, undefined, { danger: true, okLabel: "Eliminar" }))) return;
            update((d) => {
              const p = d.projects.find((p) => p.id === project.id)!;
              p.cards = p.cards.filter((x) => x.id !== c.id);
            });
            if (openId === c.id) setOpenId(null);
          },
        },
      ],
    });
  };

  const open = project.cards.find((c) => c.id === openId);
  if (open) return <CardEditor card={open} project={project} edit={edit} onBack={() => setOpenId(null)} />;

  const shown = project.cards.filter((c) => kind === "all" || c.kind === kind);
  const counts = Object.fromEntries(KINDS.map((k) => [k.id, project.cards.filter((c) => c.kind === k.id).length]));

  return (
    <div className="cards">
      <div className="panel-actions">
        <button className={"chip" + (kind === "all" ? " on" : "")} onClick={() => setKind("all")}>Todo</button>
        {KINDS.map((k) => (
          <button key={k.id} className={"chip" + (kind === k.id ? " on" : "")} onClick={() => setKind(k.id)}>
            {k.plural}{counts[k.id] ? ` ${counts[k.id]}` : ""}
          </button>
        ))}
        <button
          className="chip add"
          onClick={(e) =>
            setMenu({ x: e.clientX, y: e.clientY, items: KINDS.map((k) => ({ label: `${k.icon}  ${k.label}`, onClick: () => add(k.id) })) })
          }
        >
          + Ficha
        </button>
      </div>
      <div className="card-grid" ref={gridRef}>
        {shown.map((c) => {
          const meta = KINDS.find((k) => k.id === c.kind)!;
          return (
            <button key={c.id} data-id={c.id} className={"card" + (c.inContext ? "" : " off")} onClick={() => setOpenId(c.id)} onContextMenu={(e) => cardMenu(e, c)} title={c.summary || meta.placeholder}>
              {c.image ? (
                <img className="card-img" src={assetUrl(c.image)} alt="" draggable={false} />
              ) : (
                <div className="card-img placeholder">{meta.icon}</div>
              )}
              <div className="card-body">
                <div className="card-name">{c.name}</div>
                <div className="card-sub">
                  {c.kind === "scene" ? <span className={"status " + c.status}>{STATUS.find((s) => s.id === c.status)?.label}</span> : <span className="card-kind">{meta.label}</span>}
                  {c.summary && <span className="card-summary"> · {c.summary}</span>}
                </div>
              </div>
            </button>
          );
        })}
        {shown.length === 0 && (
          <div className="empty wide">
            {project.cards.length === 0
              ? "La biblia del proyecto: personajes, lugares, objetos y escenas, con imagen de referencia. Los que estén encendidos van resumidos en \"Copiar para la IA\"."
              : "Nada en esta categoría."}
          </div>
        )}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function CardEditor({ card, project, edit, onBack }: { card: Card; project: Project; edit: (id: string, fn: (c: Card) => void) => void; onBack: () => void }) {
  const meta = KINDS.find((k) => k.id === card.kind)!;
  const names = project.cards.filter((c) => c.kind !== "scene" && c.id !== card.id).map((c) => c.name);
  return (
    <div className="card-editor">
      <div className="panel-actions">
        <button className="chip" onClick={onBack}>← Fichas</button>
        <span className="prompt-sub">{meta.label}</span>
        {card.kind === "scene" && (
          <span className="seg">
            {STATUS.map((s) => (
              <button key={s.id} className={"seg-btn" + (card.status === s.id ? " on" : "")} onClick={() => edit(card.id, (c) => (c.status = s.id))}>{s.label}</button>
            ))}
          </span>
        )}
        <label className="chip toggle-chip" title="Nombre + resumen van en Copiar para la IA">
          <input type="checkbox" checked={card.inContext} onChange={() => edit(card.id, (c) => (c.inContext = !c.inContext))} /> Para la IA
        </label>
      </div>
      <div className="card-editor-body">
        <div className="card-side">
          {card.image ? (
            <img className="card-big" src={assetUrl(card.image)} alt="" onClick={() => openPath(card.image!)} title="Abrir imagen" />
          ) : (
            <div className="card-big placeholder">{meta.icon}</div>
          )}
          <div className="card-side-actions">
            <button className="chip" onClick={async () => { const p = await pickImage(); if (p) edit(card.id, (c) => (c.image = p)); }}>
              {card.image ? "Cambiar imagen" : "Imagen…"}
            </button>
            {card.image && <button className="chip" onClick={() => edit(card.id, (c) => (c.image = undefined))}>Quitar</button>}
          </div>
          {card.kind === "scene" && names.length > 0 && (
            <div className="card-tags">
              <div className="prompt-sub">Aparecen:</div>
              {names.map((n) => {
                const on = card.tags?.includes(n);
                return (
                  <button key={n} className={"chip tiny" + (on ? " on" : "")} onClick={() => edit(card.id, (c) => { const t = new Set(c.tags ?? []); on ? t.delete(n) : t.add(n); c.tags = [...t]; })}>
                    {n}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="card-main">
          <input className="card-title-input" value={card.name} onChange={(e) => edit(card.id, (c) => (c.name = e.target.value))} placeholder="Nombre" spellCheck={false} />
          <input
            className="card-summary-input"
            value={card.summary}
            onChange={(e) => edit(card.id, (c) => (c.summary = e.target.value))}
            placeholder={`En una línea (esto es lo que ve la IA): ${meta.placeholder.toLowerCase()}`}
            spellCheck={false}
          />
          <MarkdownEditor key={card.id} value={card.body} onChange={(v) => edit(card.id, (c) => (c.body = v))} placeholder="Detalle largo: historia, apariencia, notas… (no se copia a la IA)" compact />
        </div>
      </div>
    </div>
  );
}
