import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  separator?: boolean;
  /** Punto de color a la izquierda (marcas). */
  color?: string;
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
        <div key={i}>
          {it.separator && <div className="ctx-sep" />}
          <button
            className={"ctx-item" + (it.danger ? " danger" : "")}
            onClick={() => {
              it.onClick();
              onClose();
            }}
          >
            {it.color && <span className="ctx-dot" style={{ background: it.color }} />}
            {it.label}
          </button>
        </div>
      ))}
    </div>
  );
}
