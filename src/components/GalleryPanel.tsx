import { useEffect, useMemo, useState } from "react";
import { AppState, MARKS, MARK_ORDER, Mark, Note, Project, markColor } from "../types";
import { assetUrl, isAudioPath, isVideoPath, openPath, revealInExplorer, copyText, pathExists } from "../backend";
import { matchImage } from "./MarkdownEditor";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
  /** Para la galería de todos los proyectos. */
  allProjects?: Project[];
}

interface Item {
  projectId: string;
  src: string;
  kind: "image" | "video" | "audio";
  note: Note;
  paneTitle: string;
  /** El texto que acompaña al resultado: el recuadro "Prompt" si existe, si no el texto del mismo recuadro. */
  prompt: string;
}

/** Todos los resultados (imágenes, videos, audios) de todas las notas, en una grilla. */
export function collectMedia(p: Project): Item[] {
  const out: Item[] = [];
  for (const n of p.notes) {
    const promptPane = n.panes.find((x) => /prompt/i.test(x.title));
    for (const pane of n.panes) {
      for (const line of pane.body.split("\n")) {
        const src = matchImage(line);
        if (!src) continue;
        const kind = isVideoPath(src) ? "video" : isAudioPath(src) ? "audio" : "image";
        const own = pane.body.split("\n").filter((l) => !matchImage(l)).join("\n").trim();
        out.push({ projectId: p.id, src, kind, note: n, paneTitle: pane.title, prompt: (promptPane?.body ?? own).trim() });
      }
    }
  }
  return out;
}

const srcOf = (s: string) => (/^(https?:|data:)/i.test(s) ? s : assetUrl(s));

export function GalleryPanel({ project, update, allProjects }: Props) {
  const [kind, setKind] = useState<"all" | Item["kind"]>("all");
  const [scope, setScope] = useState<"project" | "all">("project");
  const [markFilter, setMarkFilter] = useState<Mark | "all">("all");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const items = useMemo(
    () => (scope === "all" && allProjects ? allProjects.flatMap(collectMedia) : collectMedia(project)),
    [project, allProjects, scope],
  );

  // Detectar archivos que ya no están (movidos o borrados).
  useEffect(() => {
    let alive = true;
    (async () => {
      const bad = new Set<string>();
      for (const it of items) {
        if (/^(https?:|data:)/i.test(it.src)) continue;
        if (!(await pathExists(it.src))) bad.add(it.src);
      }
      if (alive) setBroken(bad);
    })();
    return () => { alive = false; };
  }, [items]);
  const markOf = (it: Item) => (allProjects?.find((p) => p.id === it.projectId) ?? project).marks[it.src] ?? null;
  const setMark = (it: Item, mark: Mark | null) =>
    update((d) => {
      const p = d.projects.find((p) => p.id === it.projectId)!;
      if (mark) p.marks[it.src] = mark; else delete p.marks[it.src];
    });
  const shown = items
    .filter((i) => kind === "all" || i.kind === kind)
    .filter((i) => markFilter === "all" || markOf(i) === markFilter)
    .sort((a, b) => {
      const ra = MARK_ORDER.indexOf(markOf(a) ?? ("zz" as Mark)), rb = MARK_ORDER.indexOf(markOf(b) ?? ("zz" as Mark));
      return (ra < 0 ? 9 : ra) - (rb < 0 ? 9 : rb);
    });
  const markCounts = Object.fromEntries(MARKS.map((m) => [m.id, items.filter((i) => markOf(i) === m.id).length])) as Record<Mark, number>;
  const counts = { image: 0, video: 0, audio: 0 };
  items.forEach((i) => counts[i.kind]++);

  const goTo = (n: Note, projectId = project.id) =>
    update((d) => {
      d.activeProjectId = projectId;
      d.activeNoteId[projectId] = n.id;
    });

  const itemMenu = (e: React.MouseEvent, it: Item) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        ...MARKS.map((m) => ({
          label: `${markOf(it) === m.id ? "● " : "○ "}${m.label}`,
          onClick: () => setMark(it, markOf(it) === m.id ? null : m.id),
        })),
        { label: "Ir a la nota", separator: true, onClick: () => goTo(it.note, it.projectId) },
        { label: "Abrir archivo", onClick: () => openPath(it.src) },
        { label: "Mostrar en Explorador", onClick: () => revealInExplorer(it.src) },
        { label: "Copiar prompt", onClick: () => copyText(it.prompt), separator: true },
        { label: "Copiar ruta", onClick: () => copyText(it.src) },
      ],
    });
  };

  return (
    <div className="gallery">
      <div className="panel-actions">
        {(["all", "image", "video", "audio"] as const).map((k) => (
          <button key={k} className={"chip" + (kind === k ? " on" : "")} onClick={() => setKind(k)}>
            {k === "all" ? `Todo ${items.length}` : k === "image" ? `Imágenes ${counts.image}` : k === "video" ? `Videos ${counts.video}` : `Audios ${counts.audio}`}
          </button>
        ))}
        <span className="mark-filter">
          {MARKS.map((m) => (
            <button
              key={m.id}
              className={"mark-dot" + (markFilter === m.id ? " on" : "")}
              style={{ background: m.color }}
              title={`${m.label}: ${markCounts[m.id]}`}
              onClick={() => setMarkFilter((f) => (f === m.id ? "all" : m.id))}
            >
              {markCounts[m.id] > 0 && <span>{markCounts[m.id]}</span>}
            </button>
          ))}
        </span>
        {broken.size > 0 && <span className="chip broken-chip" title="Archivos que ya no están en su ruta: movidos, renombrados o borrados">⚠ {broken.size} sin archivo</span>}
        {allProjects && allProjects.length > 1 && (
          <button className={"chip add" + (scope === "all" ? " on" : "")} onClick={() => setScope((s) => (s === "all" ? "project" : "all"))}>
            {scope === "all" ? "Todos los proyectos" : "Solo este proyecto"}
          </button>
        )}
      </div>
      <div className="gallery-grid">
        {shown.map((it, i) => (
          <div
            key={it.src + i}
            className={"gitem " + it.kind + (broken.has(it.src) ? " broken" : "") + (markOf(it) ? " marked" : "")}
            style={markOf(it) ? { borderColor: markColor(markOf(it))!, boxShadow: `inset 0 0 0 2px ${markColor(markOf(it))}` } : undefined}
            title={(broken.has(it.src) ? "⚠ No se encuentra el archivo\n" : "") + (it.prompt ? it.prompt.slice(0, 300) + "\n\n" : "") + `— ${it.note.title}${it.paneTitle ? " · " + it.paneTitle : ""}`}
            onClick={() => goTo(it.note, it.projectId)}
            onDoubleClick={() => openPath(it.src)}
            onContextMenu={(e) => itemMenu(e, it)}
          >
            {it.kind === "image" && <img src={srcOf(it.src)} alt="" loading="lazy" draggable={false} />}
            {it.kind === "video" && <video src={srcOf(it.src)} preload="metadata" muted />}
            {it.kind === "audio" && <div className="gaudio">♪<span>{it.src.split(/[\\/]/).pop()}</span></div>}
            <div className="gmarks" onClick={(e) => e.stopPropagation()}>
              {MARKS.map((m) => (
                <button key={m.id} className={"mark-dot tiny" + (markOf(it) === m.id ? " on" : "")} style={{ background: m.color }} title={m.label} onClick={() => setMark(it, markOf(it) === m.id ? null : m.id)} />
              ))}
            </div>
            <div className="gcap">
              <span className="gtitle">{scope === "all" ? `${allProjects?.find((p) => p.id === it.projectId)?.name ?? ""} · ` : ""}{it.note.title}</span>
              {it.prompt && <span className="gprompt">{it.prompt.slice(0, 80)}</span>}
            </div>
          </div>
        ))}
        {shown.length === 0 && (
          <div className="empty wide">Acá aparecen todas las imágenes, videos y audios de las notas del proyecto. Clic: ir a la nota · doble clic: abrir · clic derecho: copiar el prompt.</div>
        )}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
