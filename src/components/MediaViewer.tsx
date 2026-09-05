import { useEffect, useState } from "react";
import { assetUrl, copyText, isAudioPath, isVideoPath, openPath, revealInExplorer } from "../backend";
import { ContextMenu, MenuItem } from "./ContextMenu";

const EVENT = "gula:ver-archivo";
const MENU = "gula:menu-archivo";

/** Abre el archivo en grande, desde cualquier lado (el widget de la nota no es React). */
export function openMedia(src: string) {
  if (isAudioPath(src)) return; // un audio ya se escucha en el recuadro
  window.dispatchEvent(new CustomEvent(EVENT, { detail: src }));
}

/** Clic derecho sobre un archivo de la nota: abre el menú de la app, no el del WebView. */
export function openMediaMenu(src: string, x: number, y: number) {
  window.dispatchEvent(new CustomEvent(MENU, { detail: { src, x, y } }));
}

const url = (s: string) => (/^(https?:|data:)/i.test(s) ? s : assetUrl(s));

/**
 * Ver una imagen o un video en grande, sin el recuadro apretándolos.
 * Arranca entrando entero en la ventana; un clic lo pasa a tamaño real y de vuelta.
 */
export function MediaViewer() {
  const [src, setSrc] = useState<string | null>(null);
  const [real, setReal] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  useEffect(() => {
    const onMenu = (e: Event) => {
      const { src: file, x, y } = (e as CustomEvent<{ src: string; x: number; y: number }>).detail;
      const local = !/^(https?:|data:)/i.test(file);
      setMenu({
        x,
        y,
        items: [
          ...(isAudioPath(file) ? [] : [{ label: "Ver en grande", onClick: () => openMedia(file) }]),
          { label: "Abrir el archivo", onClick: () => openPath(file) },
          ...(local ? [{ label: "Abrir la carpeta", onClick: () => revealInExplorer(file) }] : []),
          { label: "Copiar la ruta", separator: true, onClick: () => copyText(file) },
          { label: "Copiar el nombre", onClick: () => copyText(file.split(/[\\/]/).pop() ?? file) },
        ],
      });
    };
    window.addEventListener(MENU, onMenu);
    return () => window.removeEventListener(MENU, onMenu);
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setSrc((e as CustomEvent<string>).detail);
      setReal(false);
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setSrc(null); }
      else if (e.key === "Enter") openPath(src);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [src]);

  if (!src) return menu ? <ContextMenu {...menu} onClose={() => setMenu(null)} /> : null;
  const video = isVideoPath(src);
  const name = src.split(/[\\/]/).pop();

  return (
    <div className="viewer" onMouseDown={(e) => e.target === e.currentTarget && setSrc(null)}>
      <div className="viewer-bar">
        <span className="viewer-name" title={src}>{name}</span>
        {!video && (
          <button className="chip" onClick={() => setReal((v) => !v)}>
            {real ? "Entrar en la ventana" : "Tamaño real"}
          </button>
        )}
        <button className="chip" onClick={() => openPath(src)}>Abrir</button>
        <button className="chip" onClick={() => revealInExplorer(src)}>Explorador</button>
        <button className="chip" onClick={() => setSrc(null)} title="Esc">Cerrar</button>
      </div>
      <div className={"viewer-body" + (real ? " real" : "")} onMouseDown={(e) => e.target === e.currentTarget && setSrc(null)}>
        {video ? (
          <video src={url(src)} controls autoPlay />
        ) : (
          <img src={url(src)} alt="" onClick={() => setReal((v) => !v)} style={{ cursor: real ? "zoom-out" : "zoom-in" }} />
        )}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
