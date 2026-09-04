# GULA

**Controla tu gula.**

GULA es el diario de tu trabajo con IA: qué hiciste, qué salió, con qué prompt, en qué paso estás. Cada nota es una entrada del registro (con recuadros para idea, prompt, resultado…), la lista de la izquierda es la línea de tiempo del proyecto, y abajo va lo fijo: accesos, contexto, fichas, prompts.

Tu proyecto, anclado: notas, carpetas, prompts, contexto y comandos en una sola ventana, para trabajar con IA sin perder el hilo. Una ventana chica, minimalista, que podés mover y redimensionar como cualquier otra, y dejar siempre arriba.

- **Izquierda:** las notas del proyecto en secciones, con miniatura si tienen imagen, íconos de video/audio y cantidad de recuadros; orden manual o por fecha (botón ☰/⇅). Arriba, la **etapa** del proyecto (Idea / En marcha / Pausado / Terminado, clic para cambiar) y la línea **"Ahora estoy en…"**. Una nota nueva en una sección nace con los mismos recuadros que la última de esa sección (clic derecho → *Nueva a partir de esta*).
- **Derecha arriba:** la nota, en markdown **en vivo**: los títulos se ven grandes, la negrita en negrita (`Ctrl+B`), cursiva (`Ctrl+I`), las casillas `- [ ]` son casillas reales (clic o `Ctrl+Enter`), Enter continúa listas. `Ctrl+E` muestra la vista renderizada. El botón de recuadros pasa de 1 → 2 → 3 → 4 → 6 **columnas** con un clic; cada recuadro tiene su propio título, que escribís vos, como sticky notes integradas. Cualquier recuadro muestra **imágenes, videos y audio** (mp3, wav, ogg, m4a, flac): arrastrá un archivo desde el Explorador, pegá una imagen con `Ctrl+V`, o clic derecho → *Insertar imagen o video…*; queda como `![](ruta)` y se ve ahí mismo. para trabajar varias cosas a la vez sin escribir todo en un solo lugar.
- **Derecha abajo:** siete pestañas por proyecto (`Ctrl+1..7`, `Ctrl+Tab` para rotar):
  - **Accesos:** el tablero del proyecto (y debajo los **comandos** que usás seguido, con *Copiar* o **▶ Correr** en PowerShell): carpetas, archivos y links (YouTube Studio, Vercel, Supabase, GitHub, Claude… los sitios conocidos salen con su insignia). Clic = abrir. Clic derecho = *Abrir PowerShell acá*, *Abrir en VS Code*, *Mostrar en Explorador*, *Copiar ruta*. Se pueden arrastrar desde el Explorador. *Abrir todo* levanta el proyecto entero.
  - **Galería:** todas las imágenes, videos y audios de las notas del proyecto en una grilla; al pasar el mouse ves el prompt que lo generó. Clic: ir a la nota · doble clic: abrir · clic derecho: copiar prompt o ruta.
  - **Prompts:** prompts guardados. *Copiar* los manda al portapapeles y marca ese como **último usado** (queda arriba). Si el prompt tiene `{{variables}}`, te pide cada valor al copiar. *Pegar del portapapeles* crea uno con lo que tengas copiado.
  - **Contexto:** bloques con nombre (Qué es, Estilo, Stack, Decisiones, Estado…), cada uno con interruptor: los apagados no se copian. Muestra los tokens aproximados del paquete. **Copiar para la IA** arma en un solo texto: bloques encendidos + tareas pendientes + últimos avances de la bitácora + último prompt usado. Lo pegás como primer mensaje de un chat nuevo y la IA arranca sabiendo todo.
  - **Fichas:** la biblia del proyecto: personajes, lugares, objetos y escenas, cada una con una línea de resumen (lo que ve la IA), detalle largo, imagen de referencia y un interruptor "Para la IA". Las escenas tienen estado (idea / borrador / lista) y qué personajes y lugares aparecen. Se ordenan arrastrando. Pensado para novelas, pero sirve para cualquier proyecto con "cosas" que la IA tiene que conocer.
  - **Tareas:** todas las `- [ ]` de todas las notas del proyecto en un solo lugar; se tildan desde ahí.
  - **Bitácora:** una línea por avance con fecha automática. Para retomar después de días y para la IA.

**Ciclo de sesión:** *▶ Empezar sesión* (en Contexto o Bitácora) copia el paquete para la IA y empieza a contar el tiempo (aparece un punto verde al lado del proyecto). *● Cerrar sesión* te pregunta qué lograste y el link del chat, y lo guarda en la bitácora con la duración. Así los chats viejos quedan indexados por lo que resolvieron.

**Informe del proyecto** (clic derecho en el nombre del proyecto): un texto ordenado que explica qué es, en qué etapa está, qué se decidió, qué se fue haciendo, qué falta, qué fichas y prompts hay, y el registro cronológico de notas con sus resultados. Todo el proyecto o los últimos 7 días, resumido o completo; se copia, se guarda como `.md` o se lee ahí.

**Captura distribuida:** en Bitácora, *Prompt de cierre* copia un pedido para que la IA resuma la sesión con encabezados fijos (`## Hecho`, `## Pendiente`, `## Decisiones`, `## Prompts`, `## Fichas`, `## Ahora`). Copiás su respuesta, `Ctrl+Shift+V` → **Repartir automáticamente**, y cada cosa va a su lugar: bitácora, nota de tareas, bloque Decisiones, prompts, fichas y "ahora estoy en".

**Pegar como… (`Ctrl+Shift+V` o el ícono del portapapeles):** lo que tengas copiado (una respuesta de la IA, un prompt que funcionó, un comando) entra a GULA como nota nueva, al final de la nota abierta, bloque de contexto, prompt, comando o entrada de bitácora.

El botón ⤢ al lado de las pestañas agranda el panel de abajo para editar contexto o prompts largos con comodidad.

Las notas se agrupan en **secciones** (clic derecho en el título de la sección o en una nota para mover/renombrar). Al crear un proyecto elegís un **perfil** (App / software, Novela / escritura, Contenido / marca, Estudio, En blanco) y arranca con sus notas, bloques de contexto, prompts y comandos. El selector de proyectos muestra, por cada uno, el último avance, las tareas pendientes y la última actividad. Notas y accesos se reordenan arrastrando. Clic derecho en el nombre del proyecto (arriba, centrado): copiar todo para la IA, **exportar a carpeta** como archivos `.md`, renombrar, eliminar.

**Bandeja y atajo global:** la X esconde la ventana a la bandeja del sistema (ícono al lado del reloj); `Ctrl+Shift+Space` la muestra/oculta desde cualquier app. "Salir" está en el menú del ícono de la bandeja.

Atajos: `Ctrl+K` buscar en todos los proyectos · `Ctrl+Z` / `Ctrl+Shift+Z` deshacer / rehacer · `Ctrl+N` nueva nota · `Ctrl+B` barra lateral · `Ctrl+E` vista/edición · `Ctrl+1..7` pestañas · `Ctrl+Shift+Space` mostrar/ocultar.

Los datos se guardan en `%APPDATA%\com.creator100k.gula\data.json`, con una copia de seguridad por día en `backups\` (se guardan las últimas 30). Desde el menú `⋯` de la barra de título: restaurar una copia, cambiar tema (oscuro / claro / sistema), abrir la carpeta de datos. La posición y tamaño de la ventana se recuerdan solos.

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
    LogPanel.tsx          bitácora
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
