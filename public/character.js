// Karakter "Gangsal": makhluk bulat yang bentuk dan geraknya dibangun dari lima skor.
//   Ekstraversi    -> ukuran tubuh, tangan melambai, kecepatan melompat
//   Keramahan      -> lengkung senyum, pipi merona, hati kecil
//   Kehati-hatian  -> dasi kupu-kupu dan kacamata (tinggi) atau rambut acak (rendah)
//   Stabilitas     -> alis tenang, napas pelan (tinggi) atau alis cemas, keringat, gemetar (rendah)
//   Imajinasi      -> jumlah antena dan kerlip bintang di sekitar
// Warna tubuh mengikuti sifat yang paling menonjol. Tanpa teks, jadi bisa dirender server tanpa font.

const COLORS = { E: "#F4845F", A: "#EE8FAE", C: "#5B8DEF", S: "#4FBF95", I: "#A77BE0" };
const BELLY = { E: "#FBC3A9", A: "#F8C9D8", C: "#B7CDF7", S: "#A9E2CB", I: "#D6C1F1" };
const INK = "#1E2421";

function dominant(s) {
  let best = "S", d = -1;
  for (const k of ["E", "A", "C", "S", "I"]) { const x = Math.abs(s[k] - 50); if (x > d) { d = x; best = k; } }
  return best;
}
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * @param {{E:number,A:number,C:number,S:number,I:number}} s skor 0..100
 * @param {{animate?:boolean, background?:string|null, title?:string}} opt
 */
export function characterSVG(s, opt = {}) {
  const animate = opt.animate !== false;
  const t = k => Math.max(0, Math.min(100, s[k])) / 100;
  const dom = dominant(s);
  const body = COLORS[dom], belly = BELLY[dom];
  const scale = lerp(0.82, 1.08, t("E"));
  const bounceDur = lerp(2.6, 1.1, t("E")).toFixed(2);
  const bounceAmp = lerp(3, 12, t("E")).toFixed(1);
  const smile = lerp(-2, 13, t("A"));
  const cheek = lerp(0, 0.75, t("A")).toFixed(2);
  const worried = t("S") < 0.35;
  const calm = t("S") > 0.65;
  const brow = lerp(9, -3, t("S"));            // >0: ujung dalam alis naik = cemas
  const antennas = t("I") > 0.65 ? 2 : t("I") >= 0.35 ? 1 : 0;
  const sparkles = Math.round(lerp(0, 5, Math.max(0, t("I") - 0.3) / 0.7));
  const tidy = t("C") > 0.65, messy = t("C") < 0.35;
  const waveBoth = t("E") > 0.65, waveOne = t("E") >= 0.35 && !waveBoth;
  const heart = t("A") > 0.7;

  const cx = 120, cy = 150;
  const R = 62;
  const parts = [];

  // antena
  const ant = [];
  if (antennas >= 1) ant.push([-18, -1]);
  if (antennas === 2) ant.push([18, 1]);
  if (antennas === 1) ant[0] = [0, 0];
  for (const [dx, dir] of ant) {
    const x0 = cx + dx, y0 = cy - R + 6, x1 = x0 + dir * 10, y1 = y0 - 38;
    parts.push(`<path d="M${x0} ${y0} Q${x0 + dir * 14} ${y0 - 18} ${x1} ${y1}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      `<circle class="glow" cx="${x1}" cy="${y1}" r="8" fill="#FFD666" stroke="${INK}" stroke-width="3"/>`);
  }
  // rambut acak (kehati-hatian rendah)
  if (messy) parts.push(`<path d="M${cx - 16} ${cy - R + 4} l-6 -18 M${cx - 4} ${cy - R} l2 -22 M${cx + 10} ${cy - R + 2} l10 -16" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`);

  // tangan
  const armL = `<path d="M${cx - R + 6} ${cy + 6} q-26 ${waveBoth ? -34 : 10} -30 ${waveBoth ? -46 : 22}" stroke="${body}" stroke-width="16" fill="none" stroke-linecap="round"/>`;
  const armR = `<path d="M${cx + R - 6} ${cy + 6} q26 ${waveBoth || waveOne ? -34 : 10} 30 ${waveBoth || waveOne ? -46 : 22}" stroke="${body}" stroke-width="16" fill="none" stroke-linecap="round"/>`;
  parts.push(`<g class="${waveBoth ? "wave-l" : ""}" style="transform-origin:${cx - R + 6}px ${cy + 6}px">${armL}</g>`);
  parts.push(`<g class="${waveBoth || waveOne ? "wave-r" : ""}" style="transform-origin:${cx + R - 6}px ${cy + 6}px">${armR}</g>`);

  // kaki
  parts.push(`<ellipse cx="${cx - 24}" cy="${cy + R - 2}" rx="17" ry="11" fill="${body}" stroke="${INK}" stroke-width="3"/>`,
             `<ellipse cx="${cx + 24}" cy="${cy + R - 2}" rx="17" ry="11" fill="${body}" stroke="${INK}" stroke-width="3"/>`);
  // tubuh
  parts.push(`<path d="M${cx} ${cy - R} C${cx + R * 0.9} ${cy - R} ${cx + R} ${cy - R * 0.35} ${cx + R} ${cy + R * 0.2} C${cx + R} ${cy + R * 0.85} ${cx + R * 0.55} ${cy + R} ${cx} ${cy + R} C${cx - R * 0.55} ${cy + R} ${cx - R} ${cy + R * 0.85} ${cx - R} ${cy + R * 0.2} C${cx - R} ${cy - R * 0.35} ${cx - R * 0.9} ${cy - R} ${cx} ${cy - R} Z" fill="${body}" stroke="${INK}" stroke-width="3.5"/>`);
  parts.push(`<ellipse cx="${cx}" cy="${cy + 26}" rx="${R * 0.55}" ry="${R * 0.42}" fill="${belly}"/>`);
  if (heart) { const hx = cx - 30, hy = cy + 44; parts.push(`<path class="beat" style="transform-origin:${hx}px ${hy - 8}px" d="M${hx} ${hy} l-9 -9 a5.8 5.8 0 0 1 9 -7.5 a5.8 5.8 0 0 1 9 7.5 Z" fill="#E0465E" stroke="${INK}" stroke-width="1.5"/>`); }

  // mata
  const ey = cy - 14, ex = 22;
  if (calm) {
    parts.push(`<g class="eyes"><path d="M${cx - ex - 8} ${ey} q8 -8 16 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M${cx + ex - 8} ${ey} q8 -8 16 0" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/></g>`);
  } else {
    parts.push(`<g class="eyes blink" style="transform-origin:${cx}px ${ey}px"><ellipse cx="${cx - ex}" cy="${ey}" rx="7" ry="9" fill="${INK}"/><ellipse cx="${cx + ex}" cy="${ey}" rx="7" ry="9" fill="${INK}"/><circle cx="${cx - ex + 2.5}" cy="${ey - 3}" r="2.4" fill="#fff"/><circle cx="${cx + ex + 2.5}" cy="${ey - 3}" r="2.4" fill="#fff"/></g>`);
  }
  // alis
  const by = ey - 17;
  parts.push(`<path d="M${cx - ex - 9} ${by + brow * 0.2} L${cx - ex + 8} ${by - brow * 0.6}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`,
             `<path d="M${cx + ex + 9} ${by + brow * 0.2} L${cx + ex - 8} ${by - brow * 0.6}" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>`);
  // kacamata (kehati-hatian tinggi)
  if (tidy) parts.push(`<g fill="none" stroke="${INK}" stroke-width="3"><circle cx="${cx - ex}" cy="${ey}" r="14"/><circle cx="${cx + ex}" cy="${ey}" r="14"/><path d="M${cx - ex + 14} ${ey} h${2 * ex - 28}"/></g>`);
  // pipi
  parts.push(`<ellipse cx="${cx - ex - 14}" cy="${ey + 18}" rx="9" ry="5.5" fill="#E0465E" opacity="${cheek}"/>`,
             `<ellipse cx="${cx + ex + 14}" cy="${ey + 18}" rx="9" ry="5.5" fill="#E0465E" opacity="${cheek}"/>`);
  // mulut
  const my = cy + 8;
  parts.push(`<path d="M${cx - 15} ${my} Q${cx} ${my + smile} ${cx + 15} ${my}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round"/>`);
  // dasi kupu-kupu
  if (tidy || (!messy && t("C") > 0.5)) parts.push(`<path d="M${cx} ${cy + R - 30} l-13 -8 v16 Z M${cx} ${cy + R - 30} l13 -8 v16 Z" fill="${INK}"/>`);
  // keringat (stabilitas rendah)
  if (worried) parts.push(`<path class="drip" d="M${cx + R - 6} ${cy - R + 22} q7 11 0 15 q-7 -4 0 -15 Z" fill="#7CC6F2" stroke="${INK}" stroke-width="2"/>`);

  // bintang (imajinasi)
  const spots = [[34, 64], [206, 74], [26, 168], [214, 176], [120, 22]];
  const stars = spots.slice(0, sparkles).map(([x, y], i) =>
    `<path class="twinkle" style="animation-delay:${(i * 0.37).toFixed(2)}s;transform-origin:${x}px ${y}px" d="M${x} ${y - 9} L${x + 3} ${y - 3} L${x + 9} ${y} L${x + 3} ${y + 3} L${x} ${y + 9} L${x - 3} ${y + 3} L${x - 9} ${y} L${x - 3} ${y - 3} Z" fill="#FFD666" stroke="${INK}" stroke-width="1.5"/>`).join("");

  const css = animate ? `<style>
.bob{animation:bob ${bounceDur}s ease-in-out infinite;transform-origin:${cx}px ${cy + R}px}
@keyframes bob{0%,100%{transform:translateY(0) scale(1,1)}45%{transform:translateY(-${bounceAmp}px) scale(.98,1.03)}90%{transform:translateY(0) scale(1.03,.97)}}
.shadow{animation:shade ${bounceDur}s ease-in-out infinite;transform-origin:${cx}px ${cy + R + 14}px}
@keyframes shade{45%{transform:scaleX(.82);opacity:.12}}
.blink{animation:blink 4.2s infinite}
@keyframes blink{0%,94%,100%{transform:scaleY(1)}97%{transform:scaleY(.1)}}
.wave-r{animation:waveR 1.4s ease-in-out infinite}
.wave-l{animation:waveL 1.4s ease-in-out infinite .2s}
@keyframes waveR{0%,100%{transform:rotate(0)}50%{transform:rotate(-16deg)}}
@keyframes waveL{0%,100%{transform:rotate(0)}50%{transform:rotate(16deg)}}
.twinkle{animation:tw 1.8s ease-in-out infinite}
@keyframes tw{0%,100%{transform:scale(.6);opacity:.4}50%{transform:scale(1.1);opacity:1}}
.glow{animation:glow 2s ease-in-out infinite}
@keyframes glow{50%{opacity:.55}}
.beat{animation:beat 1.2s ease-in-out infinite}
@keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.18)}30%{transform:scale(1)}}
.drip{animation:drip 2.2s ease-in infinite}
@keyframes drip{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(26px);opacity:0}}
.jitter{animation:jit .5s steps(2) infinite}
@keyframes jit{0%{transform:translateX(-1px)}100%{transform:translateX(1px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>` : "";

  const bg = opt.background ? `<rect width="240" height="260" rx="24" fill="${opt.background}"/>` : "";
  const title = opt.title ? `<title>${String(opt.title).replace(/[<&]/g, "")}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 260" role="img">${title}${css}${bg}
<ellipse class="shadow" cx="${cx}" cy="${cy + R + 14}" rx="${54 * scale}" ry="9" fill="${INK}" opacity=".18"/>
${stars}
<g transform="translate(${cx} ${cy + R}) scale(${scale.toFixed(3)}) translate(${-cx} ${-(cy + R)})"><g class="${worried ? "jitter" : ""}"><g class="bob">${parts.join("")}</g></g></g>
</svg>`;
}
