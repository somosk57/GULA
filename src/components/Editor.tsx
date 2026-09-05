import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { AppState, MARKS, Mark, Note, Pane, Project, deriveTitle, findPane, markColor, syncNote, uid } from "../types";
import { MarkdownEditor, insertImage, isImagePath, matchImage } from "./MarkdownEditor";
import type { EditorView } from "@codemirror/view";
import { assetUrl, copyText, copyToDir, isAudioPath, isVideoPath, openUrl, pickFolder, pickImage, win } from "../backend";
import { ContextMenu, MenuItem } from "./ContextMenu";
import { Thumb } from "./GalleryPanel";
import { ask, confirmDlg, notify } from "../dialog";
import { useReorder } from "../reorder";
import { comboFor, comboFromEvent } from "../keys";
import { dumpPane, paneFiles } from "../dump";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  project: Project;
  note: Note;
  update: (fn: (d: AppState) => void) => void;
  /** Atajos configurados por el usuario. */
  keys?: Record<string, string>;
}

/**
 * Una nota es una de dos cosas, y se elige al crearla:
 *  - "boxes": recuadros (Idea, Prompt, Imagen, Escena…). Un solo nivel.
 *  - "collection": colecciones; adentro de cada una, sus recuadros. Dos niveles.
 * Los recuadros van SIEMPRE ABIERTOS: escribís y pegás sin entrar a ninguno.
 * La grilla de cuadrados existe solo para elegir en qué colección estás
 * trabajando. "+" suma, "−" saca. No hay repartidor de 1 a 6 ni cambio de tipo.
 */
export function Editor({ project, note, update, keys }: Props) {
  const [preview, setPreview] = useState(false);
  /** Colección abierta (solo en notas de colección). */
  const [into, setInto] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [size, setSize] = useState<number>(() => { try { return Number(localStorage.getItem("gula.card")) || 150; } catch { return 150; } });
  const [paneW, setPaneW] = useState<number>(() => { try { return Number(localStorage.getItem("gula.pane")) || 340; } catch { return 340; } });
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const views = useRef<Record<string, EditorView>>({});

  const isCollection = note.kind === "collection";

  // Un solo listener de "archivo soltado" para toda la vida del editor.
  // (Si se re-registra en cada cambio de estado, el archivo entra dos o más veces.)
  const onDropRef = useRef<(paths: string[], at: { x: number; y: number } | null) => void>(() => {});
  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    win.onDrop((paths, at) => onDropRef.current(paths, at)).then((f) => {
      off = f;
      if (dead) f();
    });
    return () => {
      dead = true;
      off?.();
      off = undefined;
    };
  }, []);

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
      const p = findPane(n, paneId);
      if (p) fn(p);
      if (n.autoTitle) n.title = deriveTitle(n);
    });

  // ---- dónde estamos ----
  const parent = isCollection && into ? note.panes.find((p) => p.id === into) ?? null : null;
  /** Los cuadrados que se ven ahora mismo. */
  const level: Pane[] = parent ? parent.panes ?? [] : note.panes;
  /** En este nivel, ¿los cuadrados son colecciones? */
  const levelIsCollections = isCollection && !parent;
  /** La grilla de cuadrados existe solo para elegir colección. Los recuadros van abiertos. */
  const showGrid = levelIsCollections;

  const hidden = note.hidePaneMarks ?? [];
  const needle = q.trim().toLowerCase();
  const visible = level.filter(
    (p) =>
      !(p.mark && hidden.includes(p.mark)) &&
      (!needle ||
        (p.title + "\n" + p.body + "\n" + (p.panes ?? []).map((x) => x.title + "\n" + x.body).join("\n"))
          .toLowerCase()
          .includes(needle)),
  );

  // ---- acciones ----
  const toggleHidden = (m: Mark) =>
    setNote((n) => {
      const h = n.hidePaneMarks ?? [];
      n.hidePaneMarks = h.includes(m) ? h.filter((x) => x !== m) : [...h, m];
    });

  const setPaneMark = (paneId: string, mark: Mark | null) =>
    setPane(paneId, (p) => {
      if (mark) p.mark = mark; else delete p.mark;
    });

  /** La lista del nivel donde estás, dentro del borrador de la nota. */
  const listIn = (n: Note): Pane[] => {
    if (!parent) return n.panes;
    const par = n.panes.find((x) => x.id === parent.id)!;
    par.panes ??= [];
    return par.panes;
  };

  /** Suma un cuadrado en el nivel donde estás. */
  const add = () => {
    const id = uid();
    setNote((n) =>
      listIn(n).push(
        levelIsCollections
          ? { id, title: "", body: "", panes: [{ id: uid(), title: "", body: "" }, { id: uid(), title: "", body: "" }] }
          : { id, title: "", body: "" },
      ),
    );
    if (levelIsCollections) setInto(id);
  };

  const removePane = async (p: Pane) => {
    const inner = p.panes?.length ?? 0;
    const hasText = p.body.trim() || (p.panes ?? []).some((x) => x.body.trim() || x.title.trim());
    if (level.length === 1 && !isCollection) return notify("Es el único recuadro", "Una nota tiene que tener al menos uno.");
    if (
      hasText &&
      !(await confirmDlg(
        p.panes ? `¿Sacar la colección “${p.title.trim() || "sin título"}”?` : "¿Sacar este recuadro?",
        p.panes ? `Se van también sus ${inner} recuadro${inner === 1 ? "" : "s"}. Ctrl+Z lo devuelve.` : "Ctrl+Z lo devuelve.",
        { danger: true, okLabel: "Sacar" },
      ))
    )
      return;
    setNote((n) => {
      const list = listIn(n);
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list.splice(i, 1);
      if (n.panes.length === 0) n.panes.push({ id: uid(), title: "", body: "" });
    });
    if (into === p.id) setInto(null);
  };

  const dupPane = (p: Pane) =>
    setNote((n) => {
      const list = listIn(n);
      const i = list.findIndex((x) => x.id === p.id);
      const copy: Pane = { id: uid(), title: p.title, body: p.body, mark: p.mark };
      if (p.panes) copy.panes = p.panes.map((x) => ({ id: uid(), title: x.title, body: x.body, mark: x.mark }));
      list.splice(i + 1, 0, copy);
    });

  const copyPane = async (p: Pane) => {
    const text = p.panes?.length
      ? p.panes.map((x) => (x.title.trim() ? `## ${x.title.trim()}\n${x.body}` : x.body)).join("\n\n").trim()
      : p.body.trim();
    await copyText(text);
    notify("Copiado", p.title.trim() || "Ya está en el portapapeles.");
  };

  /** Baja a una carpeta todo lo de esa colección (o de ese recuadro): textos y archivos. */
  const downloadPane = async (p: Pane) => {
    const files = paneFiles(p);
    const boxes = p.panes?.length ? p.panes : [p];
    const conTexto = boxes.filter((b) => b.body.trim()).length;
    if (!conTexto && !files.length) return notify("No hay nada que bajar", "Esta colección todavía está vacía.");
    const dir = await pickFolder();
    if (!dir) return;
    if (
      !(await confirmDlg(
        `¿Bajar “${p.title.trim() || paneLabel(p, 0)}”?`,
        `${conTexto} texto${conTexto === 1 ? "" : "s"} y ${files.length} archivo${files.length === 1 ? "" : "s"} van a:\n${dir}\n\nLos originales quedan donde están.`,
        { okLabel: "Bajar" },
      ))
    )
      return;
    try {
      const r = await dumpPane(p, dir);
      notify(
        `${r.texts} texto${r.texts === 1 ? "" : "s"} y ${r.copied} archivo${r.copied === 1 ? "" : "s"} en la carpeta`,
        r.failed.length ? `${r.failed.length} no se pudieron copiar:\n` + r.failed.slice(0, 10).join("\n") : dir,
      );
    } catch (e) {
      notify("No se pudo bajar", String(e));
    }
  };

  /** Arrastrar cuadrados para reordenar el nivel actual. */
  const gridRef = useReorder<HTMLDivElement>({
    item: ".coll-card:not(.add), .pane:not(.add)",
    attr: "data-pane",
    axis: "xy",
    onDrop: (dragId, overId, before) =>
      setNote((n) => {
        const list = listIn(n);
        const from = list.findIndex((x) => x.id === dragId);
        if (from < 0) return;
        const [moved] = list.splice(from, 1);
        const to = list.findIndex((x) => x.id === overId);
        if (to < 0) { list.push(moved); return; }
        list.splice(before ? to : to + 1, 0, moved);
      }),
  });

  // ---- atajos ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = comboFromEvent(e);
      if (!c) return;
      if (c === comboFor(keys, "preview")) {
        e.preventDefault();
        setPreview((v) => !v);
      } else if (e.key === "Escape" && into) {
        e.preventDefault();
        setInto(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys, into]);

  useEffect(() => {
    if (!note.body.trim()) setPreview(false);
    setQ("");
    setInto(null);
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- archivos soltados desde el Explorador ----
  onDropRef.current = (paths, at) => {
    const media = paths.filter(isImagePath);
    if (!media.length) return;
    const copyDir = project.collections.find((c) => c.id === project.copyTo)?.path;
    const write = async (paneId: string) => {
      const lines: string[] = [];
      for (const m of media) lines.push(`![](<${copyDir ? await copyToDir(m, copyDir).catch(() => m) : m}>)`);
      setNote((n) => {
        const p = findPane(n, paneId);
        const target = p?.panes?.length ? p.panes[p.panes.length - 1] : p;
        if (target) target.body = (target.body.trimEnd() ? target.body.trimEnd() + "\n" : "") + lines.join("\n") + "\n";
      });
    };
    if (at) {
      const under = document.elementFromPoint(at.x, at.y);
      if (under?.closest(".bottom")) return; // cayó en el panel de abajo: es un acceso
      const el = under?.closest("[data-pane]") as HTMLElement | null;
      const id = el?.dataset.pane;
      if (id) {
        // Si ese recuadro está abierto, va donde tenés el cursor; si es un cuadrado, al final de su texto.
        const view = views.current[id];
        if (view) {
          (async () => {
            for (const m of media) insertImage(view, copyDir ? await copyToDir(m, copyDir).catch(() => m) : m);
          })();
        } else write(id);
        return;
      }
    }
    // Si no cayó sobre nada en particular: al recuadro donde estabas escribiendo.
    const view = Object.values(views.current).find((v) => v.hasFocus) ?? Object.values(views.current)[0];
    if (view) {
      (async () => {
        for (const m of media) insertImage(view, copyDir ? await copyToDir(m, copyDir).catch(() => m) : m);
      })();
    }
  };

  const paneMenu = (e: React.MouseEvent, p: Pane) => {
    e.preventDefault();
    const items: MenuItem[] = [
      { label: "Copiar el texto", onClick: () => copyPane(p) },
      { label: p.panes ? "⤓ Bajar la colección a una carpeta…" : "⤓ Bajar el recuadro a una carpeta…", onClick: () => downloadPane(p) },
      { label: "Duplicar", onClick: () => dupPane(p) },
      {
        label: p.panes ? "Renombrar la colección" : "Renombrar el recuadro",
        onClick: async () => {
          const t = await ask(p.panes ? "Nombre de la colección" : "Nombre del recuadro", p.title);
          if (t !== null) setPane(p.id, (x) => (x.title = t.trim()));
        },
      },
      ...(p.panes
        ? []
        : [
            {
              label: "Insertar imagen, video o audio…",
              onClick: async () => {
                const picked = await pickImage();
                if (!picked) return;
                const dir = project.collections.find((c) => c.id === project.copyTo)?.path;
                const path = dir ? await copyToDir(picked, dir).catch(() => picked) : picked;
                const v = views.current[p.id];
                if (v) insertImage(v, path);
                else setPane(p.id, (x) => (x.body = (x.body.trimEnd() ? x.body.trimEnd() + "\n" : "") + `![](<${path}>)\n`));
              },
            },
          ]),
      ...MARKS.map((m) => ({
        label: p.mark === m.id ? `${m.short} ✓` : m.short,
        color: m.color,
        separator: m.id === "master",
        onClick: () => setPaneMark(p.id, p.mark === m.id ? null : m.id),
      })),
      { label: "Sacar", danger: true, separator: true, onClick: () => removePane(p) },
    ];
    setMenu({ x: e.clientX, y: e.clientY, items });
  };

  // ---- vista con formato ----
  const html = useMemo(
    () =>
      preview
        ? (marked.parse(note.body) as string)
            .replace(/<input([^>]*)disabled=""/g, "<input$1")
            .replace(/<img src="(?!https?:|data:)([^"]+)"/g, (_, src) => `<img src="${assetUrl(decodeURIComponent(src))}"`)
        : "",
    [preview, note.body],
  );

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
    if (lineNo >= 0) import("../ai").then(({ toggleTaskInNote }) => setNote((n) => toggleTaskInNote(n, lineNo)));
  };

  const addLabel = levelIsCollections ? "+ Colección" : "+ Recuadro";

  return (
    <section className="editor">
      <div className="editor-head">
        <input
          className="note-title"
          value={note.title}
          onChange={(e) => setNote((n) => { n.title = e.target.value; n.autoTitle = false; })}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); Object.values(views.current)[0]?.focus(); } }}
          placeholder="Título (o escribí abajo y se completa solo)"
          spellCheck={false}
        />
        {!preview && (
          <>
            <span className="head-marks">
              {MARKS.map((m) => (
                <button
                  key={m.id}
                  className={"mark-dot" + (hidden.includes(m.id) ? " off" : " on")}
                  style={{ background: m.color }}
                  title={`${hidden.includes(m.id) ? "Mostrar" : "Ocultar"}: ${m.label} · se ven ${visible.length} de ${level.length}`}
                  onClick={() => toggleHidden(m.id)}
                />
              ))}
            </span>
            <input
              className="coll-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Filtrar ${level.length}…`}
              spellCheck={false}
            />
            {showGrid ? (
              <input
                className="coll-size"
                type="range"
                min={110}
                max={280}
                step={10}
                value={size}
                onChange={(e) => { const v = Number(e.target.value); setSize(v); try { localStorage.setItem("gula.card", String(v)); } catch { /* sin localStorage */ } }}
                title="Tamaño de los cuadrados"
              />
            ) : (
              <input
                className="coll-size"
                type="range"
                min={220}
                max={720}
                step={20}
                value={paneW}
                onChange={(e) => { const v = Number(e.target.value); setPaneW(v); try { localStorage.setItem("gula.pane", String(v)); } catch { /* sin localStorage */ } }}
                title="Ancho de los recuadros"
              />
            )}
          </>
        )}
      </div>

      {!preview && parent && (
        <div className="crumbs">
          <button className="crumb" onClick={() => setInto(null)}>Colecciones</button>
          <span className="crumb-sep">›</span>
          <span className="crumb here">{paneLabel(parent, 0)}</span>
          <span className="crumb-hint">Esc vuelve</span>
        </div>
      )}

      {preview ? (
        <div className="md" dangerouslySetInnerHTML={{ __html: html }} onClick={onPreviewClick} />
      ) : showGrid ? (
        <div
          className="coll-grid"
          ref={gridRef}
          style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${size}px, 1fr))`, gridAutoRows: `${size}px` }}
        >
          {visible.map((p) => {
            const media = firstMedia(p);
            const color = markColor(p.mark);
            const inner = p.panes?.length ?? 0;
            return (
              <div
                key={p.id}
                className="coll-card"
                data-pane={p.id}
                style={color ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                onClick={() => setInto(p.id)}
                onContextMenu={(e) => paneMenu(e, p)}
                title={`${inner} recuadro${inner === 1 ? "" : "s"}`}
              >
                {media && <CardMedia media={media} />}
                <button className="coll-x" title="Sacar" onClick={(e) => { e.stopPropagation(); removePane(p); }}>−</button>
                <span className="coll-title">{paneLabel(p, level.indexOf(p))}</span>
                <span className="coll-foot">
                  <span className="coll-kind">{inner} recuadro{inner === 1 ? "" : "s"}</span>
                  {inner > 0 && (
                    <button className="coll-copy" title="Copiar el texto de la colección" onClick={(e) => { e.stopPropagation(); copyPane(p); }}>
                      Copiar
                    </button>
                  )}
                </span>
              </div>
            );
          })}
          {!needle && <button className="coll-card add" onClick={add} title={addLabel}>+</button>}
          {needle && visible.length === 0 && <div className="empty wide">Ninguna colección dice “{q.trim()}”.</div>}
        </div>
      ) : (
        // Los recuadros van abiertos: escribís y pegás sin tener que entrar a ninguno.
        <div className="panes" ref={gridRef} style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${paneW}px, 100%), 1fr))` }}>
          {visible.map((p) => {
            const color = markColor(p.mark);
            return (
              <div
                key={p.id}
                className="pane"
                data-pane={p.id}
                style={color ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
                onContextMenu={(e) => paneMenu(e, p)}
              >
                <div className="pane-head">
                  <input
                    className="pane-title"
                    value={p.title}
                    onChange={(e) => setPane(p.id, (x) => (x.title = e.target.value))}
                    placeholder={`Título ${level.indexOf(p) + 1}…`}
                    spellCheck={false}
                  />
                  <button className="pane-x" title="Sacar este recuadro" onClick={() => removePane(p)}>−</button>
                </div>
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
            );
          })}
          {/* Con dos o más, el "+" es un recuadro más; con uno solo, una barra fina abajo
              para que el texto siga ocupando todo el ancho. */}
          {!needle &&
            (visible.length > 1 ? (
              <button className="pane add" onClick={add} title={addLabel}>+</button>
            ) : (
              <button className="pane add bar" onClick={add} title={addLabel}>+ Recuadro</button>
            ))}
          {needle && visible.length === 0 && <div className="empty wide">Ningún recuadro dice “{q.trim()}”.</div>}
        </div>
      )}
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </section>
  );
}

/** Lo que se ve de fondo en un cuadrado: la imagen, el primer cuadro del video, o la ficha del audio.
 *  El video va como <video> de verdad (igual que adentro del recuadro, donde sí funciona): pinta
 *  su primer cuadro con preload="metadata" y no depende de generar la miniatura en un canvas. */
function CardMedia({ media }: { media: Media }) {
  const [broken, setBroken] = useState(false);
  const name = media.src.split(/[\\/]/).pop() ?? "";
  if (media.image) return <Thumb className="coll-thumb" src={media.src} />;
  if (media.video && !broken)
    return (
      <video
        className="coll-thumb"
        src={assetUrl(media.src)}
        muted
        playsInline
        preload="metadata"
        onError={() => setBroken(true)}
      />
    );
  return (
    <span className={"coll-file" + (media.video ? " video" : "")}>
      <b>{media.video ? "▶" : "♪"}</b>
      <em>{name}</em>
    </span>
  );
}

interface Media { src: string; image: boolean; video: boolean; audio: boolean }

/** Primer archivo que aparece en el cuadrado (para la miniatura). */
function firstMedia(p: Pane): Media | null {
  const bodies = p.panes?.length ? p.panes.map((x) => x.body) : [p.body];
  let fallback: Media | null = null;
  for (const body of bodies)
    for (const raw of body.split("\n")) {
      const src = matchImage(raw.trim());
      if (!src) continue;
      const m = { src, image: !isVideoPath(src) && !isAudioPath(src), video: isVideoPath(src), audio: isAudioPath(src) };
      // Un audio no da miniatura: si más adelante hay una imagen o un video, mejor esa.
      if (!m.audio) return m;
      fallback ??= m;
    }
  return fallback;
}

/** Lo que se lee en el cuadrado: su título, o la primera línea con texto. */
function paneLabel(p: Pane, i: number): string {
  if (p.title.trim()) return p.title.trim();
  const bodies = p.panes?.length ? p.panes.map((x) => x.title || x.body) : [p.body];
  for (const body of bodies)
    for (const raw of body.split("\n")) {
      const l = raw.replace(/^\s*(#+\s*|[-*+]\s+(\[[ xX]\]\s*)?|\d+\.\s+|>\s*)/, "").replace(/[*_`]/g, "").trim();
      if (l && !/^!\[/.test(raw.trim())) return l.slice(0, 80);
    }
  return p.panes ? `Colección ${i + 1}` : `Recuadro ${i + 1}`;
}
