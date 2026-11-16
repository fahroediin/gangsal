// Server Gangsal: file statis dari public/, halaman share /h/<kode>, gambar karakter /c/<kode>.svg,
// dan API rekap anonim di SQLite. Skor selalu dihitung ulang di server dari jawaban mentah.
// Jalankan: bun server.ts   (env: PORT, HOST, DB_PATH, TRUST_PROXY=1 bila di belakang nginx)
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, normalize, dirname } from "node:path";
import { ITEMS, DIMS, score, level, decode, persona } from "./public/core.js";
import { characterSVG } from "./public/character.js";
import { ogPNG } from "./og.ts";

const PORT = Number(process.env.PORT ?? 5178);
const HOST = process.env.HOST ?? "127.0.0.1";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const ROOT = import.meta.dir;
const PUBLIC = join(ROOT, "public");
const DB_PATH = process.env.DB_PATH ?? join(ROOT, "data", "gangsal.sqlite");

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`CREATE TABLE IF NOT EXISTS results (
  cid TEXT PRIMARY KEY,
  answers TEXT NOT NULL,           -- 50 digit 1..5, urutan sama dengan ITEMS (untuk uji reliabilitas)
  e INTEGER NOT NULL, a INTEGER NOT NULL, c INTEGER NOT NULL, s INTEGER NOT NULL, i INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
const upsert = db.prepare(`INSERT INTO results (cid,answers,e,a,c,s,i,created_at,updated_at)
  VALUES ($cid,$answers,$e,$a,$c,$s,$i,$now,$now)
  ON CONFLICT(cid) DO UPDATE SET answers=excluded.answers,e=excluded.e,a=excluded.a,c=excluded.c,s=excluded.s,i=excluded.i,updated_at=excluded.updated_at`);
const allScores = db.prepare("SELECT e,a,c,s,i FROM results");

const CID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Batas sederhana per IP: 20 kiriman per jam.
const RATE_MAX = 20, RATE_WINDOW = 60 * 60 * 1000;
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW);
  if (list.length >= RATE_MAX) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < RATE_WINDOW)) hits.delete(k);
  return false;
}

export function validate(body: any):
  | { ok: true; row: Record<string, string | number>; scores: Record<string, number> }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body" };
  const { cid, answers } = body;
  if (typeof cid !== "string" || !CID_RE.test(cid)) return { ok: false, error: "cid" };
  if (!Array.isArray(answers) || answers.length !== ITEMS.length) return { ok: false, error: "answers" };
  if (!answers.every((v) => Number.isInteger(v) && v >= 1 && v <= 5)) return { ok: false, error: "answers" };
  const s = score(answers);
  return {
    ok: true, scores: s,
    row: { $cid: cid, $answers: answers.join(""), $e: s.E, $a: s.A, $c: s.C, $s: s.S, $i: s.I, $now: Date.now() },
  };
}

let statsCache: { at: number; body: string } | null = null;
function stats(): string {
  if (statsCache && Date.now() - statsCache.at < 10_000) return statsCache.body;
  const rows = allScores.all() as Record<string, number>[];
  const map: Record<string, string> = { E: "e", A: "a", C: "c", S: "s", I: "i" };
  const avg: Record<string, number> = {}, levels: Record<string, Record<string, number>> = {};
  for (const d of DIMS) {
    const col = map[d.key];
    const vals = rows.map((r) => r[col]);
    avg[d.key] = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : 50;
    levels[d.key] = { rendah: 0, sedang: 0, tinggi: 0 };
    for (const v of vals) levels[d.key][level(v)]++;
  }
  const body = JSON.stringify({ total: rows.length, avg, levels });
  statsCache = { at: Date.now(), body };
  return body;
}

const SECURITY: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
const json = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY } });
const notFound = () => new Response("Tidak ditemukan", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", ...SECURITY } });

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** index.html dengan meta Open Graph khusus hasil, supaya pratinjau tautan menampilkan nama karakter. */
export function sharePage(code: string, origin: string): string | null {
  const s = decode(code);
  if (!s) return null;
  const html = readFileSync(join(PUBLIC, "index.html"), "utf8");
  const name = persona(s);
  const desc = DIMS.map((d) => `${d.short} ${s[d.key]}`).join(" · ") + ". Ikut tes dan buat karaktermu.";
  const meta = [
    `<meta name="description" content="${escAttr(desc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escAttr(name + " | Gangsal")}">`,
    `<meta property="og:description" content="${escAttr(desc)}">`,
    `<meta property="og:url" content="${escAttr(origin + "/h/" + code)}">`,
    `<meta property="og:image" content="${escAttr(origin + "/og/" + code + ".png")}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escAttr("Karakter " + name)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n");
  return html
    .replace(/<!--META-->[\s\S]*?<!--\/META-->/, meta)
    .replace(/<title>[^<]*<\/title>/, `<title>${escAttr(name)} | Gangsal</title>`);
}

export function startServer(port = PORT) {
  return Bun.serve({
    port, hostname: HOST,
    async fetch(req, server) {
      const url = new URL(req.url);
      const path = url.pathname.replace(/\/{2,}/g, "/");
      const ip = (TRUST_PROXY && req.headers.get("x-real-ip")) || server.requestIP(req)?.address || "unknown";
      const origin = TRUST_PROXY ? `https://${req.headers.get("host") ?? url.host}` : url.origin;

      if (path === "/api/results") {
        if (req.method !== "POST") return json('{"error":"method"}', 405);
        if (!(req.headers.get("content-type") ?? "").includes("application/json")) return json('{"error":"content-type"}', 415);
        if (Number(req.headers.get("content-length") ?? 0) > 2048) return json('{"error":"too_large"}', 413);
        if (limited(ip)) return json('{"error":"rate_limited"}', 429);
        let body: unknown;
        try { const text = await req.text(); if (text.length > 2048) return json('{"error":"too_large"}', 413); body = JSON.parse(text); }
        catch { return json('{"error":"json"}', 400); }
        const v = validate(body);
        if (!v.ok) return json(JSON.stringify({ error: v.error }), 400);
        upsert.run(v.row as any);
        statsCache = null;
        return json(JSON.stringify({ ok: true, scores: v.scores }), 201);
      }
      if (path === "/api/stats") {
        if (req.method !== "GET") return json('{"error":"method"}', 405);
        return json(stats());
      }
      if (path.startsWith("/api/")) return json('{"error":"not_found"}', 404);
      if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method Not Allowed", { status: 405, headers: SECURITY });

      // /h/<kode>: halaman hasil yang dibagikan
      if (path.startsWith("/h/")) {
        const html = sharePage(decodeURIComponent(path.slice(3)), origin);
        if (!html) return Response.redirect(origin + "/", 302);
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", ...SECURITY } });
      }
      // /og/<kode>.png: gambar pratinjau tautan untuk media sosial
      const om = /^\/og\/([\d-]+)\.png$/.exec(path);
      if (om) {
        const s = decode(om[1]);
        if (!s) return notFound();
        try {
          return new Response(ogPNG(om[1], s, new URL(origin).host), {
            headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800", ...SECURITY },
          });
        } catch (e) {
          console.error("og render gagal", e);
          return new Response("Gagal membuat gambar", { status: 500, headers: SECURITY });
        }
      }
      // /c/<kode>.svg: karakter animasi sebagai gambar mandiri
      const cm = /^\/c\/([\d-]+)\.svg$/.exec(path);
      if (cm) {
        const s = decode(cm[1]);
        if (!s) return notFound();
        return new Response(characterSVG(s, { background: "#E4ECE8", title: persona(s) }), {
          headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", ...SECURITY },
        });
      }

      const rel = path === "/" ? "/index.html" : decodeURIComponent(path);
      const file = normalize(join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC + (PUBLIC.includes("\\") ? "\\" : "/")) || !existsSync(file)) return notFound();
      const ext = file.slice(file.lastIndexOf("."));
      return new Response(Bun.file(file), {
        headers: { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "no-cache", ...SECURITY },
      });
    },
  });
}

if (import.meta.main) {
  const s = startServer();
  console.log(`Gangsal berjalan di http://${s.hostname}:${s.port} (db: ${DB_PATH})`);
}
