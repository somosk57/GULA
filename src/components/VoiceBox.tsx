import { useEffect, useRef, useState } from "react";
import { VoiceRoom, VOICE_MAX, VOICE_PORT, Member, VoiceState } from "../voice";
import { ask, confirmDlg, notify } from "../dialog";
import { copyText, isTauri } from "../backend";
import { ContextMenu, MenuItem } from "./ContextMenu";

const LAST = "gula.voice.addr";

/**
 * El canal de voz, abajo a la derecha del mapa.
 *
 * Una PC prende el canal y reparte su dirección; las otras entran con eso.
 * El audio va directo entre las PCs, así que no hace falta internet: alcanza
 * con estar en el mismo wifi. Hasta tres personas.
 */
export function VoiceBox() {
  const [state, setState] = useState<VoiceState>("off");
  const [detail, setDetail] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [addr, setAddr] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [muted, setMuted] = useState(false);
  const room = useRef<VoiceRoom | null>(null);

  // Una sola sala por ventana, y se cierra sola al cerrar la app.
  useEffect(() => {
    room.current = new VoiceRoom({
      onMembers: setMembers,
      // El detalle del error se queda hasta que vuelvas a probar: si no, el ws
      // se cierra atrás y el cartel desaparece antes de que lo leas.
      onState: (s, d) => { setState(s); if (d !== undefined) setDetail(d); },
    });
    return () => room.current?.leave();
  }, []);

  const host = async () => {
    setDetail("");
    try {
      const a = await room.current!.host(VOICE_PORT);
      setAddr(a);
      await copyText(a);
      notify("Canal abierto", `Pasales esta dirección: ${a}\n(ya está copiada). La primera vez Windows va a preguntar si deja pasar a GULA por el firewall: decile que sí, en redes privadas.`);
    } catch (e) {
      setState("error");
      setDetail(String(e));
    }
  };

  const enter = async () => {
    setDetail("");
    const last = (() => { try { return localStorage.getItem(LAST) ?? ""; } catch { return ""; } })();
    const v = (await ask("Dirección del canal", last, { placeholder: `Ej: 192.168.1.40:${VOICE_PORT}` }))?.trim();
    if (!v) return;
    try { localStorage.setItem(LAST, v); } catch { /* sin localStorage */ }
    setAddr(v);
    room.current!.join(v);
  };

  const leave = async () => {
    if (room.current?.isHost && members.length > 1) {
      if (!(await confirmDlg("¿Cerrar el canal?", "Sos la PC que lo abrió: los demás se van a quedar afuera.", { danger: true, okLabel: "Cerrar" }))) return;
    }
    room.current?.leave();
    setAddr("");
  };

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: "Abrir el canal en esta PC", onClick: host },
        { label: "Entrar a un canal…", onClick: enter },
      ],
    });
  };

  if (!isTauri) return null;

  if (state === "off" || state === "error")
    return (
      <div className="voice off">
        {detail && <div className="voice-err" title={detail}>{detail}</div>}
        <button className="voice-pill" onClick={openMenu} title="Canal de voz de la red local (hasta 3 PCs)">
          <span className="voice-mic">🎙</span> Voz
        </button>
        {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      </div>
    );

  return (
    <div className={"voice on" + (state === "connecting" ? " wait" : "")}>
      <div className="voice-head">
        <span className="voice-mic">🎙</span>
        <span className="voice-addr" title={addr ? `Canal: ${addr}` : ""} onClick={() => addr && copyText(addr)}>
          {state === "connecting" ? "Entrando…" : addr || "En el canal"}
        </span>
        <button className="voice-x" onClick={leave} title="Salir del canal">✕</button>
      </div>
      <div className="voice-people">
        {members.map((m) => (
          <span
            key={m.id}
            className={"voice-dot" + (m.talking ? " talk" : "") + (m.me ? " me" : "")}
            title={m.me ? (muted ? "Vos (micrófono cerrado)" : "Vos") : m.name}
          >
            {m.me ? (muted ? "🔇" : "VOS") : m.name.replace("PC ", "")}
          </span>
        ))}
        {members.length < VOICE_MAX &&
          Array.from({ length: VOICE_MAX - members.length }).map((_, i) => <span key={"e" + i} className="voice-dot empty" title="Lugar libre">·</span>)}
      </div>
      <button
        className={"voice-mute" + (muted ? " on" : "")}
        onClick={() => { const v = !muted; setMuted(v); room.current?.mute(v); }}
        title={muted ? "Abrir el micrófono" : "Cerrar el micrófono"}
      >
        {muted ? "Micrófono cerrado" : "Micrófono abierto"}
      </button>
    </div>
  );
}
