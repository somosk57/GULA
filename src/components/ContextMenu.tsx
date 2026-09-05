import { useEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  /** No hace falta si el ítem solo abre un submenú. */
  onClick?: () => void;
  danger?: boolean;
  separator?: boolean;
  /** Punto de color a la izquierda (marcas). */
  color?: string;
  /** Si tiene hijos, al pasar el mouse se abre un submenú al costado. */
  items?: MenuItem[];
}

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  // Mantener el menú dentro de la ventana.
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 200),
    top: Math.min(y, window.innerHeight - items.length * 30 - 12),
  };

  return (
    <div className="ctx" style={style} ref={ref}>
      {items.map((it, i) => (
        <Row key={i} it={it} onClose={onClose} />
      ))}
    </div>
  );
}

/** Una fila del menú. Si tiene hijos, el submenú se abre al pasar el mouse. */
function Row({ it, onClose }: { it: MenuItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  const sub = it.items?.length ? it.items : null;
  return (
    <div className={"ctx-row" + (sub ? " has-sub" : "")} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {it.separator && <div className="ctx-sep" />}
      <button
        className={"ctx-item" + (it.danger ? " danger" : "")}
        onClick={() => {
          if (sub) return;
          it.onClick?.();
          onClose();
        }}
      >
        {it.color && <span className="ctx-dot" style={{ background: it.color }} />}
        {it.label}
        {sub && <span className="ctx-arrow">›</span>}
      </button>
      {sub && open && (
        <div className="ctx sub">
          {sub.map((x, j) => (
            <Row key={j} it={x} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}
