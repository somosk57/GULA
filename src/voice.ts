// El canal de voz de la red local.
//
// Cómo funciona, en criollo: una PC prende el "portero" (el servidorcito de
// Rust) y les pasa su IP a las otras dos. Por ahí sólo viajan mensajitos para
// presentarse; el audio va **directo** de una PC a la otra (WebRTC). Así que
// no hay servidores afuera, ni cuentas, ni internet: alcanza con el wifi.
//
// Hasta 3 personas: con tres, cada uno mantiene dos conversaciones abiertas y
// listo. Para más habría que cambiar de esquema (todos contra un mixer).
import { invoke, isTauri } from "./backend";

export const VOICE_PORT = 7157;
export const VOICE_MAX = 3;

export interface Member {
  id: number;
  /** Vos mismo. */
  me?: boolean;
  /** Está hablando ahora. */
  talking: boolean;
  name: string;
}

type Send = (m: Record<string, unknown>) => void;

export interface VoiceHandlers {
  onMembers: (m: Member[]) => void;
  onState: (s: VoiceState, detail?: string) => void;
}

export type VoiceState = "off" | "connecting" | "on" | "error";

/** Mide si un audio tiene voz, para prender el puntito de "está hablando". */
function meter(stream: MediaStream, onLevel: (v: number) => void) {
  const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  const buf = new Uint8Array(an.frequencyBinCount);
  let live = true;
  const tick = () => {
    if (!live) return;
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += (v - 128) * (v - 128);
    onLevel(Math.sqrt(sum / buf.length) / 128);
    requestAnimationFrame(tick);
  };
  tick();
  return () => {
    live = false;
    src.disconnect();
    ctx.close().catch(() => {});
  };
}

export class VoiceRoom {
  private ws: WebSocket | null = null;
  private local: MediaStream | null = null;
  private pcs = new Map<number, RTCPeerConnection>();
  private audios = new Map<number, HTMLAudioElement>();
  private stops: (() => void)[] = [];
  private levels = new Map<number, number>();
  private myId = 0;
  private hosting = false;
  private timer: number | null = null;

  constructor(private h: VoiceHandlers) {}

  get id() { return this.myId; }
  get isHost() { return this.hosting; }

  /** Prende el canal en esta PC y entra. Devuelve la dirección para repartir. */
  async host(port = VOICE_PORT): Promise<string> {
    if (!isTauri) throw new Error("El canal de voz anda en la app de escritorio.");
    const addr = await invoke<string>("voice_start", { port });
    this.hosting = true;
    // Si el puerto estaba ocupado, Rust abrió el siguiente y lo dice acá.
    await this.join(`127.0.0.1:${Number(addr.split(":")[1]) || port}`);
    return addr;
  }

  /** Entra a un canal que prendió otra PC: "192.168.1.40:57157". */
  async join(addr: string) {
    this.h.onState("connecting");
    const url = `ws://${addr.includes(":") ? addr : `${addr}:${VOICE_PORT}`}`;
    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        // El navegador ya cancela el eco y el ruido: se puede hablar con parlantes.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch {
      this.h.onState("error", "No me dejaron usar el micrófono. Revisá los permisos de Windows (Configuración → Privacidad → Micrófono).");
      return;
    }
    this.stops.push(meter(this.local, (v) => this.level(0, v)));

    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onmessage = (ev) => this.onMsg(JSON.parse(ev.data as string));
    ws.onerror = () => this.h.onState("error", `No pude entrar a ${addr}. ¿La otra PC prendió el canal? ¿Están en el mismo wifi?`);
    ws.onclose = () => { if (this.ws === ws) this.leave(); };
    this.timer = window.setInterval(() => this.publish(), 120);
  }

  private send: Send = (m) => this.ws?.readyState === 1 && this.ws.send(JSON.stringify(m));

  private level(id: number, v: number) {
    this.levels.set(id, v);
  }

  /** Avisa a la pantalla quién está y quién habla (cada tanto, no en cada frame). */
  private publish() {
    const talking = (id: number) => (this.levels.get(id) ?? 0) > 0.045;
    const list: Member[] = [{ id: 0, me: true, name: "Vos", talking: talking(0) && !this.muted }];
    for (const id of this.pcs.keys()) list.push({ id, name: `PC ${id}`, talking: talking(id) });
    this.h.onMembers(list);
  }

  private async onMsg(m: { t?: string; from?: number; id?: number; peers?: number[]; sdp?: RTCSessionDescriptionInit; ice?: RTCIceCandidateInit; max?: number }) {
    if (m.t === "full") {
      this.h.onState("error", `El canal está lleno (${m.max ?? VOICE_MAX} personas).`);
      this.leave();
      return;
    }
    if (m.t === "hello") {
      this.myId = m.id ?? 0;
      this.h.onState("on");
      // El que llega saluda a los que ya estaban.
      for (const p of m.peers ?? []) await this.offer(p);
      return;
    }
    const from = m.from;
    if (from === undefined) return;
    if (m.t === "leave") {
      this.drop(from);
      return;
    }
    if (m.t === "offer" && m.sdp) {
      const pc = this.peer(from);
      await pc.setRemoteDescription(m.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ t: "answer", to: from, sdp: answer });
      return;
    }
    if (m.t === "answer" && m.sdp) {
      await this.pcs.get(from)?.setRemoteDescription(m.sdp);
      return;
    }
    if (m.t === "ice" && m.ice) {
      try { await this.pcs.get(from)?.addIceCandidate(m.ice); } catch { /* llegó tarde */ }
    }
  }

  private peer(id: number): RTCPeerConnection {
    const found = this.pcs.get(id);
    if (found) return found;
    // Sin STUN ni TURN: en la red local las PCs se ven de una.
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pcs.set(id, pc);
    for (const t of this.local?.getTracks() ?? []) pc.addTrack(t, this.local!);
    pc.onicecandidate = (e) => e.candidate && this.send({ t: "ice", to: id, ice: e.candidate.toJSON() });
    pc.ontrack = (e) => {
      const a = this.audios.get(id) ?? new Audio();
      a.autoplay = true;
      a.srcObject = e.streams[0];
      a.play().catch(() => {});
      this.audios.set(id, a);
      this.stops.push(meter(e.streams[0], (v) => this.level(id, v)));
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) this.drop(id);
    };
    return pc;
  }

  private async offer(id: number) {
    const pc = this.peer(id);
    const o = await pc.createOffer();
    await pc.setLocalDescription(o);
    this.send({ t: "offer", to: id, sdp: o });
  }

  private drop(id: number) {
    this.pcs.get(id)?.close();
    this.pcs.delete(id);
    const a = this.audios.get(id);
    if (a) { a.srcObject = null; this.audios.delete(id); }
    this.levels.delete(id);
    this.publish();
  }

  muted = false;
  /** Cortar y volver a abrir el micrófono. */
  mute(on: boolean) {
    this.muted = on;
    for (const t of this.local?.getAudioTracks() ?? []) t.enabled = !on;
    this.publish();
  }

  leave() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    for (const s of this.stops) s();
    this.stops = [];
    for (const id of [...this.pcs.keys()]) this.drop(id);
    for (const t of this.local?.getTracks() ?? []) t.stop();
    this.local = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    if (this.hosting) {
      this.hosting = false;
      invoke("voice_stop").catch(() => {});
    }
    this.myId = 0;
    this.h.onMembers([]);
    this.h.onState("off");
  }
}
