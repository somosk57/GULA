import { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import { AppState, Note, Project } from "../types";
import { openUrl } from "../backend";

marked.setOptions({ gfm: true, breaks: true });

interface Props {
  project: Project;
  note: Note;
  update: (fn: (d: AppState) => void) => void;
}

const TASK_RE = /^(\s*[-*+]\s+\[)([ xX])(\])/;

export function Editor({ project, note, update }: Props) {
  const [preview, setPreview] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const setNote = (fn: (n: Note) => void) =>
    update((d) => {
      const n = d.projects.find((p) => p.id === project.id)!.notes.find((n) => n.id === note.id)!;
      fn(n);
      n.updatedAt = Date.now();
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

  // Al cambiar de nota, volver a modo edición si la nota está vacía
  useEffect(() => {
    if (!note.body.trim()) setPreview(false);
  }, [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const html = useMemo(() => (preview ? (marked.parse(note.body) as string).replace(/<input([^>]*)disabled=""/g, "<input$1") : ""), [preview, note.body]);

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
    const lines = note.body.split("\n").map((line) => {
      const m = line.match(TASK_RE);
      if (!m) return line;
      seen++;
      if (seen !== idx) return line;
      return line.replace(TASK_RE, (_, a, x, c) => a + (x === " " ? "x" : " ") + c);
    });
    setNote((n) => (n.body = lines.join("\n")));
  };

  // Tab inserta 2 espacios, Enter continúa listas
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (e.key === "Tab") {
      e.preventDefault();
      const s = ta.selectionStart;
      const v = ta.value.slice(0, s) + "  " + ta.value.slice(ta.selectionEnd);
      setNote((n) => (n.body = v));
      requestAnimationFrame(() => ta.setSelectionRange(s + 2, s + 2));
    } else if (e.key === "Enter" && !e.shiftKey) {
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf("\n", s - 1) + 1;
      const line = ta.value.slice(lineStart, s);
      const m = line.match(/^(\s*)([-*+]\s+(\[[ xX]\]\s+)?|\d+\.\s+)/);
      if (m) {
        const onlyMarker = line.trim() === m[0].trim();
        e.preventDefault();
        if (onlyMarker) {
          // Enter en ítem vacío → salir de la lista
          const v = ta.value.slice(0, lineStart) + ta.value.slice(s);
          setNote((n) => (n.body = v));
          requestAnimationFrame(() => ta.setSelectionRange(lineStart, lineStart));
        } else {
          let marker = m[0].replace(/\[[xX]\]/, "[ ]");
          const num = marker.match(/^(\s*)(\d+)\./);
          if (num) marker = `${num[1]}${Number(num[2]) + 1}. `;
          const ins = "\n" + marker;
          const v = ta.value.slice(0, s) + ins + ta.value.slice(ta.selectionEnd);
          setNote((n) => (n.body = v));
          requestAnimationFrame(() => ta.setSelectionRange(s + ins.length, s + ins.length));
        }
      }
    }
  };

  return (
    <section className="editor">
      <div className="editor-head">
        <input
          className="note-title"
          value={note.title}
          onChange={(e) => setNote((n) => (n.title = e.target.value))}
          placeholder="Título"
          spellCheck={false}
        />
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
      ) : (
        <textarea
          ref={taRef}
          className="body"
          value={note.body}
          onChange={(e) => setNote((n) => (n.body = e.target.value))}
          onKeyDown={onKeyDown}
          placeholder={"Escribí acá…\n\n# Título\n- [ ] tarea\n**negrita**"}
          spellCheck={false}
        />
      )}
    </section>
  );
}
