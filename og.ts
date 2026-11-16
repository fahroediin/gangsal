// Gambar pratinjau tautan (Open Graph) 1200x630 per hasil, dirender ke PNG di server.
import { Resvg } from "@resvg/resvg-js";
import { DIMS, level, persona } from "./public/core.js";
import { characterSVG } from "./public/character.js";

// Liberation Sans ada di AlmaLinux bawaan; Arial untuk Windows/macOS saat pengembangan.
const FONT = "Liberation Sans, Arial, DejaVu Sans, sans-serif";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

export function ogSVG(s: Record<string, number>, host: string): string {
  const char = characterSVG(s as any, { animate: false })
    .replace('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 260" role="img">',
      '<svg x="40" y="45" width="500" height="542" viewBox="0 0 240 260">');
  const name = persona(s as any);
  const bx = 600, bw = 520;
  const rows = DIMS.map((d, i) => {
    const v = s[d.key], y = 230 + i * 74, lv = level(v);
    const fill = lv === "rendah" ? "#A9502A" : "#1B6A55";
    return `<text x="${bx}" y="${y}" font-family="${FONT}" font-size="26" font-weight="600" fill="#141B18">${esc(d.name)}</text>
<text x="${bx + bw}" y="${y}" text-anchor="end" font-family="${FONT}" font-size="26" font-weight="700" fill="#141B18">${v}</text>
<rect x="${bx}" y="${y + 14}" width="${bw}" height="16" rx="8" fill="#DCE3E0"/>
<rect x="${bx}" y="${y + 14}" width="${Math.max(bw * v / 100, 16)}" height="16" rx="8" fill="${fill}"/>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#F3F5F4"/>
<rect x="40" y="45" width="500" height="540" rx="32" fill="#E4ECE8"/>
${char}
<text x="${bx}" y="105" font-family="${FONT}" font-size="22" font-weight="600" letter-spacing="2" fill="#4F5A56">GANGSAL · TES BIG FIVE</text>
<text x="${bx}" y="160" font-family="${FONT}" font-size="${name.length > 26 ? 34 : 42}" font-weight="700" fill="#141B18">${esc(name)}</text>
${rows}
<text x="${bx}" y="605" font-family="${FONT}" font-size="20" fill="#4F5A56">${esc(host)}</text>
</svg>`;
}

// Cache LRU di memori. ~55 KB per gambar, jadi 300 gambar sekitar 16 MB (VPS hanya 1 GB).
const CACHE_MAX = 300;
const cache = new Map<string, Uint8Array>();
export function ogCached(code: string, host: string): boolean {
  return cache.has(code + "|" + host);
}
export function ogPNG(code: string, s: Record<string, number>, host: string): Uint8Array {
  const key = code + "|" + host;
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit; }   // geser ke paling baru
  const png = new Resvg(ogSVG(s, host), { font: { loadSystemFonts: true, defaultFontFamily: "Liberation Sans", sansSerifFamily: "Liberation Sans" } }).render().asPng();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, png);
  return png;
}
