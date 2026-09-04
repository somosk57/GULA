import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Tab } from "../types";

interface Hit {
  id: string;
  kind: "note" | "prompt" | "snippet" | "link" | "project" | "card";
  projectId: string;
  projectName: string;
  title: string;
  snippet: string;
  noteId?: string;
  tab?: Tab;
}

const KIND_LABEL: Record<Hit["kind"], string> = {
  note: "nota",
  prompt: "prompt",
  snippet: "comando",
  link: "acceso",
  project: "proyecto",
  card: "ficha",
};

function excerpt(body: string, q: string) {
  const i = body.toLowerCase().indexOf(q);
  if (i < 0) return body.slice(0, 80).replace(/\n/g, " ");
  const start = Math.max(0, i - 30);
  return (start > 0 ? "…" : "") + body.slice(start, i + q.length + 50).replace(/\n/g, " ");
}

/** Busca en todos los proyectos: notas, prompts, comandos, accesos. */
export function search(state: AppState, query: string): Hit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: Hit[] = [];
  const has = (...xs: (string | undefined)[]) => xs.some((x) => x?.toLowerCase().includes(q));
  for (const p of state.projects) {
    if (has(p.name)) hits.push({ id: "p" + p.id, kind: "project", projectId: p.id, projectName: p.name, title: p.name, snippet: `${p.notes.length} notas` });
    for (const n of p.notes)
      if (has(n.title, n.body))
        hits.push({ id: n.id, kind: "note", projectId: p.id, projectName: p.name, title: n.title, snippet: excerpt(n.body, q), noteId: n.id });
    for (const x of p.prompts)
      if (has(x.title, x.body))
        hits.push({ id: x.id, kind: "prompt", projectId: p.id, projectName: p.name, title: x.title, snippet: excerpt(x.body, q), tab: "prompts" });
    for (const x of p.snippets)
      if (has(x.title, x.body))
        hits.push({ id: x.id, kind: "snippet", projectId: p.id, projectName: p.name, title: x.title, snippet: x.body, tab: "snippets" });
    for (const x of p.cards)
      if (has(x.name, x.summary, x.body))
        hits.push({ id: x.id, kind: "card", projectId: p.id, projectName: p.name, title: x.name, snippet: x.summary || excerpt(x.body, q), tab: "cards" });
    for (const x of p.links)
      if (has(x.name, x.path))
        hits.push({ id: x.id, kind: "link", projectId: p.id, projectName: p.name, title: x.name, snippet: x.path, tab: "links" });
  }
  return hits.slice(0, 40);
}

interface Props {
  state: AppState;
  onClose: () => void;
  onGo: (hit: Hit) => void;
}

export function SearchPalette({ state, onClose, onGo }: Props) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => search(state, q), [state, q]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => setSel(0), [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, hits.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && hits[sel]) { onGo(hits[sel]); onClose(); }
  };

  return (
    <div className="dlg-backdrop palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={onKey}>
      <div className="palette">
        <input
          ref={inputRef}
          className="palette-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar en todos los proyectos…"
          spellCheck={false}
        />
        <div className="palette-list">
          {hits.map((h, i) => (
            <button
              key={h.kind + h.id}
              className={"palette-hit" + (i === sel ? " sel" : "")}
              onMouseEnter={() => setSel(i)}
              onClick={() => { onGo(h); onClose(); }}
            >
              <span className="palette-kind">{KIND_LABEL[h.kind]}</span>
              <span className="palette-main">
                <span className="palette-title">{h.title}</span>
                <span className="palette-snip">{h.snippet}</span>
              </span>
              <span className="palette-proj">{h.projectName}</span>
            </button>
          ))}
          {q && hits.length === 0 && <div className="empty">Nada con “{q}”.</div>}
          {!q && <div className="empty">Escribí para buscar en notas, prompts, comandos y accesos de todos los proyectos.</div>}
        </div>
      </div>
    </div>
  );
}

export type { Hit };
