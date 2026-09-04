// Perfiles de proyecto: con qué notas, bloques de contexto, prompts y comandos
// arranca un proyecto según el tipo de trabajo. Los cimientos son los mismos
// para todos; cambia solo la plantilla.

export type ProfileId = "blank" | "app" | "novel" | "content" | "study";

export interface ProfileTemplate {
  id: ProfileId;
  name: string;
  hint: string;
  notes: { title: string; body: string; group: string }[];
  blocks: { title: string; body: string; enabled: boolean }[];
  prompts: { title: string; body: string }[];
  snippets: { title: string; body: string; kind: "command" | "text" }[];
}


export const PROFILES: ProfileTemplate[] = [
  {
    id: "app",
    name: "App / software",
    hint: "Stack, decisiones, bugs, deploy. Pensado para vibe coding.",
    notes: [
      { title: "Idea principal", body: "# {name}\n\n¿Qué problema resuelve y para quién?\n\n", group: "General" },
      { title: "Requisitos", body: "## Debe tener\n- [ ] \n\n## Estaría bueno\n- [ ] \n", group: "General" },
      { title: "Tareas", body: "## Hoy\n- [ ] \n\n## Después\n- [ ] \n", group: "General" },
      { title: "Bugs conocidos", body: "- [ ] \n", group: "Desarrollo" },
      { title: "Deploy", body: "Dónde está publicado, cómo se despliega, variables de entorno (sin secretos).\n", group: "Desarrollo" },
      { title: "Ideas", body: "- \n", group: "Ideas futuras" },
    ],
    blocks: [
      { title: "Qué es", body: "{name}: (una o dos líneas: qué hace y para quién)", enabled: true },
      { title: "Stack", body: "- Frontend:\n- Backend / base de datos:\n- Hosting:\n- Otras herramientas:", enabled: true },
      { title: "Decisiones tomadas", body: "- (fecha) decisión — por qué", enabled: true },
      { title: "Convenciones", body: "- Idioma de la UI:\n- Estilo de código:\n- Cómo nombro las cosas:", enabled: true },
      { title: "Estado actual", body: "- Hecho:\n- En progreso:\n- Pendiente:", enabled: true },
    ],
    prompts: [
      { title: "Arranque de chat", body: "Sos un desarrollador senior. Trabajamos sobre el proyecto que describo abajo. Antes de proponer código, confirmá que entendiste el stack y las convenciones. Respondé en español y de forma concreta." },
      { title: "Revisar diff", body: "Revisá este cambio buscando bugs, casos borde y problemas de seguridad. Listá primero lo grave. No reescribas todo: proponé el cambio mínimo.\n\n{{diff}}" },
      { title: "Explicar error", body: "Tengo este error. Explicá la causa más probable en dos líneas y después el fix.\n\n{{error}}" },
    ],
    snippets: [
      { title: "Dev", body: "npm run dev", kind: "command" },
      { title: "Instalar", body: "npm install", kind: "command" },
      { title: "Estado git", body: "git status", kind: "command" },
    ],
  },
  {
    id: "novel",
    name: "Novela / escritura",
    hint: "Fichas de personajes, lugares y escenas; guía de estilo; capítulos.",
    notes: [
      { title: "Premisa", body: "# {name}\n\n¿De qué trata, en tres líneas? ¿Qué pregunta hace la historia?\n\n", group: "General" },
      { title: "Tareas", body: "- [ ] \n", group: "General" },
      { title: "Línea de tiempo", body: "- \n", group: "Biblia" },
      { title: "Reglas del mundo", body: "Lo que puede y no puede pasar. Magia, tecnología, política, época.\n", group: "Biblia" },
      { title: "Capítulo 1", body: "", group: "Capítulos" },
      { title: "Ideas sueltas", body: "- \n", group: "Ideas futuras" },
    ],
    blocks: [
      { title: "Qué es", body: "{name}: (género, extensión, público, en qué etapa está)", enabled: true },
      { title: "Guía de estilo", body: "- Persona narrativa y tiempo:\n- Tono:\n- Frases cortas o largas:\n- Palabras o recursos que NO quiero:\n- Un párrafo mío de ejemplo:", enabled: true },
      { title: "Reglas del mundo", body: "- ", enabled: false },
      { title: "Resumen hasta acá", body: "Qué pasó en los capítulos anteriores, en orden. Actualizarlo al cerrar cada sesión.", enabled: true },
    ],
    prompts: [
      { title: "Continuar escena", body: "Continuá la escena desde donde termina, respetando la guía de estilo y la voz de los personajes. No resuelvas el conflicto todavía. Máximo {{palabras}} palabras.\n\n{{escena}}" },
      { title: "Corregir sin cambiar la voz", body: "Corregí ortografía, puntuación y repeticiones de este texto. NO cambies el estilo, el ritmo ni las decisiones del autor. Devolvé el texto corregido y, aparte, una lista corta de qué tocaste.\n\n{{texto}}" },
      { title: "Detectar inconsistencias", body: "Compará este capítulo con la biblia y el resumen. Listá inconsistencias de personajes, lugares, tiempo o reglas del mundo. Si no hay, decilo.\n\n{{capitulo}}" },
    ],
    snippets: [],
  },
  {
    id: "content",
    name: "Contenido / marca",
    hint: "Canal, cuenta o marca: voz, audiencia, calendario de piezas.",
    notes: [
      { title: "Sobre el canal", body: "# {name}\n\n¿Qué hago, para quién, y qué me diferencia?\n\n", group: "General" },
      { title: "Calendario", body: "## Esta semana\n- [ ] \n\n## Próximas\n- [ ] \n", group: "General" },
      { title: "Ideas de piezas", body: "- \n", group: "Ideas" },
      { title: "Qué funcionó", body: "Piezas que anduvieron bien y por qué.\n", group: "Aprendizajes" },
    ],
    blocks: [
      { title: "Qué es", body: "{name}: (plataforma, tema, frecuencia)", enabled: true },
      { title: "Voz de marca", body: "- Tono:\n- Cómo trato al público (vos / tú / usted):\n- Palabras que uso siempre:\n- Lo que nunca diría:", enabled: true },
      { title: "Audiencia", body: "- Quién es:\n- Qué le duele:\n- Qué quiere lograr:", enabled: true },
      { title: "Formatos", body: "- Video largo:\n- Short / reel:\n- Post:", enabled: false },
    ],
    prompts: [
      { title: "Guion", body: "Escribí un guion para {{formato}} sobre {{tema}}, con la voz de marca. Gancho en los primeros 5 segundos, desarrollo en 3 puntos, cierre con llamada a la acción." },
      { title: "Ganchos", body: "Dame 10 ganchos distintos (primera frase) para una pieza sobre {{tema}}. Cortos, concretos, sin clickbait vacío." },
      { title: "Descripción + tags", body: "Escribí la descripción y 10 tags para esta pieza:\n\n{{resumen}}" },
    ],
    snippets: [],
  },
  {
    id: "study",
    name: "Estudio / investigación",
    hint: "Aprender algo: glosario, fuentes, dudas abiertas.",
    notes: [
      { title: "Objetivo", body: "# {name}\n\n¿Qué quiero poder hacer o entender al final?\n\n", group: "General" },
      { title: "Plan", body: "- [ ] \n", group: "General" },
      { title: "Glosario", body: "- **Término**: definición corta con mis palabras\n", group: "Apuntes" },
      { title: "Lo que ya entendí", body: "", group: "Apuntes" },
      { title: "Dudas abiertas", body: "- [ ] \n", group: "Apuntes" },
      { title: "Fuentes", body: "- \n", group: "Apuntes" },
    ],
    blocks: [
      { title: "Qué estudio", body: "{name}: (tema, nivel actual, para qué)", enabled: true },
      { title: "Cómo me gusta aprender", body: "- Ejemplos antes que teoría / teoría antes que ejemplos\n- Comparaciones con lo que ya sé:\n- Idioma:", enabled: true },
      { title: "Lo que ya sé", body: "- ", enabled: true },
    ],
    prompts: [
      { title: "Explicámelo", body: "Explicá {{tema}} como si yo supiera lo que dice mi contexto y nada más. Primero la idea en una frase, después un ejemplo, después el detalle." },
      { title: "Preguntas de repaso", body: "Hacé 5 preguntas de repaso sobre {{tema}}, de fácil a difícil. No me des las respuestas hasta que conteste." },
    ],
    snippets: [],
  },
  {
    id: "blank",
    name: "En blanco",
    hint: "Una nota y nada más.",
    notes: [{ title: "Nueva nota", body: "", group: "General" }],
    blocks: [{ title: "Qué es", body: "", enabled: true }],
    prompts: [],
    snippets: [],
  },
];

export const profileById = (id: ProfileId) => PROFILES.find((p) => p.id === id) ?? PROFILES[PROFILES.length - 1];
