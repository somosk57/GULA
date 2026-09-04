import { AppState, Project, STAGES } from "../types";
import { collectMedia } from "./GalleryPanel";
import { assetUrl } from "../backend";
import { collectTasks } from "../ai";

interface Props {
  state: AppState;
  update: (fn: (d: AppState) => void) => void;
  onAdd: () => void;
}

const srcOf = (s: string) => (/^(https?:|data:)/i.test(s) ? s : assetUrl(s));

/** Columna de proyectos (como los servidores de Discord): un clic y estás en otro proyecto. */
export function ProjectRail({ state, update, onAdd }: Props) {
  return (
    <nav className="rail" aria-label="Proyectos">
      {state.projects.map((p, i) => (
        <RailItem key={p.id} p={p} index={i} active={p.id === state.activeProjectId} onClick={() => update((d) => (d.activeProjectId = p.id))} />
      ))}
      <button className="rail-item add" onClick={onAdd} title="Nuevo proyecto">+</button>
    </nav>
  );
}

function RailItem({ p, index, active, onClick }: { p: Project; index: number; active: boolean; onClick: () => void }) {
  const thumb = collectMedia(p).find((m) => m.kind === "image" && (p.marks[m.src] === "master"))?.src ?? collectMedia(p).find((m) => m.kind === "image")?.src ?? null;
  const pending = collectTasks(p).filter((t) => !t.done).length;
  const initials = p.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <button
      className={"rail-item" + (active ? " active" : "") + " " + p.stage}
      onClick={onClick}
      title={`${p.name} · ${STAGES.find((s) => s.id === p.stage)?.label}${p.now ? `\n${p.now}` : ""}${index < 9 ? `\nCtrl+Shift+${index + 1}` : ""}`}
    >
      {thumb ? <img src={srcOf(thumb)} alt="" draggable={false} /> : <span>{initials}</span>}
      {p.sessionStartedAt && <span className="rail-dot" />}
      {pending > 0 && <span className="rail-badge">{pending > 9 ? "9+" : pending}</span>}
    </button>
  );
}
