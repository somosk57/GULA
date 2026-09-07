// Genera proyectos de prueba para medir cómo escala GULA.
//
// Uso:  node bench/generate.mjs small|realistic|abusive [salida.json]
//
// No es un benchmark científico: es un fixture reproducible. GULA tiene una
// propiedad incómoda —cuanto mejor funciona, más datos acumula—, así que las
// regresiones de escala son una amenaza permanente y esto se vuelve a correr
// cada vez que se toque el store.
import { writeFileSync } from "node:fs";

let n = 0;
const uid = () => `b${(n++).toString(36)}`;

const WORDS = "idea prompt escena personaje campaña logo render boceto guion pieza infantil mujer trading suno track master versión final aprobado descartado referencia".split(" ");
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const words = (k) => Array.from({ length: k }, () => rnd(WORDS)).join(" ");

/** Un cuerpo de texto de aproximadamente `kb` kilobytes, con alguna imagen. */
function body(kb, withImage) {
  const lines = [];
  if (withImage) lines.push(`![](<C:\\Users\\rodri\\OneDrive\\Documents\\KICK57\\art\\${uid()}.png>)`);
  let size = 0;
  while (size < kb * 1024) {
    const l = words(12);
    lines.push(l);
    size += l.length + 1;
  }
  return lines.join("\n");
}

const PRESETS = {
  //            cuadrados  profundidad  hijos/nivel  kb de texto  entrada
  small:     { panes: 500,   depth: 3, fan: 6,  kb: 0.3, inbox: 0 },
  realistic: { panes: 5000,  depth: 4, fan: 8,  kb: 1.5, inbox: 0 },
  abusive:   { panes: 20000, depth: 6, fan: 10, kb: 2,   inbox: 4000 },
};

function build(cfg) {
  let left = cfg.panes;
  const make = (depth) => {
    if (left <= 0) return null;
    left--;
    const leaf = depth >= cfg.depth || Math.random() < 0.45;
    const pane = { id: uid(), title: Math.random() < 0.6 ? words(2) : "" };
    if (leaf) {
      pane.body = body(cfg.kb, Math.random() < 0.35);
      if (Math.random() < 0.15) pane.todo = Math.random() < 0.5;
    } else {
      pane.body = "";
      pane.panes = [];
      const k = 2 + Math.floor(Math.random() * cfg.fan);
      for (let i = 0; i < k && left > 0; i++) {
        const c = make(depth + 1);
        if (c) pane.panes.push(c);
      }
      if (!pane.panes.length) pane.panes.push({ id: uid(), title: "", body: "" });
    }
    if (Math.random() < 0.2) { pane.w = 3 + Math.floor(Math.random() * 6); pane.h = 3 + Math.floor(Math.random() * 6); }
    return pane;
  };

  const notes = [];
  const now = Date.now();
  while (left > 0) {
    const root = make(1) ?? { id: uid(), title: "", body: "" };
    if (!root.panes) root.panes = [{ id: uid(), title: "", body: root.body }];
    notes.push({
      id: root.id, title: root.title || words(2), body: "", panes: root.panes,
      pinned: false, updatedAt: now - Math.floor(Math.random() * 9e8),
      createdAt: now - Math.floor(Math.random() * 9e8), group: "General", autoTitle: false,
    });
  }

  // Una Entrada enorme, plana: el caso que la 3.6.4 tiene que aguantar.
  if (cfg.inbox) {
    const kids = Array.from({ length: cfg.inbox }, () => ({ id: uid(), title: words(2), body: body(0.4, Math.random() < 0.5) }));
    notes.unshift({
      id: uid(), title: "Entrada", body: "", panes: kids, pinned: false,
      updatedAt: now, createdAt: now, group: "General", autoTitle: false,
    });
  }

  const project = {
    id: uid(), name: "Banco de pruebas", profile: "blank", stage: "idea", now: "",
    notes, links: [], prompts: [], snippets: [], log: [], cards: [], marks: {},
    labels: ["Idea", "Prompt", "Imagen"], pins: [], shelves: [], hideMarks: [],
    collections: [], lastSessionAt: null, sessionStartedAt: null,
  };

  return {
    version: 3, projects: [project], activeProjectId: project.id,
    activeNoteId: { [project.id]: notes[0].id }, bottomTab: "links", alwaysOnTop: false,
    theme: "dark", noteSort: "manual", shortcut: "Ctrl+Shift+Space", onboarded: true,
    rail: true, sidebarMin: true, gridThirds: true, hiddenTabs: ["gallery"],
    bottomOpen: true, showCommands: false, keys: {},
  };
}

const which = process.argv[2] ?? "realistic";
const cfg = PRESETS[which];
if (!cfg) { console.error(`Elegí uno de: ${Object.keys(PRESETS).join(", ")}`); process.exit(1); }
const out = process.argv[3] ?? `bench/${which}.json`;
const state = build(cfg);
const json = JSON.stringify(state);
writeFileSync(out, json);

let panes = 0, deepest = 0;
const walk = (list, d) => { for (const p of list) { panes++; deepest = Math.max(deepest, d); if (p.panes) walk(p.panes, d + 1); } };
walk(state.projects[0].notes.map((x) => ({ ...x, panes: x.panes })), 1);
console.log(`${which}: ${panes} cuadrados · profundidad ${deepest} · ${(json.length / 1048576).toFixed(1)} MB → ${out}`);
