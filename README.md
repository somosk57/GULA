# GULA

**Controla tu gula.**

GULA es el diario de tu trabajo con IA: qué hiciste, qué salió, con qué prompt, en qué paso estás. Cada nota es una entrada del registro (con recuadros para idea, prompt, resultado…), la lista de la izquierda es la línea de tiempo del proyecto, y abajo va lo fijo: accesos, contexto, fichas, prompts.

Tu proyecto, anclado: notas, carpetas, prompts, contexto y comandos en una sola ventana, para trabajar con IA sin perder el hilo. Una ventana chica, minimalista, que podés mover y redimensionar como cualquier otra, y dejar siempre arriba.

- **Izquierda:** las notas del proyecto en secciones, con miniatura si tienen imagen, íconos de video/audio y cantidad de recuadros; orden manual o por fecha (botón ☰/⇅). Arriba, la **etapa** del proyecto (Idea / En marcha / Pausado / Terminado, clic para cambiar) y la línea **"Ahora estoy en…"**. Una nota nueva en una sección nace con los mismos recuadros que la última de esa sección (clic derecho → *Nueva a partir de esta*), y toma el título de la primera línea que escribas hasta que le pongas uno a mano (doble clic para renombrar).
- **Derecha arriba:** la nota, en markdown **en vivo**: los títulos se ven grandes, la negrita en negrita (`Ctrl+B`), cursiva (`Ctrl+I`), las casillas `- [ ]` son casillas reales (clic o `Ctrl+Enter`), Enter continúa listas. `Ctrl+E` muestra la vista renderizada. El botón de recuadros pasa de 1 → 2 → 3 → 4 → 6 **columnas** con un clic; cada recuadro tiene su propio título, que escribís vos, como sticky notes integradas. Cualquier recuadro muestra **imágenes, videos y audio** (mp3, wav, ogg, m4a, flac): arrastrá un archivo desde el Explorador, pegá una imagen con `Ctrl+V`, o clic derecho → *Insertar imagen o video…*; queda como `![](ruta)` y se ve ahí mismo. para trabajar varias cosas a la vez sin escribir todo en un solo lugar.
- **Derecha abajo:** siete pestañas por proyecto (`Ctrl+1..7`, `Ctrl+Tab` para rotar):
  - **Accesos:** el tablero del proyecto (y debajo los **comandos** que usás seguido, con *Copiar* o **▶ Correr** en PowerShell): carpetas, archivos y links (YouTube Studio, Vercel, Supabase, GitHub, Claude… los sitios conocidos salen con su insignia). Clic = abrir. Clic derecho = *Abrir PowerShell acá*, *Abrir en VS Code*, *Mostrar en Explorador*, *Copiar ruta*. Se pueden arrastrar desde el Explorador. *Abrir todo* levanta el proyecto entero.
  - **Galería:** todas las imágenes, videos y audios de las notas del proyecto en una grilla; al pasar el mouse ves el prompt que lo generó. Clic: ir a la nota · doble clic: abrir · clic derecho: copiar prompt o ruta.
  - **Prompts:** prompts guardados. *Copiar* los manda al portapapeles y marca ese como **último usado** (queda arriba). Si el prompt tiene `{{variables}}`, te pide cada valor al copiar. *Pegar del portapapeles* crea uno con lo que tengas copiado.
  - **Contexto:** bloques con nombre (Qué es, Estilo, Stack, Decisiones, Estado…), cada uno con interruptor: los apagados no se copian. Muestra los tokens aproximados del paquete. **Copiar para la IA** arma en un solo texto: bloques encendidos + tareas pendientes + últimas sesiones del diario + último prompt usado. Lo pegás como primer mensaje de un chat nuevo y la IA arranca sabiendo todo.
  - **Fichas:** la biblia del proyecto: personajes, lugares, objetos y escenas, cada una con una línea de resumen (lo que ve la IA), detalle largo, imagen de referencia y un interruptor "Para la IA". Las escenas tienen estado (idea / borrador / lista) y qué personajes y lugares aparecen. Se ordenan arrastrando. Pensado para novelas, pero sirve para cualquier proyecto con "cosas" que la IA tiene que conocer.
  - **Tareas:** todas las `- [ ]` de todas las notas del proyecto en un solo lugar; se tildan desde ahí.

**Ciclo de sesión:** *▶ Empezar sesión* (en Contexto) copia el paquete para la IA y empieza a contar el tiempo (aparece un punto verde al lado del proyecto). *● Cerrar sesión* te pregunta qué lograste y el link del chat, y lo anota en la entrada del día con la duración. Así los chats viejos quedan indexados por lo que resolvieron.

**Hoy (`Ctrl+H` o el ícono de casa):** todos los proyectos de un vistazo: etapa, "ahora estoy en", pendientes, última actividad, y las notas de los últimos 7 días de todos los proyectos.

**Marcas de color:** cada imagen, video o audio se marca con un color desde el recuadro (puntitos al pasar el mouse) o desde la Galería: **azul = Maestro** (la referencia mayor), **verde = Sirve**, **amarillo = Más o menos**, **rojo = No sirve**. La Galería ordena por marca y filtra por color, la lista de notas muestra un punto con la mejor marca de cada nota, y los maestros van como "referencias" en *Copiar para la IA* y en el Informe.

**Colecciones** (en Galería, *+ Colección*): carpetas de tu PC con el nombre que quieras (Clips, Highlights, Artworks, Docs, Assets…). La Galería muestra lo que hay adentro, leído del disco: imágenes, videos, audios y documentos, con las mismas marcas de color. Clic derecho en una colección: abrir la carpeta, renombrar, cambiar carpeta, o marcarla como el lugar donde se copian los archivos que insertes en notas (así la nota no se rompe si movés el original). La Galería también marca con ⚠ los archivos de las notas que ya no están, y puede mostrar los resultados de todos los proyectos.

**Columna de proyectos:** cuando hay más de un proyecto aparece una columna angosta a la izquierda (como los servidores de Discord) con un cuadrado por proyecto: la imagen maestra o las iniciales, un punto verde si hay sesión abierta y el número de tareas pendientes. Un clic y cambiás de proyecto; `Ctrl+Shift+1…9` va al proyecto N y `Ctrl+Shift+↑/↓` pasa al anterior/siguiente. Se puede ocultar desde el menú ⋯.

**Lo viejo se nota:** al lado de "Ahora estoy en…" aparece cuándo lo escribiste (en rojo si pasó más de una semana), también en el selector de proyectos y en el Informe. Cada bloque de Contexto muestra cuándo se editó por última vez, para que se vea qué parte del contexto quedó rancia antes de mandársela a la IA.

**Galería unificada:** "Todo" muestra lo de las notas y lo de las colecciones en una sola grilla, cada archivo una vez; los que ya están en una entrada llevan un `#` (y heredan su título y prompt). El chip **Sueltos** filtra los que todavía no entraron a ninguna entrada: es la lista de "generé y no registré". En la vista grande, la tecla **N** crea una entrada nueva con ese archivo en el recuadro Resultado y un recuadro Prompt vacío al lado.

**Galería con miles de archivos:** las casillas cargan de a 90 a medida que bajás, con miniaturas chicas que GULA genera una sola vez (carpeta `thumbs/` en los datos), así una colección de 1500 capturas no traba nada. El chip de tamaño alterna chico / medio / grande / enorme. Clic en una casilla abre la **vista grande**: ← → para pasar, 1–4 para marcar (0 quita la marca), Enter abre el archivo, Esc cierra, y "Ir a la nota" si vino de una nota. Doble clic abre el archivo directamente.

**Marcas por nota:** clic derecho sobre una nota en la barra izquierda → Maestro / Sirve / Más o menos / No sirve. El punto de color aparece al lado del título y en el Informe. Los cuatro puntos debajo del filtro ocultan las notas de ese color ("Hide rojo": un clic y desaparecen; otro clic y vuelven). Si no marcás la nota, hereda la mejor marca de sus archivos.

**El diario tiene una sola cronología:** no hay Bitácora aparte. Todo lo que pasa en un día (lo que repartís del cierre, las sesiones con su duración, lo que pegás como "línea del día") va a una nota con la fecha ("4 sep 2026") en la sección Sesiones, junto a las demás entradas.

**Informe del proyecto** (clic derecho en el nombre del proyecto): un texto ordenado que explica qué es, en qué etapa está, qué se decidió, qué se fue haciendo, qué falta, qué fichas y prompts hay, y el registro cronológico de notas con sus resultados. Todo el proyecto o los últimos 7 días, resumido o completo; se copia, se guarda como `.md` o se lee ahí.

**Captura distribuida:** en Contexto, *Prompt de cierre* copia un pedido para que la IA resuma la sesión con encabezados fijos (`## Hecho`, `## Pendiente`, `## Decisiones`, `## Prompts`, `## Fichas`, `## Ahora`). Copiás su respuesta, `Ctrl+Shift+V` → **Repartir automáticamente**, y cada cosa va a su lugar: la entrada del día (sección Sesiones), nota de tareas, bloque Decisiones, prompts, fichas y "ahora estoy en".

**Pegar como… (`Ctrl+Shift+V` o el ícono del portapapeles):** lo que tengas copiado (una respuesta de la IA, un prompt que funcionó, un comando) entra a GULA como nota nueva, al final de la nota abierta, bloque de contexto, prompt, comando o entrada de línea en la entrada del día.

El botón ⤢ al lado de las pestañas agranda el panel de abajo para editar contexto o prompts largos con comodidad.

Las notas se agrupan en **secciones** (clic derecho en el título de la sección o en una nota para mover/renombrar). Al crear un proyecto elegís un **perfil** (App / software, Novela / escritura, Contenido / marca, Estudio, En blanco) y arranca con sus notas, bloques de contexto, prompts y comandos. El selector de proyectos muestra, por cada uno, el último avance, las tareas pendientes y la última actividad. Notas y accesos se reordenan arrastrando. Clic derecho en el nombre del proyecto (arriba, centrado): copiar todo para la IA, **exportar a carpeta** como archivos `.md`, renombrar, eliminar.

**Bandeja y atajo global:** la X esconde la ventana a la bandeja del sistema (ícono al lado del reloj); `Ctrl+Shift+Space` (configurable en `⋯`) la muestra/oculta desde cualquier app. "Salir" está en el menú del ícono de la bandeja.

Atajos: `Ctrl+K` buscar en todos los proyectos · `Ctrl+Z` / `Ctrl+Shift+Z` deshacer / rehacer · `Ctrl+N` nueva nota · `Ctrl+B` barra lateral · `Ctrl+E` vista/edición · `Ctrl+1..7` pestañas · `Ctrl+Shift+Space` mostrar/ocultar.

Los datos se guardan en `%APPDATA%\com.creator100k.gula\data.json`, con una copia de seguridad por día en `backups\` (se guardan las últimas 30). Desde el menú `⋯` de la barra de título: restaurar una copia, cambiar tema (oscuro / claro / sistema), cambiar el atajo global, abrir la carpeta de datos, o **mover los datos a otra carpeta** (por ejemplo dentro de OneDrive para usar GULA en dos PCs). La posición y tamaño de la ventana se recuerdan solos.

## Requisitos (Windows)

1. **Node.js** 20+ → https://nodejs.org
2. **Rust** → https://rustup.rs (instalá con las opciones por defecto; necesita las *Build Tools de Visual Studio* con "Desktop development with C++", el instalador de rustup te lo ofrece).
3. **WebView2**: ya viene con Windows 10/11.

## Correr en modo desarrollo

```powershell
cd gula
npm install
npm run tauri dev
```

La primera compilación de Rust tarda unos minutos; después es casi instantánea. Cualquier cambio en `src/` se refleja al toque.

## Publicar una versión (Windows + Mac, con actualización automática)

El repo tiene un workflow de GitHub Actions (`.github/workflows/release.yml`) que compila e instala todo solo. Configuración única:

1. Creá el repo en GitHub y subí el código.
2. En **Settings → Secrets and variables → Actions** agregá `TAURI_SIGNING_PRIVATE_KEY` (el contenido del archivo `gula.key`) y `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (vacío si la clave no tiene contraseña).
3. En `src-tauri/tauri.conf.json` la URL del updater ya apunta a somosk57/GULA.

Después, para cada versión:

```powershell
# subí el número en src-tauri/tauri.conf.json ("version") y package.json
git commit -am "v0.3.0"
git tag v0.3.0
git push && git push origin v0.3.0
```

En ~10 minutos aparece el Release con `GULA_x.y.z_x64-setup.exe` (Windows), dos `.dmg` (Mac Apple Silicon e Intel) y el `latest.json`. Las apps ya instaladas ven la versión nueva al abrirse y ofrecen actualizarse.

**Mac sin firma de Apple:** la primera vez el sistema dice que no puede abrir la app. Clic derecho sobre GULA → *Abrir* → *Abrir*. Es una sola vez.

## Generar el instalador a mano (.exe)

```powershell
npm run tauri build
```

Queda en `src-tauri\target\release\bundle\nsis\` (instalador) y el ejecutable suelto en `src-tauri\target\release\`.

## Estructura

```
src/                      frontend (React + TypeScript)
  App.tsx                 layout, atajos, divisor arrastrable
  store.ts                estado global + autosave
  backend.ts              puente a los comandos de Tauri (con fallback a localStorage para `npm run dev` en el navegador)
  components/
    TitleBar.tsx          barra de título propia (pin, minimizar, maximizar, cerrar)
    Sidebar.tsx           proyectos + notas
    Editor.tsx            editor markdown
    LinksPanel.tsx        carpetas / archivos / links
    PromptsPanel.tsx      prompts
    ContextPanel.tsx      contexto + "Copiar para la IA"
    SnippetsPanel.tsx     comandos
    TasksPanel.tsx        tareas agregadas
    diary.ts (src)        entrada del día: una sola cronología
  ai.ts                   arma el paquete para la IA, junta tareas, exporta a .md
src-tauri/
  src/lib.rs              comandos: guardar/cargar, abrir carpeta, PowerShell, Explorador, VS Code, exportar, bandeja, atajo global
  tauri.conf.json         ventana (sin decoraciones, tamaño mínimo, etc.)
  capabilities/           permisos
```

## Ideas para después

- Tema claro.
- Links a chats de Claude/ChatGPT con resumen de qué se resolvió.
- Nota diaria automática.
- Sincronizar las notas como `.md` en la carpeta del proyecto (además del data.json).
