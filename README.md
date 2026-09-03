# GULA

**Controla tu gula.**

Tu proyecto, anclado: notas, carpetas, prompts, contexto y comandos en una sola ventana, para trabajar con IA sin perder el hilo. Una ventana chica, minimalista, que podés mover y redimensionar como cualquier otra, y dejar siempre arriba.

- **Izquierda:** proyectos y sus notas (estilo canales de Discord).
- **Derecha arriba:** la nota, en markdown. `Ctrl+E` alterna edición/vista; las casillas `- [ ]` se tildan con un clic.
- **Derecha abajo:** seis pestañas por proyecto (`Ctrl+1..6`, `Ctrl+Tab` para rotar):
  - **Carpetas:** carpetas, archivos y links pinneados. Clic = abrir. Clic derecho = *Abrir PowerShell acá*, *Abrir en VS Code*, *Mostrar en Explorador*, *Copiar ruta*. Se pueden arrastrar desde el Explorador. *Abrir todo* levanta el proyecto entero.
  - **Prompts:** prompts guardados. *Copiar* los manda al portapapeles y marca ese como **último usado** (queda arriba). *Pegar del portapapeles* crea uno con lo que tengas copiado.
  - **Contexto:** la descripción del proyecto para la IA (qué es, stack, decisiones, estado). **Copiar para la IA** arma en un solo texto: contexto + tareas pendientes + últimos avances de la bitácora + último prompt usado. Lo pegás como primer mensaje de un chat nuevo y la IA arranca sabiendo todo.
  - **Comandos:** comandos y textos que usás seguido. *Copiar* o **▶ Correr** (abre PowerShell parado en la primera carpeta pinneada y lo ejecuta).
  - **Tareas:** todas las `- [ ]` de todas las notas del proyecto en un solo lugar; se tildan desde ahí.
  - **Bitácora:** una línea por avance con fecha automática. Para retomar después de días y para la IA.

Las notas se agrupan en **secciones** (clic derecho en el título de la sección o en una nota para mover/renombrar). Los proyectos nuevos arrancan con una plantilla de notas y contexto. Clic derecho en el nombre del proyecto (arriba, centrado): copiar todo para la IA, **exportar a carpeta** como archivos `.md`, renombrar, eliminar.

**Bandeja y atajo global:** la X esconde la ventana a la bandeja del sistema (ícono al lado del reloj); `Ctrl+Shift+Space` la muestra/oculta desde cualquier app. "Salir" está en el menú del ícono de la bandeja.

Atajos: `Ctrl+K` buscar en todos los proyectos · `Ctrl+Z` / `Ctrl+Shift+Z` deshacer / rehacer · `Ctrl+N` nueva nota · `Ctrl+B` barra lateral · `Ctrl+E` vista/edición · `Ctrl+1..6` pestañas · `Ctrl+Shift+Space` mostrar/ocultar.

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
