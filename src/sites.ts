// Sitios conocidos → insignia (letras + color) para el tablero de accesos.
// Son insignias propias, no logos: alcanza para reconocer el sitio de un vistazo.

export interface SiteBadge {
  label: string;
  bg: string;
  fg?: string;
}

const SITES: [RegExp, SiteBadge][] = [
  [/youtube\.com|youtu\.be/, { label: "▶", bg: "#e62117" }],
  [/instagram\.com/, { label: "IG", bg: "linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)" }],
  [/tiktok\.com/, { label: "TT", bg: "#111", fg: "#69c9d0" }],
  [/(^|\.)x\.com|twitter\.com/, { label: "X", bg: "#000" }],
  [/facebook\.com/, { label: "f", bg: "#1877f2" }],
  [/github\.com/, { label: "GH", bg: "#24292f" }],
  [/vercel\.com/, { label: "▲", bg: "#000" }],
  [/supabase\.com|supabase\.co/, { label: "S", bg: "#3ecf8e", fg: "#0b2e1d" }],
  [/cloudflare\.com/, { label: "CF", bg: "#f6821f" }],
  [/claude\.ai|anthropic\.com/, { label: "C", bg: "#d97757" }],
  [/chatgpt\.com|openai\.com/, { label: "GPT", bg: "#10a37f" }],
  [/gemini\.google|aistudio\.google/, { label: "G", bg: "#4285f4" }],
  [/notion\.so|notion\.site/, { label: "N", bg: "#000" }],
  [/figma\.com/, { label: "Fg", bg: "#a259ff" }],
  [/drive\.google|docs\.google|sheets\.google/, { label: "Dr", bg: "#34a853" }],
  [/canva\.com/, { label: "Cv", bg: "#00c4cc" }],
  [/discord\.com|discord\.gg/, { label: "Dc", bg: "#5865f2" }],
  [/linkedin\.com/, { label: "in", bg: "#0a66c2" }],
  [/reddit\.com/, { label: "r/", bg: "#ff4500" }],
  [/stripe\.com/, { label: "St", bg: "#635bff" }],
  [/mercadopago|mercadolibre/, { label: "ML", bg: "#ffe600", fg: "#2d3277" }],
  [/localhost|127\.0\.0\.1/, { label: "⌂", bg: "#555" }],
];

export function siteBadge(url: string): SiteBadge | null {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [re, b] of SITES) if (re.test(host)) return b;
  // Desconocido: primera letra del dominio con un color derivado del nombre.
  const name = host.replace(/^www\./, "").split(".")[0];
  if (!name) return null;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return { label: name.slice(0, 2).toUpperCase(), bg: `hsl(${h} 45% 42%)` };
}
