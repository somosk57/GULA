import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { AppState, Mark, Note, Pane, Project, deriveTitle, syncNote, uid } from "../types";
import { openUrl } from "../backend";
import { MarkdownEditor, insertImage, isImagePath } from "./MarkdownEditor";
import type { EditorView } from "@codemirror/view";
import { assetUrl, copyToDir, pickImage, win } from "../backend";
import { useRef } from "react";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { ask, confirmDlg } from "../dialog";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  project: Project;
  note: Note;
  update: (fn: (d: AppState) => void) => void;
}

export function Editor({ project, note, update }: Props) {
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const views = useRef<Record<string, EditorView>>({});

  // Imagen arrastrada desde el Explorador sobre un recuadro con foco → se inserta ahí.
  useEffect(() => {
    let off: (() => void) | undefined;
    win.onDrop((paths, at) => {
      const media = paths.filter(isImagePath);
      if (!media.length) return;
      // El recuadro que está debajo del mouse al soltar; si no hay, el que tiene foco; si no, el primero.
      let target: EditorView | undefined;
      if (at) {
        const under = document.elementFromPoint(at.x, at.y);
        if (under?.closest(".bottom")) return; // cayó en el panel de abajo: es un acceso, no una imagen de la nota
        const el = under?.closest(".pane, .single");
        const host = el?.querySelector(".cm-editor");
        target = Object.values(views.current).find((v) => v.dom === host);
      }
      target ??= Object.values(views.current).find((v) => v.hasFocus) ?? Object.values(views.current)[0];
      if (!target) return;
      const t = target;
      (async () => {
        for (const m of media) insertImage(t, project.assetsDir ? await copyToDir(m, project.assetsDir).catch(() => m) : m);
      })();
    }).then((f) => (off = f));
    return () => off?.();
  }, [note.id, project.assetsDir]);

  const setNote = (fn: (n: Note) => void) =>
    update((d) => {
      const n = d.projects.find((p) => p.id === project.id)!.notes.find((n) => n.id === note.id)!;
      fn(n);
      syncNote(n);
    });

  const setMark = (src: string, mark: Mark | null) =>
    update((d) => {
      const p = d.projects.find((p) => p.id === project.id)!;
      if (mark) p.marks[src] = mark; else delete p.marks[src];
    });

  const setPane = (paneId: string, fn: (p: Pane) => void) =>
    setNote((n) => {
      fn(n.panes.find((p) => p.id === paneId)!);
      if (n.autoTitle) n.title = deriveTitle(n);
    });

  // Ctrl+E alterna edición / vista
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        setPreview((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!note.body.trim()) setPreview(false);
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(
    () =>
      preview
        ? (marked.parse(note.body) as string)
            .replace(/<input([^>]*)disabled=""/g, "<input$1")
            .replace(/<img src="(?!https?:|data:)([^"]+)"/g, (_, src) => `<img src="${assetUrl(decodeURIComponent(src))}"`)
        : "",
    [preview, note.body],
  );

  // Clic en checkbox del preview → flipear en el markdown original
  const onPreviewClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLAnchorElement && t.href) {
      e.preventDefault();
      openUrl(t.href);
      return;
    }
    if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") return;
    e.preventDefault();
    const boxes = Array.from(e.currentTarget.querySelectorAll("input[type=checkbox]"));
    const idx = boxes.indexOf(t);
    let seen = -1;
    const TASK = /^(\s*[-*+]\s+\[)([ xX])(\])/;
    const lineNo = note.body.split("\n").findIndex((line) => TASK.test(line) && ++seen === idx);
    if (lineNo >= 0) {
      import("../ai").then(({ toggleTaskInNote }) => setNote((n) => toggleTaskInNote(n, lineNo)));
    }
  };

  const applyPreset = (titles: string[]) =>
    setNote((n) => {
      const want = Math.max(1, titles.length);
      if (want === 1) {
        // Volver a una columna: juntar solo los textos reales (sin los "## título" internos).
        if (n.panes.length > 1) {
          const joined = n.panes.map((p) => p.body.trim()).filter(Boolean).join("\n\n");
          n.panes = [{ id: n.panes[0].id, title: "", body: joined }];
        }
        return;
      }
      while (n.panes.length < want) n.panes.push({ id: uid(), title: "", body: "" });
      while (n.panes.length > want) {
        const last = n.panes.pop()!;
        if (last.body.trim()) n.panes[n.panes.length - 1].body += "\n\n" + last.body;
      }
      // Un preset con nombres (Por hacer · Haciendo · Hecho) reemplaza los títulos;
      // uno sin nombres (3 columnas, 6 casillas) respeta los que ya escribiste.
      if (titles.some(Boolean)) titles.forEach((t, i) => (n.panes[i].title = t));
    });

  const paneMenu = (e: React.MouseEvent, p: Pane) => {
    e.preventDefault();
    const i = note.panes.findIndex((x) => x.id === p.id);
    const items: MenuItem[] = [
      {
        label: "Insertar imagen, video o audio…",
        onClick: async () => {
          const picked = await pickImage();
          const v = views.current[p.id];
          if (!picked || !v) return;
          const path = project.assetsDir ? await copyToDir(picked, project.assetsDir).catch(() => picked) : picked;
          insertImage(v, path);
        },
      },
      {
        label: "Renombrar recuadro",
        onClick: async () => {
          const t = await ask("Nombre del recuadro", p.title);
          if (t !== null) setPane(p.id, (x) => (x.title = t.trim()));
        },
      },
      { label: "Mover a la izquierda", onClick: () => setNote((n) => { if (i > 0) [n.panes[i - 1], n.panes[i]] = [n.panes[i], n.panes[i - 1]]; }) },
      { label: "Mover a la derecha", onClick: () => setNote((n) => { if (i < n.panes.length - 1) [n.panes[i + 1], n.panes[i]] = [n.panes[i], n.panes[i + 1]]; }) },
    ];
    if (note.panes.length > 1)
      items.push({
        label: "Quitar recuadro",
        danger: true,
        separator: true,
        onClick: async () => {
          if (p.body.trim() && !(await confirmDlg("¿Quitar este recuadro?", "Su texto pasa al final del recuadro anterior.", { okLabel: "Quitar" }))) return;
          setNote((n) => {
            const j = n.panes.findIndex((x) => x.id === p.id);
            const [gone] = n.panes.splice(j, 1);
            if (gone.body.trim()) n.panes[Math.max(0, j - 1)].body += "\n\n" + gone.body;
          });
        },
      });
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  const count = note.panes.length;
  const cols = count <= 3 ? count : count === 4 ? 2 : 3;

  return (
    <section className="editor">
      <div className="editor-head">
        <input
          className="note-title"
          value={note.title}
          onChange={(e) => setNote((n) => { n.title = e.target.value; n.autoTitle = false; })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              Object.values(views.current)[0]?.focus();
            }
          }}
          placeholder="Título (o escribí abajo y se completa solo)"
          spellCheck={false}
        />
        <button
          className="mode-btn"
          onClick={() => {
            const cycle = [1, 2, 3, 4, 6];
            const next = cycle[(cycle.indexOf(count) + 1) % cycle.length] ?? 1;
            applyPreset(Array(next).fill(""));
          }}
          title="Recuadros: 1 → 2 → 3 → 4 → 6"
        >
          <LayoutIcon n={count} />
        </button>
        <button
          className={"mode-btn" + (preview ? " active" : "")}
          onClick={() => setPreview((v) => !v)}
          title="Alternar vista / edición (Ctrl+E)"
        >
          {preview ? "Editar" : "Vista"}
        </button>
      </div>
      {preview ? (
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} onClick={onPreviewClick} />
      ) : count === 1 ? (
        <div className="single" onContextMenu={(e) => { if ((e.target as HTMLElement).closest(".cm-editor")) paneMenu(e, note.panes[0]); }}>
          <MarkdownEditor
            key={note.id + note.panes[0].id}
            value={note.panes[0].body}
            onChange={(v) => setPane(note.panes[0].id, (p) => (p.body = v))}
            placeholder={"Escribí acá…\n\n# Título\n- [ ] tarea\n**negrita** (Ctrl+B)\n![](imagen.png) muestra una imagen"}
            onReady={(v) => (views.current[note.panes[0].id] = v)}
            marks={project.marks}
            onMark={setMark}
          />
        </div>
      ) : (
        <div className="panes" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {note.panes.map((p, i) => (
            <div key={p.id} className="pane" onContextMenu={(e) => paneMenu(e, p)}>
              <input
                className="pane-title"
                value={p.title}
                onChange={(e) => setPane(p.id, (x) => (x.title = e.target.value))}
                placeholder={`Título ${i + 1}…`}
                spellCheck={false}
              />
              <MarkdownEditor
                key={note.id + p.id}
                value={p.body}
                onChange={(v) => setPane(p.id, (x) => (x.body = v))}
                placeholder="…"
                compact
                onReady={(v) => (views.current[p.id] = v)}
                marks={project.marks}
                onMark={setMark}
              />
            </div>
          ))}
        </div>
      )}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </section>
  );
}

function LayoutIcon({ n }: { n: number }) {
  const cells = n <= 1 ? [[0, 0, 12, 10]] : n === 2 ? [[0, 0, 5.5, 10], [6.5, 0, 5.5, 10]] : n === 3 ? [[0, 0, 3.5, 10], [4.25, 0, 3.5, 10], [8.5, 0, 3.5, 10]]
    : [[0, 0, 3.5, 4.5], [4.25, 0, 3.5, 4.5], [8.5, 0, 3.5, 4.5], [0, 5.5, 3.5, 4.5], [4.25, 5.5, 3.5, 4.5], [8.5, 5.5, 3.5, 4.5]].slice(0, n);
  return (
    <svg width="14" height="12" viewBox="0 0 12 10">
      {cells.map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx="1" fill="currentColor" />)}
    </svg>
  );
}
