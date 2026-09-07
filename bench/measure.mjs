// Mide lo que hace GULA en cada tecleo y en cada guardado, con y sin immer.
//
// Uso:  node --expose-gc bench/measure.mjs bench/realistic.json
//
// No mide la interfaz: mide las dos operaciones que hoy dominan el costo —
// el clon del estado en cada update() y la serialización del autosave.
import { readFileSync } from "node:fs";
import { produce, setAutoFreeze } from "immer";

setAutoFreeze(false); // en producción va apagado; acá sólo estorbaría a la medición

const file = process.argv[2] ?? "bench/realistic.json";
const raw = readFileSync(file, "utf8");
const base = JSON.parse(raw);

const mb = (b) => (b / 1048576).toFixed(1) + " MB";
const heap = () => { global.gc?.(); global.gc?.(); return process.memoryUsage().heapUsed; };
const time = (label, runs, fn) => {
  fn(); // calentar
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn(i);
  const ms = (performance.now() - t0) / runs;
  console.log(`  ${label.padEnd(34)} ${ms.toFixed(2)} ms`);
  return ms;
};

/** Un tecleo: agrega una letra al cuerpo del primer recuadro que encuentre. */
const firstLeaf = (p) => (p.panes ? firstLeaf(p.panes[0]) : p);
const edit = (d) => { const leaf = firstLeaf(d.projects[0].notes[0]); leaf.body += "x"; };

console.log(`\n${file} — ${mb(raw.length)} de JSON\n`);

console.log("HOY (deep clone en cada update)");
const tClone = time("update: clone + editar", 20, () => { const d = JSON.parse(JSON.stringify(base)); edit(d); return d; });
const tSave = time("autosave: JSON.stringify", 20, () => JSON.stringify(base).length);
const tLoad = time("cargar: JSON.parse", 10, () => JSON.parse(raw).projects.length);

console.log("\nCON IMMER (estructura compartida)");
const tImmer = time("update: produce + editar", 200, () => produce(base, edit));

console.log("\nHISTORIAL: 500 pasos de deshacer");
// Con un estado grande, 500 clones enteros no entran en memoria: se miden unos
// pocos y se proyecta. Que no entren YA ES el hallazgo.
const STEPS = 500;
const probe = Math.max(4, Math.min(STEPS, Math.floor(120 * 1048576 / raw.length)));
const h0 = heap();
let s = base; let hist = [];
for (let i = 0; i < probe; i++) { hist.push(s); s = JSON.parse(JSON.stringify(s)); edit(s); }
const perStep = (heap() - h0) / probe;
const hClone = perStep * STEPS;
hist = null; s = null;

const h1 = heap();
let s2 = base; const hist2 = [];
for (let i = 0; i < STEPS; i++) { hist2.push(s2); s2 = produce(s2, edit); }
const hImmer = Math.max(0, heap() - h1);
console.log(`  deep clone${"".padEnd(24)} ${mb(hClone)}${probe < STEPS ? `  (proyectado desde ${probe} pasos: 500 no entran en memoria)` : ""}`);
console.log(`  immer${"".padEnd(29)} ${hImmer < 12 * 1048576 ? "por debajo del ruido de medición (< 12 MB)" : mb(hImmer)}`);

console.log("\nRESUMEN");
console.log(`  update           ${tClone.toFixed(1)} ms → ${tImmer.toFixed(2)} ms   (${(tClone / tImmer).toFixed(0)}× más rápido)`);
console.log(`  500 undo         ${mb(hClone)} → ${hImmer < 12 * 1048576 ? "nada medible" : mb(hImmer)}`);
console.log(`  historial de hoy (80 pasos): ${mb(perStep * 80)}`);
console.log(`  autosave         ${tSave.toFixed(1)} ms por escritura, cada 300 ms mientras tipeás`);
console.log(`  bytes por minuto tipeando: ${mb((raw.length * 60000) / 300)} si el debounce se cumple siempre\n`);
