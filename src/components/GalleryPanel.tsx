import { useMemo, useState } from "react";
import { AppState, Note, Project } from "../types";
import { assetUrl, isAudioPath, isVideoPath, openPath, revealInExplorer, copyText } from "../backend";
import { matchImage } from "./MarkdownEditor";
import { ContextMenu, MenuItem } from "./ContextMenu";

interface Props {
  project: Project;
  update: (fn: (d: AppState) => void) => void;
}

interface Item {
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
        out.push({ src, kind, note: n, paneTitle: pane.title, prompt: (promptPane?.body ?? own).trim() });
      }
    }
  }
  return out;
}

const srcOf = (s: string) => (/^(https?:|data:)/i.test(s) ? s : assetUrl(s));

export function GalleryPanel({ project, update }: Props) {
  const [kind, setKind] = useState<"all" | Item["kind"]>("all");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const items = useMemo(() => collectMedia(project), [project]);
  const shown = items.filter((i) => kind === "all" || i.kind === kind);
  const counts = { image: 0, video: 0, audio: 0 };
  items.forEach((i) => counts[i.kind]++);

  const goTo = (n: Note) => update((d) => (d.activeNoteId[project.id] = n.id));

  const itemMenu = (e: React.MouseEvent, it: Item) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Ir a la nota", onClick: () => goTo(it.note) },
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
      </div>
      <div className="gallery-grid">
        {shown.map((it, i) => (
          <div
            key={it.src + i}
            className={"gitem " + it.kind}
            title={(it.prompt ? it.prompt.slice(0, 300) + "\n\n" : "") + `— ${it.note.title}${it.paneTitle ? " · " + it.paneTitle : ""}`}
            onClick={() => goTo(it.note)}
            onDoubleClick={() => openPath(it.src)}
            onContextMenu={(e) => itemMenu(e, it)}
          >
            {it.kind === "image" && <img src={srcOf(it.src)} alt="" loading="lazy" draggable={false} />}
            {it.kind === "video" && <video src={srcOf(it.src)} preload="metadata" muted />}
            {it.kind === "audio" && <div className="gaudio">♪<span>{it.src.split(/[\\/]/).pop()}</span></div>}
            <div className="gcap">
              <span className="gtitle">{it.note.title}</span>
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
