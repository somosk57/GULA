# Banco de pruebas

GULA tiene una propiedad incómoda: **cuanto mejor funciona, más datos acumula**.
Las regresiones de escala son una amenaza permanente, así que esto no es un
script descartable — se vuelve a correr cada vez que se toca el store.

```bash
node bench/generate.mjs small        # 500 cuadrados
node bench/generate.mjs realistic    # 5.000 cuadrados, textos e imágenes
node bench/generate.mjs abusive      # 20.000 cuadrados + una Entrada de 4.000

node --expose-gc bench/measure.mjs bench/realistic.json
```

Los `.json` generados no van al repo (pesan hasta 40 MB); los scripts sí.

`measure.mjs` mide las dos operaciones que hoy dominan el costo: el clon
completo del estado que `store.ts` hace en cada `update()`, y la serialización
del autosave. Compara el clon contra `immer` y proyecta la memoria del
historial de deshacer.

Los números de la medición base (2026-09-07, v3.5.4) están en
`claude/plan-tecnico-3.6-4.0.md`.
