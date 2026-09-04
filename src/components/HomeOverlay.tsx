import { useEffect, useMemo } from "react";
import { AppState, Note, Project, STAGES } from "../types";
import { collectTasks, fmtDate } from "../ai";
import { collectMedia } from "./GalleryPanel";
import { assetUrl } from "../backend";

interface Props {
  state: AppState;
  onClose: () => void;
  onGo: (projectId: string, noteId?: string) => void;
}

const DAY = 86_400_000;
const srcOf = (s: string) => (/^(https?:|data:)/i.test(s) ? s : assetUrl(s));

/** "Hoy": qué pasó en todos los proyectos, qué está en marcha, y las últimas entradas. */
export function HomeOverlay({ state, onClose, onGo }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const since = Date.now() - 7 * DAY;
  const projects = useMemo(
    () =>
      [...state.projects]
        .map((p) => {
          const lastLog = [...p.log].sort((a, b) => b.at - a.at)[0];
          const touched = Math.max(p.lastSessionAt ?? 0, lastLog?.at ?? 0, ...p.notes.map((n) => n.updatedAt));
          const pending = collectTasks(p).filter((t) => !t.done).length;
          const thumb = collectMedia(p).find((m) => m.kind === "image")?.src ?? null;
          return { p, lastLog, touched, pending, thumb };
        })
        .sort((a, b) => b.touched - a.touched),
    [state.projects],
  );

  const recent = useMemo(() => {
    const all: { n: Note; p: Project }[] = [];
    for (const p of state.projects) for (const n of p.notes) if (n.updatedAt >= since) all.push({ n, p });
    return all.sort((a, b) => b.n.updatedAt - a.n.updatedAt).slice(0, 24);
  }, [state.projects, since]);

  const active = projects.filter((x) => x.p.stage === "active");
  const others = projects.filter((x) => x.p.stage !== "active");

  const Row = ({ p, lastLog, touched, pending, thumb }: (typeof projects)[number]) => (
    <button className="home-proj" onClick={() => { onGo(p.id); onClose(); }}>
      {thumb ? <img className="home-thumb" src={srcOf(thumb)} alt="" /> : <div className="home-thumb placeholder">{p.name.slice(0, 1)}</div>}
      <div className="home-main">
        <div className="home-title">
          {p.name} <span className={"stage mini " + p.stage}>{STAGES.find((s) => s.id === p.stage)?.label}</span>
        </div>
        <div className="home-now">{p.now || lastLog?.text || "sin avances anotados"}</div>
      </div>
      <div className="home-meta">
        {pending > 0 && <span className="proj-pending">{pending} pend.</span>}
        <span>{touched ? fmtDate(touched) : ""}</span>
      </div>
    </button>
  );

  return (
    <div className="dlg-backdrop home-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="home">
        <div className="home-head">
          <span className="home-h">Hoy</span>
          <span className="prompt-sub">{state.projects.length} proyecto{state.projects.length === 1 ? "" : "s"} · Esc para cerrar</span>
        </div>
        <div className="home-cols">
          <div className="home-col">
            <div className="group-name">En marcha</div>
            {active.map((x) => <Row key={x.p.id} {...x} />)}
            {active.length === 0 && <div className="empty">Ningún proyecto en marcha. Cambiá la etapa desde la barra izquierda.</div>}
            {others.length > 0 && <div className="group-name" style={{ marginTop: 12 }}>Los demás</div>}
            {others.map((x) => <Row key={x.p.id} {...x} />)}
          </div>
          <div className="home-col">
            <div className="group-name">Últimos 7 días</div>
            {recent.map(({ n, p }) => {
              const media = collectMedia({ ...p, notes: [n] });
              const img = media.find((m) => m.kind === "image")?.src;
              return (
                <button key={n.id} className="home-note" onClick={() => { onGo(p.id, n.id); onClose(); }}>
                  {img ? <img className="home-thumb small" src={srcOf(img)} alt="" /> : <span className="hash">#</span>}
                  <span className="home-note-title">{n.title}</span>
                  <span className="home-note-proj">{p.name}</span>
                  <span className="when">{fmtDate(n.updatedAt)}</span>
                </button>
              );
            })}
            {recent.length === 0 && <div className="empty">Nada en la última semana.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
