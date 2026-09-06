// Reordenar arrastrando con el mouse (sin HTML5 drag&drop, que en Windows
// choca con el arrastre de archivos nativo de Tauri).
import { useEffect, useRef } from "react";

interface Opts {
  /** Selector de los ítems arrastrables dentro del contenedor. */
  item: string;
  /** Atributo con el id del ítem. */
  attr?: string;
  /** Llamado al soltar: id arrastrado, id sobre el que se soltó, y si fue antes o después. */
  onDrop: (dragId: string, overId: string, before: boolean) => void;
  /** Si está, soltar en el centro de un `into` mete el ítem ADENTRO de ese. */
  intoSelector?: string;
  onDropInto?: (dragId: string, targetId: string) => void;
  /** Eje principal: "y" para listas, "xy" para grillas. */
  axis?: "y" | "xy";
}

export function useReorder<T extends HTMLElement>(opts: Opts) {
  const ref = useRef<T>(null);
  const o = useRef(opts);
  o.current = opts;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const attr = o.current.attr ?? "data-id";
    let dragEl: HTMLElement | null = null;
    let startX = 0, startY = 0, active = false;
    let ghost: HTMLElement | null = null;
    let marker: HTMLElement | null = null;
    let over: { id: string; before: boolean } | null = null;
    let into: HTMLElement | null = null;

    const items = () => Array.from(root.querySelectorAll<HTMLElement>(o.current.item));

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const t = (e.target as HTMLElement).closest<HTMLElement>(o.current.item);
      if (!t || !root.contains(t)) return;
      if ((e.target as HTMLElement).closest("input, textarea, .chip, .coll-copy, .cm-editor, .pane-x, .grip")) return;
      dragEl = t;
      startX = e.clientX; startY = e.clientY; active = false;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    const onMove = (e: MouseEvent) => {
      if (!dragEl) return;
      if (!active) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 6) return;
        active = true;
        document.body.classList.add("reordering");
        ghost = dragEl.cloneNode(true) as HTMLElement;
        ghost.className += " drag-ghost";
        ghost.style.width = dragEl.offsetWidth + "px";
        document.body.appendChild(ghost);
        marker = document.createElement("div");
        marker.className = "drop-marker";
        document.body.appendChild(marker);
        dragEl.classList.add("drag-src");
      }
      ghost!.style.left = e.clientX + 8 + "px";
      ghost!.style.top = e.clientY + 8 + "px";
      over = null;
      let best: { el: HTMLElement; d: number } | null = null;
      for (const el of items()) {
        if (el === dragEl) continue;
        const r = el.getBoundingClientRect();
        const cx = Math.max(r.left, Math.min(e.clientX, r.right));
        const cy = Math.max(r.top, Math.min(e.clientY, r.bottom));
        const d = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (!best || d < best.d) best = { el, d };
      }
      // Soltar en el centro de una colección = meterlo adentro.
      const sel = o.current.intoSelector;
      const underEl = sel ? (document.elementFromPoint(e.clientX, e.clientY)?.closest(sel) as HTMLElement | null) : null;
      const inner =
        underEl && underEl !== dragEl && o.current.onDropInto
          ? (() => {
              const r = underEl.getBoundingClientRect();
              const mx = (e.clientX - r.left) / r.width;
              const my = (e.clientY - r.top) / r.height;
              return mx > 0.25 && mx < 0.75 && my > 0.25 && my < 0.75 ? underEl : null;
            })()
          : null;
      if (into !== inner) { into?.classList.remove("drop-in"); into = inner; into?.classList.add("drop-in"); }
      if (into) { over = null; if (marker) marker.style.display = "none"; return; }
      if (best && best.d < 80) {
        const r = best.el.getBoundingClientRect();
        const before = o.current.axis === "xy"
          ? e.clientX < r.left + r.width / 2
          : e.clientY < r.top + r.height / 2;
        over = { id: best.el.getAttribute(attr) ?? "", before };
        const m = marker!;
        if (o.current.axis === "xy") {
          m.style.left = (before ? r.left - 3 : r.right) + "px";
          m.style.top = r.top + "px";
          m.style.width = "3px";
          m.style.height = r.height + "px";
        } else {
          m.style.left = r.left + "px";
          m.style.top = (before ? r.top - 2 : r.bottom - 1) + "px";
          m.style.width = r.width + "px";
          m.style.height = "3px";
        }
        m.style.display = "block";
      } else if (marker) marker.style.display = "none";
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (active && dragEl) {
        const id = dragEl.getAttribute(attr) ?? "";
        const innerId = into?.getAttribute(attr) ?? "";
        if (id && innerId && id !== innerId) o.current.onDropInto?.(id, innerId);
        else if (id && over && over.id && id !== over.id) o.current.onDrop(id, over.id, over.before);
      }
      if (active) {
        // Evitar que el click de soltar seleccione el ítem.
        const stop = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
        root.addEventListener("click", stop, { capture: true, once: true });
        setTimeout(() => root.removeEventListener("click", stop, { capture: true }), 50);
      }
      into?.classList.remove("drop-in");
      into = null;
      dragEl?.classList.remove("drag-src");
      ghost?.remove(); marker?.remove();
      ghost = null; marker = null; dragEl = null; over = null; active = false;
      document.body.classList.remove("reordering");
    };

    root.addEventListener("mousedown", onDown);
    return () => root.removeEventListener("mousedown", onDown);
  }, []);

  return ref;
}
