import { useEffect, useMemo, useState } from "react";
import { marked } from "marked";
import { AppState, MARKS, Mark, Note, Pane, Project, deriveTitle, markColor, syncNote, uid } from "../types";
import { openUrl } from "../backend";
import { MarkdownEditor, insertImage, isImagePath } from "./MarkdownEditor";
import type { EditorView } from "@codemirror/view";
import { assetUrl, copyToDir, pickImage, win } from "../backend";
import { useRef } from "react";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { ask, confirmDlg } from "../dialog";
import { comboFor, comboFromEvent } from "../keys";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  project: Project;
  note: Note;
  update: (fn: (d: AppState) => void) => void;
  /** Atajos configurados por el usuario. */
  keys?: Record<string, string>;
}

export function Editor({ project, note, update, keys }: Props) {
  const [preview, setPreview] = useState(false);
  const [focusPane, setFocusPane] = useState<string | null>(null);
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
      const copyDir = project.collections.find((c) => c.id === project.copyTo)?.path;
      (async () => {
        for (const m of media) insertImage(t, copyDir ? await copyToDir(m, copyDir).catch(() => m) : m);
      })();
    }).then((f) => (off = f));
    return () => off?.();
  }, [note.id, project.copyTo, project.collections]);

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

  // Atajos de la nota: editar/vista y colección.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = comboFromEvent(e);
      if (!c) return;
      if (c === comboFor(keys, "preview")) {
        e.preventDefault();
        setPreview((v) => !v);
      } else if (c === comboFor(keys, "collection")) {
        e.preventDefault();
        setFocusPane(null);
        setNote((n) => (n.view = n.view === "grid" ? "cols" : "grid"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, note.id, project.id]);

  useEffect(() => {
    if (!note.body.trim()) setPreview(false);
    setFocusPane(null);
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

  const grid = note.view === "grid";
  const hidden = note.hidePaneMarks ?? [];

  const setPaneMark = (paneId: string, mark: Mark | null) =>
    setNote((n) => {
      const p = n.panes.find((x) => x.id === paneId)!;
      if (mark) p.mark = mark; else delete p.mark;
    });

  const toggleHidden = (m: Mark) =>
    setNote((n) => {
      const h = n.hidePaneMarks ?? [];
      n.hidePaneMarks = h.includes(m) ? h.filter((x) => x !== m) : [...h, m];
    });

  const addPane = () => {
    const id = uid();
    setNote((n) => n.panes.push({ id, title: "", body: "" }));
    if (grid) setFocusPane(id);
  };

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
          const copyDir = project.collections.find((c) => c.id === project.copyTo)?.path;
          const path = copyDir ? await copyToDir(picked, copyDir).catch(() => picked) : picked;
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
      ...MARKS.map((m) => ({
        label: p.mark === m.id ? `${m.short} ✓` : m.short,
        color: m.color,
        separator: m.id === "master",
        onClick: () => setPaneMark(p.id, p.mark === m.id ? null : m.id),
      })),
      { label: grid ? "Mover antes" : "Mover a la izquierda", separator: true, onClick: () => setNote((n) => { if (i > 0) [n.panes[i - 1], n.panes[i]] = [n.panes[i], n.panes[i - 1]]; }) },
      { label: grid ? "Mover después" : "Mover a la derecha", onClick: () => setNote((n) => { if (i < n.panes.length - 1) [n.panes[i + 1], n.panes[i]] = [n.panes[i], n.panes[i + 1]]; }) },
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
  const visible = note.panes.filter((p) => !(p.mark && hidden.includes(p.mark)));
  const focused = grid && focusPane ? note.panes.find((p) => p.id === focusPane) ?? null : null;

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
        {!grid && (
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
        )}
        <button
          className={"mode-btn" + (grid ? " active" : "")}
          onClick={() => { setFocusPane(null); setNote((n) => (n.view = n.view === "grid" ? "cols" : "grid")); }}
          title="Colección: cada recuadro es un cuadrado con su título (Ctrl+G)"
        >
          <GridIcon />
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
      ) : grid ? (
        focused ? (
          <div className="pane focused" data-pane={focused.id} onContextMenu={(e) => paneMenu(e, focused!)}>
            <div className="focus-head">
              <button className="chip" onClick={() => setFocusPane(null)}>← Colección</button>
              <input
                className="pane-title"
                value={focused.title}
                onChange={(e) => setPane(focused!.id, (x) => (x.title = e.target.value))}
                placeholder="Título…"
                spellCheck={false}
              />
              {MARKS.map((m) => (
                <button
                  key={m.id}
                  className={"mark-dot" + (focused!.mark === m.id ? " on" : "")}
                  style={{ background: m.color }}
                  title={m.label}
                  onClick={() => setPaneMark(focused!.id, focused!.mark === m.id ? null : m.id)}
                />
              ))}
            </div>
            <MarkdownEditor
              key={note.id + focused.id}
              value={focused.body}
              onChange={(v) => setPane(focused!.id, (x) => (x.body = v))}
              placeholder="Escribí acá…"
              onReady={(v) => (views.current[focused!.id] = v)}
              marks={project.marks}
              onMark={setMark}
            />
          </div>
        ) : (
          <div className="collection">
            <div className="coll-filter">
              {MARKS.map((m) => (
                <button
                  key={m.id}
                  className={"mark-dot" + (hidden.includes(m.id) ? " off" : " on")}
                  style={{ background: m.color }}
                  title={hidden.includes(m.id) ? `Mostrar: ${m.label}` : `Ocultar: ${m.label}`}
                  onClick={() => toggleHidden(m.id)}
                />
              ))}
              <span className="coll-count">{visible.length} de {count}</span>
              <button className="chip" onClick={addPane}>+ Cuadro</button>
            </div>
            <div className="coll-grid">
              {visible.map((p) => (
                <button
                  key={p.id}
                  className="coll-card"
                  style={markColor(p.mark) ? { borderColor: markColor(p.mark)!, boxShadow: `inset 3px 0 0 ${markColor(p.mark)}` } : undefined}
                  onClick={() => setFocusPane(p.id)}
                  onContextMenu={(e) => paneMenu(e, p)}
                  title={p.body.trim().slice(0, 300) || "Vacío"}
                >
                  <span className="coll-title">{paneLabel(p, note.panes.indexOf(p))}</span>
                  {!p.body.trim() && <span className="coll-empty">vacío</span>}
                </button>
              ))}
              <button className="coll-card add" onClick={addPane}>+</button>
            </div>
          </div>
        )
      ) : count === 1 ? (
        <div className="single" data-pane={note.panes[0].id} onContextMenu={(e) => { if ((e.target as HTMLElement).closest(".cm-editor")) paneMenu(e, note.panes[0]); }}>
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
            <div key={p.id} className="pane" data-pane={p.id} onContextMenu={(e) => paneMenu(e, p)}>
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

function GridIcon() {
  return (
    <svg width="14" height="12" viewBox="0 0 12 10">
      {[[0, 0], [4.25, 0], [8.5, 0], [0, 5.5], [4.25, 5.5], [8.5, 5.5]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="3.5" height="4.5" rx="1" fill="none" stroke="currentColor" strokeWidth="1" />
      ))}
    </svg>
  );
}

/** Título que se ve en el cuadrado: el del recuadro, o la primera línea con texto. */
function paneLabel(p: Pane, i: number): string {
  if (p.title.trim()) return p.title.trim();
  for (const raw of p.body.split("\n")) {
    const l = raw.replace(/^\s*(#+\s*|[-*+]\s+(\[[ xX]\]\s*)?|\d+\.\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
    if (l && !/^!\[/.test(raw.trim())) return l.slice(0, 80);
  }
  return `Cuadro ${i + 1}`;
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
