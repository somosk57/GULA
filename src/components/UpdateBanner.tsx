import { useEffect, useState } from "react";

type Phase = "idle" | "available" | "downloading" | "ready" | "error";

/**
 * Al arrancar, consulta el latest.json de GitHub Releases. Si hay versión nueva,
 * muestra una barrita discreta; al aceptar, descarga, instala y reinicia.
 */
export function UpdateBanner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [version, setVersion] = useState("");
  const [progress, setProgress] = useState(0);
  const [update, setUpdate] = useState<import("@tauri-apps/plugin-updater").Update | null>(null);

  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window)) return;
    let cancelled = false;
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const u = await check();
        if (u && !cancelled) {
          setUpdate(u);
          setVersion(u.version);
          setPhase("available");
        }
      } catch (e) {
        // Sin internet o sin release todavía: silencio.
        console.warn("updater:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const install = async () => {
    if (!update) return;
    setPhase("downloading");
    try {
      let total = 0;
      let got = 0;
      await update.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        else if (ev.event === "Progress") {
          got += ev.data.chunkLength;
          if (total) setProgress(Math.round((got / total) * 100));
        } else if (ev.event === "Finished") setProgress(100);
      });
      setPhase("ready");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (e) {
      console.error(e);
      setPhase("error");
    }
  };

  if (phase === "idle") return null;

  return (
    <div className="update">
      {phase === "available" && (
        <>
          <span>Hay una versión nueva: <b>{version}</b></span>
          <button className="chip primary" onClick={install}>Actualizar</button>
          <button className="chip" onClick={() => setPhase("idle")}>Después</button>
        </>
      )}
      {phase === "downloading" && <span>Descargando actualización… {progress}%</span>}
      {phase === "ready" && <span>Reiniciando…</span>}
      {phase === "error" && (
        <>
          <span>No se pudo actualizar. Probá más tarde.</span>
          <button className="chip" onClick={() => setPhase("idle")}>Cerrar</button>
        </>
      )}
    </div>
  );
}
