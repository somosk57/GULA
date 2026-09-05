import { useEffect, useState } from "react";
import { assetUrl, isAudioPath, isVideoPath, openPath, revealInExplorer } from "../backend";

const EVENT = "gula:ver-archivo";

/** Abre el archivo en grande, desde cualquier lado (el widget de la nota no es React). */
export function openMedia(src: string) {
  if (isAudioPath(src)) return; // un audio ya se escucha en el recuadro
  window.dispatchEvent(new CustomEvent(EVENT, { detail: src }));
}

const url = (s: string) => (/^(https?:|data:)/i.test(s) ? s : assetUrl(s));

/**
 * Ver una imagen o un video en grande, sin el recuadro apretándolos.
 * Arranca entrando entero en la ventana; un clic lo pasa a tamaño real y de vuelta.
 */
export function MediaViewer() {
  const [src, setSrc] = useState<string | null>(null);
  const [real, setReal] = useState(false);

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

  if (!src) return null;
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
    </div>
  );
}
