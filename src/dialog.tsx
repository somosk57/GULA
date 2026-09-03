// Diálogos propios. WebView2 (Windows) no implementa window.prompt(), y
// alert/confirm se ven feos y bloquean; estos reemplazan a los tres.
import { useEffect, useRef, useState } from "react";

type Req =
  | { kind: "ask"; title: string; value: string; placeholder?: string; multiline?: boolean; resolve: (v: string | null) => void }
  | { kind: "confirm"; title: string; body?: string; danger?: boolean; okLabel?: string; resolve: (v: boolean) => void }
  | { kind: "notify"; title: string; body?: string; resolve: () => void }
  | { kind: "pick"; title: string; options: { id: string; label: string; hint?: string }[]; resolve: (v: string | null) => void };

let listeners: ((q: Req[]) => void)[] = [];
let queue: Req[] = [];
const emit = () => listeners.forEach((l) => l([...queue]));
const push = (r: Req) => {
  queue.push(r);
  emit();
};
const pop = () => {
  queue.shift();
  emit();
};

/** Pide un texto. Devuelve null si cancela. */
export function ask(title: string, value = "", opts: { placeholder?: string; multiline?: boolean } = {}) {
  return new Promise<string | null>((resolve) => push({ kind: "ask", title, value, resolve, ...opts }));
}
/** Pregunta sí/no. */
export function confirmDlg(title: string, body?: string, opts: { danger?: boolean; okLabel?: string } = {}) {
  return new Promise<boolean>((resolve) => push({ kind: "confirm", title, body, resolve, ...opts }));
}
/** Aviso con un solo botón. */
export function notify(title: string, body?: string) {
  return new Promise<void>((resolve) => push({ kind: "notify", title, body, resolve }));
}

/** Elegir una opción de una lista. Devuelve el id o null. */
export function pick(title: string, options: { id: string; label: string; hint?: string }[]) {
  return new Promise<string | null>((resolve) => push({ kind: "pick", title, options, resolve }));
}

export function Dialogs() {
  const [q, setQ] = useState<Req[]>([]);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const cur = q[0];

  useEffect(() => {
    const l = (x: Req[]) => setQ(x);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((f) => f !== l);
    };
  }, []);

  useEffect(() => {
    if (cur?.kind === "ask") {
      setText(cur.value);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [cur]);

  if (!cur) return null;

  const done = (v: unknown) => {
    (cur.resolve as (v: unknown) => void)(v);
    pop();
  };
  const cancel = () => done(cur.kind === "ask" || cur.kind === "pick" ? null : cur.kind === "confirm" ? false : undefined);
  const ok = () => done(cur.kind === "ask" ? text : cur.kind === "confirm" ? true : undefined);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") cancel();
    else if (e.key === "Enter" && !(cur.kind === "ask" && cur.multiline && !e.ctrlKey)) {
      e.preventDefault();
      ok();
    }
  };

  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && cancel()} onKeyDown={onKey}>
      <div className="dlg" role="dialog" aria-modal="true">
        <div className="dlg-title">{cur.title}</div>
        {"body" in cur && cur.body && <div className="dlg-body">{cur.body}</div>}
        {cur.kind === "ask" &&
          (cur.multiline ? (
            <textarea ref={inputRef} className="dlg-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={cur.placeholder} rows={4} />
          ) : (
            <input ref={inputRef} className="dlg-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={cur.placeholder} spellCheck={false} />
          ))}
        {cur.kind === "pick" && (
          <div className="dlg-list">
            {cur.options.map((o) => (
              <button key={o.id} className="dlg-opt" onClick={() => done(o.id)}>
                <span>{o.label}</span>
                {o.hint && <span className="dlg-hint">{o.hint}</span>}
              </button>
            ))}
            {cur.options.length === 0 && <div className="dlg-body">No hay opciones.</div>}
          </div>
        )}
        <div className="dlg-actions">
          {cur.kind !== "notify" && <button className="chip" onClick={cancel}>Cancelar</button>}
          {cur.kind !== "pick" && <button
            className={"chip primary" + (cur.kind === "confirm" && cur.danger ? " danger-fill" : "")}
            onClick={ok}
            autoFocus={cur.kind !== "ask"}
            disabled={cur.kind === "ask" && !text.trim()}
          >
            {cur.kind === "confirm" ? cur.okLabel ?? "Aceptar" : cur.kind === "notify" ? "OK" : "Aceptar"}
          </button>}
        </div>
      </div>
    </div>
  );
}
