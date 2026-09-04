// Editor markdown "en vivo": los títulos se ven grandes, la negrita en negrita,
// las casillas son casillas clickeables, y los marcadores (#, **, - [ ]) siguen
// visibles pero atenuados. Sin cambiar de modo para ver el resultado.
import { useEffect, useRef } from "react";
import { EditorState, RangeSetBuilder, Compartment, StateField, StateEffect } from "@codemirror/state";
import { MARKS, Mark } from "../types";
import {
  EditorView, keymap, Decoration, DecorationSet, ViewPlugin, ViewUpdate, WidgetType,
  placeholder as cmPlaceholder, drawSelection, highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { assetUrl, isAudioPath, isImagePath, isVideoPath, saveImage } from "../backend";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Tipografía más chica (para columnas). */
  compact?: boolean;
  /** Recibe la vista para insertar cosas desde afuera (imágenes). */
  onReady?: (v: EditorView) => void;
  /** Marcas por archivo y callback para cambiarlas (puntitos sobre la imagen). */
  marks?: Record<string, Mark>;
  onMark?: (src: string, mark: Mark | null) => void;
}

// Marcas: viven en un StateField para que las decoraciones se rehagan al cambiar.
const setMarks = StateEffect.define<Record<string, Mark>>();
const marksField = StateField.define<Record<string, Mark>>({
  create: () => ({}),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setMarks)) return e.value;
    return v;
  },
});
let markHandler: ((src: string, mark: Mark | null) => void) | null = null;

// ---- Estilo del markdown ----
const mdHighlight = HighlightStyle.define([
  { tag: t.heading1, class: "cm-h1" },
  { tag: t.heading2, class: "cm-h2" },
  { tag: t.heading3, class: "cm-h3" },
  { tag: t.heading4, class: "cm-h3" },
  { tag: t.strong, class: "cm-strong" },
  { tag: t.emphasis, class: "cm-em" },
  { tag: t.strikethrough, class: "cm-strike" },
  { tag: t.monospace, class: "cm-code" },
  { tag: t.link, class: "cm-link" },
  { tag: t.url, class: "cm-url" },
  { tag: t.quote, class: "cm-quote" },
  { tag: t.processingInstruction, class: "cm-marker" }, // #, **, -, >, `
  { tag: t.list, class: "cm-list" },
  { tag: t.contentSeparator, class: "cm-hr" },
]);

// ---- Casillas clickeables ----
class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly from: number) { super(); }
  eq(o: CheckboxWidget) { return o.checked === this.checked && o.from === this.from; }
  toDOM() {
    const el = document.createElement("span");
    el.className = "cm-checkbox" + (this.checked ? " checked" : "");
    el.setAttribute("data-from", String(this.from));
    el.title = this.checked ? "Marcar pendiente" : "Marcar hecha";
    return el;
  }
  ignoreEvent() { return false; }
}

const TASK_RE = /^(\s*[-*+]\s+)\[([ xX])\]/;

const checkboxPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView) {
      const b = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        for (let pos = from; pos <= to;) {
          const line = view.state.doc.lineAt(pos);
          const m = line.text.match(TASK_RE);
          if (m) {
            const start = line.from + m[1].length;
            b.add(start, start + 3, Decoration.replace({ widget: new CheckboxWidget(m[2] !== " ", start) }));
          }
          pos = line.to + 1;
        }
      }
      return b.finish();
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(e, view) {
        const el = (e.target as HTMLElement).closest?.(".cm-checkbox") as HTMLElement | null;
        if (!el) return false;
        const from = Number(el.getAttribute("data-from"));
        const cur = view.state.doc.sliceString(from, from + 3);
        view.dispatch({ changes: { from, to: from + 3, insert: cur === "[ ]" ? "[x]" : "[ ]" } });
        e.preventDefault();
        return true;
      },
    },
  },
);

// ---- Imágenes: ![alt](ruta o url) muestra la imagen debajo de la línea ----
// Acepta `![](<ruta con espacios>)`, `![](ruta)` y, si la línea es solo la imagen, rutas con espacios sin <>.
const IMG_RE_ANGLE = /!\[[^\]]*\]\(<([^>]+)>\)/;
const IMG_RE_STRICT = /!\[[^\]]*\]\((\S+?)\)(?=\s|$)/;
const IMG_RE_LOOSE = /^\s*!\[[^\]]*\]\((.+)\)\s*$/;
export function matchImage(line: string): string | null {
  const m = line.match(IMG_RE_ANGLE) ?? line.match(IMG_RE_STRICT) ?? line.match(IMG_RE_LOOSE);
  return m ? m[1].trim() : null;
}

function imageSrc(src: string) {
  if (/^(https?:|data:|asset:|http:\/\/asset\.)/i.test(src)) return src;
  return assetUrl(src.replace(/^file:\/\/\/?/, ""));
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly mark: Mark | null) { super(); }
  eq(o: ImageWidget) { return o.src === this.src && o.mark === this.mark; }
  toDOM() {
    const wrap = document.createElement("div");
    wrap.className = "cm-image" + (this.mark ? " marked mark-" + this.mark : "");
    // Puntitos para marcar: azul maestro, verde sirve, amarillo más o menos, rojo no.
    const dots = document.createElement("div");
    dots.className = "cm-marks";
    for (const m of MARKS) {
      const d = document.createElement("button");
      d.className = "cm-mark" + (this.mark === m.id ? " on" : "");
      d.style.background = m.color;
      d.title = m.label + (this.mark === m.id ? " (clic para quitar)" : "");
      d.onmousedown = (ev) => { ev.preventDefault(); ev.stopPropagation(); markHandler?.(this.src, this.mark === m.id ? null : m.id); };
      dots.appendChild(d);
    }
    wrap.appendChild(dots);
    const el = isVideoPath(this.src)
      ? document.createElement("video")
      : isAudioPath(this.src)
        ? document.createElement("audio")
        : document.createElement("img");
    el.src = imageSrc(this.src);
    if (el instanceof HTMLMediaElement) {
      el.controls = true;
      el.preload = "metadata";
      if (el instanceof HTMLAudioElement) {
        wrap.classList.add("audio");
        const name = document.createElement("div");
        name.className = "cm-audio-name";
        name.textContent = "♪ " + this.src.split(/[\\/]/).pop();
        wrap.appendChild(name);
      }
    } else {
      el.alt = "";
    }
    el.draggable = false;
    el.onerror = () => {
      wrap.classList.add("broken");
      wrap.textContent = (el instanceof HTMLMediaElement ? "No se puede reproducir (¿formato no soportado? probá .mp4 H.264 o .mp3): " : "No se encuentra el archivo: ") + this.src;
    };
    wrap.appendChild(el);
    return wrap;
  }
  ignoreEvent() { return true; }
}

function buildImageDecos(state: EditorState) {
  const b = new RangeSetBuilder<Decoration>();
  const marks = state.field(marksField, false) ?? {};
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i);
    const src = matchImage(line.text);
    if (src) b.add(line.to, line.to, Decoration.widget({ widget: new ImageWidget(src, marks[src] ?? null), block: true, side: 1 }));
  }
  return b.finish();
}

// Las decoraciones de bloque tienen que venir de un StateField, no de un ViewPlugin.
const imageField = StateField.define<DecorationSet>({
  create: buildImageDecos,
  update(decos, tr) {
    return tr.docChanged || tr.effects.some((e) => e.is(setMarks)) ? buildImageDecos(tr.state) : decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Inserta `![](ruta)` en la posición del cursor, en su propia línea. */
export function insertImage(view: EditorView, path: string) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const prefix = line.text.trim() ? "\n" : "";
  // Con <> para que las rutas con espacios sean markdown válido.
  const ins = `${prefix}![](<${path}>)\n`;
  view.dispatch({ changes: { from: line.to, insert: ins }, selection: { anchor: line.to + ins.length } });
  view.focus();
}

/** Ctrl+V con una imagen en el portapapeles → se guarda y se inserta. */
const pasteImages = EditorView.domEventHandlers({
  paste(e, view) {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!files.length) return false;
    e.preventDefault();
    saveImage(files[0]).then((p) => insertImage(view, p));
    return true;
  },
});

// ---- Comandos: negrita, cursiva, continuar listas ----
function wrapSelection(view: EditorView, mark: string) {
  const { from, to } = view.state.selection.main;
  const sel = view.state.doc.sliceString(from, to);
  const already = sel.startsWith(mark) && sel.endsWith(mark) && sel.length >= mark.length * 2;
  const insert = already ? sel.slice(mark.length, -mark.length) : mark + (sel || "texto") + mark;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + (already ? 0 : mark.length), head: from + insert.length - (already ? 0 : mark.length) },
  });
  return true;
}

function continueList(view: EditorView) {
  const { from } = view.state.selection.main;
  const line = view.state.doc.lineAt(from);
  const m = line.text.match(/^(\s*)([-*+]\s+(\[[ xX]\]\s+)?|\d+\.\s+)/);
  if (!m) return false;
  const onlyMarker = line.text.trim() === m[0].trim();
  if (onlyMarker) {
    // Enter en ítem vacío → salir de la lista.
    view.dispatch({ changes: { from: line.from, to: line.to, insert: "" } });
    return true;
  }
  let marker = m[0].replace(/\[[xX]\]/, "[ ]");
  const num = marker.match(/^(\s*)(\d+)\./);
  if (num) marker = `${num[1]}${Number(num[2]) + 1}. `;
  const ins = "\n" + marker;
  view.dispatch({ changes: { from, insert: ins }, selection: { anchor: from + ins.length } });
  return true;
}

function toggleTaskLine(view: EditorView) {
  const line = view.state.doc.lineAt(view.state.selection.main.from);
  const m = line.text.match(TASK_RE);
  if (m) {
    const start = line.from + m[1].length;
    view.dispatch({ changes: { from: start, to: start + 3, insert: m[2] === " " ? "[x]" : "[ ]" } });
  } else {
    const lead = line.text.match(/^\s*/)![0].length;
    view.dispatch({ changes: { from: line.from + lead, insert: "- [ ] " } });
  }
  return true;
}

const mdKeymap = keymap.of([
  { key: "Mod-b", run: (v) => wrapSelection(v, "**") },
  { key: "Mod-i", run: (v) => wrapSelection(v, "*") },
  { key: "Mod-`", run: (v) => wrapSelection(v, "`") },
  { key: "Mod-Enter", run: toggleTaskLine },
  { key: "Enter", run: continueList },
]);

const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "14px", backgroundColor: "transparent" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.6", overflow: "auto" },
  ".cm-content": { padding: "0 0 40px", caretColor: "var(--text)" },
  ".cm-line": { padding: "0 2px" },
  "&.cm-focused": { outline: "none" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  "&.cm-focused .cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--bg-hover) 60%, transparent)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent) !important" },
  ".cm-cursor": { borderLeftColor: "var(--text)" },
  ".cm-placeholder": { color: "var(--text-faint)", fontStyle: "normal" },
});

const compactTheme = EditorView.theme({ "&": { fontSize: "13px" } });

export { isImagePath };

export function MarkdownEditor({ value, onChange, placeholder, autoFocus, compact, onReady, marks, onMark }: Props) {
  if (onMark) markHandler = onMark;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const sizeComp = useRef(new Compartment());

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(mdHighlight),
        checkboxPlugin,
        marksField,
        imageField,
        pasteImages,
        mdKeymap,
        keymap.of([indentWithTab, ...historyKeymap, ...defaultKeymap]),
        cmPlaceholder(placeholder ?? ""),
        baseTheme,
        sizeComp.current.of(compact ? compactTheme : []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChangeRef.current(u.state.doc.toString());
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    if (marks) v.dispatch({ effects: setMarks.of(marks) });
    onReady?.(v);
    if (autoFocus) v.focus();
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambios externos (otra nota, deshacer, tareas tildadas desde la pestaña Tareas).
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== value) {
      v.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    view.current?.dispatch({ effects: sizeComp.current.reconfigure(compact ? compactTheme : []) });
  }, [compact]);

  useEffect(() => {
    if (marks) view.current?.dispatch({ effects: setMarks.of(marks) });
  }, [marks]);

  return <div className="mdeditor" ref={host} data-editor="1" />;
}

