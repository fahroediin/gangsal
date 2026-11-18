// Server Gangsal: file statis dari public/, halaman share /h/<kode>, gambar karakter /c/<kode>.svg,
// gambar pratinjau /og/<kode>.png, dan API rekap anonim di SQLite. Skor selalu dihitung ulang di server.
// Jalankan: bun server.ts   (env: PORT, HOST, DB_PATH, TRUST_PROXY=1 bila di belakang nginx)
import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, statSync, chmodSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { join, normalize, dirname, sep } from "node:path";
import { ITEMS, DIMS, dims, score, level, decode, persona, personaKey, personaName, normsReady, CONSENT_VERSION } from "./public/core.js";
import { characterSVG } from "./public/character.js";
import { ogPNG, ogCached } from "./og.ts";

const PORT = Number(process.env.PORT ?? 5178);
const HOST = process.env.HOST ?? "127.0.0.1";
const TRUST_PROXY = process.env.TRUST_PROXY === "1";
const ROOT = import.meta.dir;
const PUBLIC = join(ROOT, "public");
const DB_PATH = process.env.DB_PATH ?? join(ROOT, "data", "gangsal.sqlite");

// Folder data hanya bisa dibaca pemilik proses.
mkdirSync(dirname(DB_PATH), { recursive: true, mode: 0o700 });
const db = new Database(DB_PATH, { create: true });
try { chmodSync(dirname(DB_PATH), 0o700); chmodSync(DB_PATH, 0o600); } catch { /* Windows: abaikan */ }
db.exec("PRAGMA journal_mode = WAL;");
db.exec(`CREATE TABLE IF NOT EXISTS results (
  cid TEXT PRIMARY KEY,
  answers TEXT NOT NULL,           -- 50 digit 1..5, urutan sama dengan ITEMS (untuk uji reliabilitas)
  e INTEGER NOT NULL, a INTEGER NOT NULL, c INTEGER NOT NULL, s INTEGER NOT NULL, i INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
// Semua akses database memakai prepared statement dengan parameter terikat (tanpa SQL dari input).
const upsert = db.prepare(`INSERT INTO results (cid,answers,e,a,c,s,i,created_at,updated_at)
  VALUES ($cid,$answers,$e,$a,$c,$s,$i,$now,$now)
  ON CONFLICT(cid) DO UPDATE SET answers=excluded.answers,e=excluded.e,a=excluded.a,c=excluded.c,s=excluded.s,i=excluded.i,updated_at=excluded.updated_at`);
const allScores = db.prepare("SELECT e,a,c,s,i FROM results");

/* ---------- undangan ---------- */
// Server hanya menyimpan data terenkripsi untuk nama dan judul; kuncinya ada di bagian # link milik pembuat.
db.exec(`CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  pub TEXT NOT NULL,                 -- kunci publik ECDH pembuat (untuk enkripsi nama)
  title_iv TEXT, title_ct TEXT,      -- judul terenkripsi (opsional)
  admin_hash TEXT NOT NULL,          -- SHA-256 token admin; token aslinya hanya di link rekap
  max_participants INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS invite_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL REFERENCES invites(code) ON DELETE CASCADE,
  cid TEXT NOT NULL,
  name_epk TEXT NOT NULL, name_iv TEXT NOT NULL, name_ct TEXT NOT NULL,   -- nama terenkripsi
  e INTEGER NOT NULL, a INTEGER NOT NULL, c INTEGER NOT NULL, s INTEGER NOT NULL, i INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(code, cid)
)`);
db.exec("CREATE INDEX IF NOT EXISTS invite_results_code ON invite_results(code)");
// Versi teks persetujuan yang disetujui peserta (UU PDP Pasal 22: persetujuan tertulis atau terekam).
try { db.exec("ALTER TABLE invite_results ADD COLUMN consent TEXT"); } catch { /* kolom sudah ada */ }
const inviteInsert = db.prepare(`INSERT INTO invites (code,pub,title_iv,title_ct,admin_hash,max_participants,created_at,expires_at)
  VALUES ($code,$pub,$tiv,$tct,$hash,$max,$now,$exp)`);
const inviteGet = db.prepare("SELECT * FROM invites WHERE code = $code");
const inviteCount = db.prepare("SELECT COUNT(*) AS n FROM invite_results WHERE code = $code");
const inviteResultInsert = db.prepare(`INSERT INTO invite_results (code,cid,name_epk,name_iv,name_ct,e,a,c,s,i,created_at,consent)
  VALUES ($code,$cid,$epk,$iv,$ct,$e,$a,$c,$s,$i,$now,$consent)`);
const inviteRows = db.prepare("SELECT id,name_epk,name_iv,name_ct,e,a,c,s,i,created_at,consent FROM invite_results WHERE code = $code ORDER BY id");
const inviteRowDel = db.prepare("DELETE FROM invite_results WHERE code = $code AND id = $id");
const inviteDelRows = db.prepare("DELETE FROM invite_results WHERE code = $code");
const inviteDel = db.prepare("DELETE FROM invites WHERE code = $code");
const cleanupRows = db.prepare("DELETE FROM invite_results WHERE code IN (SELECT code FROM invites WHERE expires_at < $cut)");
const cleanupInvites = db.prepare("DELETE FROM invites WHERE expires_at < $cut");

export const RETENTION_MS = 90 * 24 * 3600_000;
/** Hapus undangan beserta data per peserta 90 hari setelah batas waktunya habis. Skor anonim di rekap umum tetap ada. */
export function cleanupInvitesNow(now = Date.now()) {
  const cut = now - RETENTION_MS;
  db.transaction(() => { cleanupRows.run({ $cut: cut }); cleanupInvites.run({ $cut: cut }); })();
}
cleanupInvitesNow();
setInterval(() => { try { cleanupInvitesNow(); } catch (e) { console.error("pembersihan gagal", e); } }, 3600_000).unref?.();

const DURATIONS: Record<string, number> = { "1h": 3600_000, "1d": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000 };
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";   // tanpa 0/o/1/l/i yang mudah tertukar
const CODE_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;
const B64U = (min: number, max: number) => new RegExp(`^[A-Za-z0-9_-]{${min},${max}}$`);
const PUB_RE = B64U(87, 87), IV_RE = B64U(16, 16), HEX64 = /^[0-9a-f]{64}$/;
const NAME_CT_RE = B64U(22, 700), TITLE_CT_RE = B64U(22, 700), TOKEN_RE = B64U(43, 43);

function newCode(): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    if (!inviteGet.get({ $code: code })) return code;
  }
}
const sha256Hex = (t: string) => new Bun.CryptoHasher("sha256").update(t).digest("hex");
function adminOk(inv: any, token: string | null): boolean {
  if (!token || !TOKEN_RE.test(token)) return false;
  const a = Buffer.from(sha256Hex(token)), b = Buffer.from(String(inv.admin_hash));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateInvite(body: any):
  | { ok: true; row: Record<string, string | number | null> }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "body" };
  const { pub, title, adminHash, duration, maxParticipants } = body;
  if (typeof pub !== "string" || !PUB_RE.test(pub)) return { ok: false, error: "pub" };
  if (typeof adminHash !== "string" || !HEX64.test(adminHash)) return { ok: false, error: "adminHash" };
  if (typeof duration !== "string" || !(duration in DURATIONS)) return { ok: false, error: "duration" };
  if (maxParticipants !== null && maxParticipants !== undefined &&
      !(Number.isInteger(maxParticipants) && maxParticipants >= 1 && maxParticipants <= 500)) return { ok: false, error: "maxParticipants" };
  if (title !== null && title !== undefined &&
      !(title && typeof title === "object" && IV_RE.test(String(title.iv)) && TITLE_CT_RE.test(String(title.ct)))) return { ok: false, error: "title" };
  const now = Date.now();
  return { ok: true, row: {
    $pub: pub, $tiv: title ? title.iv : null, $tct: title ? title.ct : null, $hash: adminHash,
    $max: maxParticipants ?? null, $now: now, $exp: now + DURATIONS[duration],
  } };
}
function validName(n: any): boolean {
  return !!n && typeof n === "object" && PUB_RE.test(String(n.epk)) && IV_RE.test(String(n.iv)) && NAME_CT_RE.test(String(n.ct));
}
const publicInvite = (inv: any, now = Date.now()) => {
  const n = (inviteCount.get({ $code: inv.code }) as { n: number }).n;
  const full = inv.max_participants !== null && n >= inv.max_participants;
  return {
    code: inv.code, pub: inv.pub,
    title: inv.title_ct ? { iv: inv.title_iv, ct: inv.title_ct } : null,
    createdAt: inv.created_at, expiresAt: inv.expires_at,
    open: now < inv.expires_at && !full, full,
  };
};

const CID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 2048;

/* ---------- pembatas laju ---------- */
// Jendela geser per kunci. Kunci "*" dipakai sebagai batas global.
export function makeLimiter(max: number, windowMs: number, maxKeys = 20_000) {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) { hits.set(key, list); return true; }
    list.push(now); hits.set(key, list);
    if (hits.size > maxKeys) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      if (hits.size > maxKeys) hits.clear();   // banjir IP palsu: lebih baik reset daripada kehabisan memori
    }
    return false;
  };
}
const freshLimits = () => ({
  request: makeLimiter(600, 60_000),            // semua permintaan, per IP per menit
  writeIp: makeLimiter(20, 60 * 60_000),        // kirim hasil, per IP per jam
  writeAll: makeLimiter(600, 60 * 60_000),      // kirim hasil, total per jam (membatasi pertumbuhan database)
  ogIp: makeLimiter(12, 10 * 60_000),           // render gambar baru, per IP per 10 menit
  ogAll: makeLimiter(30, 60_000),               // render gambar baru, total per menit (melindungi CPU VPS)
  inviteIp: makeLimiter(10, 60 * 60_000),       // buat undangan, per IP per jam
  inviteAll: makeLimiter(300, 60 * 60_000),     // buat undangan, total per jam
  adminIp: makeLimiter(120, 10 * 60_000),       // buka/hapus rekap undangan, per IP per 10 menit
});
const LIMITS = freshLimits();
/** Hanya untuk tes: kosongkan semua pembatas laju. */
export function resetLimits() { Object.assign(LIMITS, freshLimits()); }

export function validate(body: any):
  | { ok: true; row: Record<string, string | number>; scores: Record<string, number> }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "body" };
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

// Skor yang mungkin keluar dari 10 jawaban 1..5: round(k * 2.5), k = 0..40.
const ACHIEVABLE = new Set(Array.from({ length: 41 }, (_, k) => Math.round(k * 2.5)));
/** Kode share yang valid dan bisa dihasilkan oleh tes sungguhan. */
export function shareCode(code: string) {
  const s = decode(code);
  if (!s || !DIMS.every((d) => ACHIEVABLE.has(s[d.key]))) return null;
  return s;
}

let statsCache: { at: number; body: string } | null = null;
function stats(): string {
  if (statsCache && Date.now() - statsCache.at < 10_000) return statsCache.body;
  const rows = allScores.all() as Record<string, number>[];
  const map: Record<string, string> = { E: "e", A: "a", C: "c", S: "s", I: "i" };
  const avg: Record<string, number> = {}, levels: Record<string, Record<string, number>> = {};
  // Norma sampel sendiri (rata-rata dan simpangan baku sampel), sesuai saran IPIP.
  const norms: Record<string, any> = { n: rows.length };
  for (const d of DIMS) {
    const vals = rows.map((r) => r[map[d.key]]);
    const mean = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 50;
    const sd = vals.length > 1 ? Math.sqrt(vals.reduce((t, v) => t + (v - mean) ** 2, 0) / (vals.length - 1)) : 0;
    norms[d.key] = { mean: Math.round(mean * 10) / 10, sd: Math.round(sd * 10) / 10 };
  }
  const ready = normsReady(norms);
  for (const d of DIMS) {
    const col = map[d.key];
    const vals = rows.map((r) => r[col]);
    avg[d.key] = vals.length ? Math.round(vals.reduce((x, y) => x + y, 0) / vals.length) : 50;
    levels[d.key] = { rendah: 0, sedang: 0, tinggi: 0 };
    for (const v of vals) levels[d.key][level(v, ready ? norms[d.key] : null)]++;
  }
  // Kelompok per karakter (persona): jumlah peserta dan rata-rata skor tiap kelompok.
  const groups = new Map<string, { n: number; sum: Record<string, number> }>();
  for (const r of rows) {
    const s = { E: r.e, A: r.a, C: r.c, S: r.s, I: r.i };
    const key = personaKey(s);
    const g = groups.get(key) ?? { n: 0, sum: { E: 0, A: 0, C: 0, S: 0, I: 0 } };
    g.n++; for (const k of Object.keys(s)) g.sum[k] += (s as any)[k];
    groups.set(key, g);
  }
  // key = kunci karakter (diterjemahkan di browser sesuai bahasa); name = nama bahasa Indonesia untuk klien lama.
  const personas = [...groups].map(([key, g]) => ({
    key, name: personaName(key), n: g.n, avg: Object.fromEntries(Object.entries(g.sum).map(([k, v]) => [k, Math.round(v / g.n)])),
  })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  const body = JSON.stringify({ total: rows.length, avg, levels, personas, norms, normsReady: ready });
  statsCache = { at: Date.now(), body };
  return body;
}

const SECURITY: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  ...(TRUST_PROXY ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
};
const json = (body: string, status = 200, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...SECURITY, ...extra } });
const text = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...SECURITY, ...extra } });
const notFound = () => text("Tidak ditemukan", 404);
const tooMany = (retry = 60) => text("Terlalu banyak permintaan. Coba lagi sebentar lagi.", 429, { "Retry-After": String(retry) });

const MIME: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8" };
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const safeDecode = (s: string): string | null => { try { return decodeURIComponent(s); } catch { return null; } };

/** Baca body sampai `max` byte; berhenti dan kembalikan null bila lebih (juga untuk body tanpa Content-Length). */
async function readCapped(req: Request, max: number): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { reader.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
  } catch { return null; }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/** Bahasa dari ?lang=en; selain itu bahasa Indonesia. */
const langOf = (url: URL): "id" | "en" => url.searchParams.get("lang") === "en" ? "en" : "id";
// index.html dibaca sekali saat start (bukan per permintaan).
const INDEX_HTML = readFileSync(join(PUBLIC, "index.html"), "utf8");

/** index.html dengan meta Open Graph khusus hasil, supaya pratinjau tautan menampilkan nama karakter. */
export function sharePage(code: string, origin: string, lang: "id" | "en" = "id"): string | null {
  const s = shareCode(code);
  if (!s) return null;
  const en = lang === "en", q = en ? "?lang=en" : "";
  const name = persona(s, lang);
  const desc = dims(lang).map((d) => `${d.short} ${s[d.key]}`).join(" · ") + (en ? ". Take the test and get your own character." : ". Ikut tes dan buat karaktermu.");
  const meta = [
    `<meta name="description" content="${escAttr(desc)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escAttr(name + " | Gangsal")}">`,
    `<meta property="og:description" content="${escAttr(desc)}">`,
    `<meta property="og:url" content="${escAttr(origin + "/h/" + code + q)}">`,
    `<meta property="og:image" content="${escAttr(origin + "/og/" + code + ".png" + q)}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta property="og:image:alt" content="${escAttr((en ? "Character: " : "Karakter ") + name)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ].join("\n");
  return INDEX_HTML
    .replace(/<!--META-->[\s\S]*?<!--\/META-->/, meta)
    .replace(/<title>[^<]*<\/title>/, `<title>${escAttr(name)} | Gangsal</title>`)
    .replace('<html lang="id">', `<html lang="${lang}">`);
}

async function handle(req: Request, ip: string): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/{2,}/g, "/");
  // Host hanya dipakai untuk tautan absolut; nilainya dibatasi ke karakter nama host yang sah.
  const hostHeader = (req.headers.get("host") ?? url.host).toLowerCase();
  const host = /^[a-z0-9.-]+(:\d{1,5})?$/.test(hostHeader) ? hostHeader : url.host;
  const origin = TRUST_PROXY ? `https://${host}` : url.origin;

  if (LIMITS.request(ip)) return tooMany();

  if (path === "/api/results") {
    if (req.method !== "POST") return json('{"error":"method"}', 405, { Allow: "POST" });
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json('{"error":"content-type"}', 415);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return json('{"error":"too_large"}', 413);
    const raw = await readCapped(req, MAX_BODY);
    if (raw === null) return json('{"error":"too_large"}', 413);
    if (LIMITS.writeIp(ip)) return json('{"error":"rate_limited"}', 429, { "Retry-After": "3600" });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json('{"error":"json"}', 400); }
    const v = validate(body);
    if (!v.ok) return json(JSON.stringify({ error: v.error }), 400);
    if (LIMITS.writeAll("*")) return json('{"error":"busy"}', 503, { "Retry-After": "600" });
    upsert.run(v.row as any);
    statsCache = null;
    return json(JSON.stringify({ ok: true, scores: v.scores }), 201);
  }
  if (path === "/api/stats") {
    if (req.method !== "GET" && req.method !== "HEAD") return json('{"error":"method"}', 405, { Allow: "GET" });
    return json(stats());
  }
  // --- undangan ---
  if (path === "/api/invites") {
    if (req.method !== "POST") return json('{"error":"method"}', 405, { Allow: "POST" });
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json('{"error":"content-type"}', 415);
    const raw = await readCapped(req, MAX_BODY);
    if (raw === null) return json('{"error":"too_large"}', 413);
    if (LIMITS.inviteIp(ip)) return json('{"error":"rate_limited"}', 429, { "Retry-After": "3600" });
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return json('{"error":"json"}', 400); }
    const v = validateInvite(body);
    if (!v.ok) return json(JSON.stringify({ error: v.error }), 400);
    if (LIMITS.inviteAll("*")) return json('{"error":"busy"}', 503, { "Retry-After": "600" });
    const code = newCode();
    inviteInsert.run({ ...v.row, $code: code } as any);
    return json(JSON.stringify({ code, expiresAt: v.row.$exp }), 201);
  }
  // Hapus data satu peserta atas permintaan peserta itu (UU PDP Pasal 8 dan 43), oleh pemegang link rekap.
  const dm = /^\/api\/invites\/([a-z0-9]{8})\/results\/(\d{1,12})$/.exec(path);
  if (dm) {
    if (req.method !== "DELETE") return json('{"error":"method"}', 405, { Allow: "DELETE" });
    if (LIMITS.adminIp(ip)) return tooMany(600);
    const inv = inviteGet.get({ $code: dm[1] }) as any;
    if (!inv) return json('{"error":"not_found"}', 404);
    if (!adminOk(inv, req.headers.get("x-admin-token"))) return json('{"error":"forbidden"}', 403);
    const r = inviteRowDel.run({ $code: inv.code, $id: Number(dm[2]) });
    return r.changes ? json('{"ok":true}') : json('{"error":"not_found"}', 404);
  }
  const im = /^\/api\/invites\/([a-z0-9]{8})(\/results)?$/.exec(path);
  if (im) {
    if (!CODE_RE.test(im[1])) return json('{"error":"not_found"}', 404);
    const inv = inviteGet.get({ $code: im[1] }) as any;
    if (!inv) return json('{"error":"not_found"}', 404);
    const now = Date.now();
    if (!im[2]) {
      if (req.method === "GET" || req.method === "HEAD") return json(JSON.stringify(publicInvite(inv, now)));
      if (req.method === "DELETE") {
        if (LIMITS.adminIp(ip)) return tooMany(600);
        if (!adminOk(inv, req.headers.get("x-admin-token"))) return json('{"error":"forbidden"}', 403);
        db.transaction(() => { inviteDelRows.run({ $code: inv.code }); inviteDel.run({ $code: inv.code }); })();
        return json('{"ok":true}');
      }
      return json('{"error":"method"}', 405, { Allow: "GET, DELETE" });
    }
    // /api/invites/<kode>/results
    if (req.method === "GET") {
      if (LIMITS.adminIp(ip)) return tooMany(600);
      if (!adminOk(inv, req.headers.get("x-admin-token"))) return json('{"error":"forbidden"}', 403);
      const rows = (inviteRows.all({ $code: inv.code }) as any[]).map((r) => ({
        id: r.id,
        name: { epk: r.name_epk, iv: r.name_iv, ct: r.name_ct },
        scores: { E: r.e, A: r.a, C: r.c, S: r.s, I: r.i }, at: r.created_at, consent: r.consent ?? null,
      }));
      return json(JSON.stringify({ invite: { ...publicInvite(inv, now), maxParticipants: inv.max_participants }, rows }));
    }
    if (req.method !== "POST") return json('{"error":"method"}', 405, { Allow: "GET, POST" });
    if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json('{"error":"content-type"}', 415);
    const raw = await readCapped(req, MAX_BODY);
    if (raw === null) return json('{"error":"too_large"}', 413);
    if (LIMITS.writeIp(ip)) return json('{"error":"rate_limited"}', 429, { "Retry-After": "3600" });
    let body: any;
    try { body = JSON.parse(raw); } catch { return json('{"error":"json"}', 400); }
    const v = validate(body);
    if (!v.ok) return json(JSON.stringify({ error: v.error }), 400);
    if (!validName(body.name)) return json('{"error":"name"}', 400);
    if (body.consent !== CONSENT_VERSION) return json('{"error":"consent"}', 400);
    if (now >= inv.expires_at) return json('{"error":"expired"}', 410);
    const pub = publicInvite(inv, now);
    if (pub.full) return json('{"error":"full"}', 409);
    if (LIMITS.writeAll("*")) return json('{"error":"busy"}', 503, { "Retry-After": "600" });
    try {
      db.transaction(() => {
        inviteResultInsert.run({ $code: inv.code, $cid: body.cid, $epk: body.name.epk, $iv: body.name.iv, $ct: body.name.ct,
          $e: v.scores.E, $a: v.scores.A, $c: v.scores.C, $s: v.scores.S, $i: v.scores.I, $now: now, $consent: CONSENT_VERSION });
        upsert.run(v.row as any);   // skor anonim juga masuk rekap umum
      })();
    } catch (e: any) {
      if (String(e?.message ?? e).includes("UNIQUE")) return json('{"error":"already"}', 409);
      throw e;
    }
    statsCache = null;
    return json(JSON.stringify({ ok: true, scores: v.scores }), 201);
  }

  if (path.startsWith("/api/")) return json('{"error":"not_found"}', 404);
  if (req.method !== "GET" && req.method !== "HEAD") return text("Method Not Allowed", 405, { Allow: "GET, HEAD" });

  // Halaman aplikasi untuk membuat undangan, mengisi undangan, dan rekap pembuat.
  if (path === "/undang" || path === "/metode" || /^\/i\/[a-z0-9]{8}$/.test(path) || /^\/r\/[a-z0-9]{8}$/.test(path)) {
    const priv = path.startsWith("/r/");
    return new Response(INDEX_HTML, { headers: {
      "Content-Type": "text/html; charset=utf-8", "Cache-Control": priv ? "no-store" : "no-cache", ...SECURITY,
      ...(priv ? { "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" } : {}),
    } });
  }

  // /h/<kode>: halaman hasil yang dibagikan
  if (path.startsWith("/h/")) {
    const code = safeDecode(path.slice(3));
    const html = code === null ? null : sharePage(code, origin, langOf(url));
    if (!html) return Response.redirect(origin + "/", 302);
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300", ...SECURITY } });
  }
  // /og/<kode>.png: gambar pratinjau tautan untuk media sosial
  const om = /^\/og\/([\d-]{9,19})\.png$/.exec(path);
  if (om) {
    const s = shareCode(om[1]);
    if (!s) return notFound();
    const h = new URL(origin).host, lang = langOf(url);
    // Render baru memakan CPU: dibatasi per IP dan total. Gambar yang sudah ada di cache selalu dilayani.
    if (!ogCached(om[1], h, lang)) {
      if (LIMITS.ogIp(ip)) return tooMany(600);
      if (LIMITS.ogAll("*")) return text("Server sedang sibuk membuat gambar. Coba lagi sebentar lagi.", 503, { "Retry-After": "60" });
    }
    try {
      return new Response(ogPNG(om[1], s, h, lang), {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=604800, immutable", ...SECURITY },
      });
    } catch (e) {
      console.error("og render gagal", e);
      return text("Gagal membuat gambar", 500);
    }
  }
  // /c/<kode>.svg: karakter animasi sebagai gambar mandiri
  const cm = /^\/c\/([\d-]{9,19})\.svg$/.exec(path);
  if (cm) {
    const s = shareCode(cm[1]);
    if (!s) return notFound();
    return new Response(characterSVG(s, { background: "#E4ECE8", title: persona(s) }), {
      headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400", ...SECURITY },
    });
  }

  // File statis: hanya file biasa di dalam public/, tanpa dotfile.
  const rel = path === "/" ? "/index.html" : safeDecode(path);
  if (rel === null || rel.includes("\0") || /(^|[\\/])\./.test(rel)) return notFound();
  const file = normalize(join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + sep)) return notFound();
  let st;
  try { st = statSync(file); } catch { return notFound(); }
  if (!st.isFile()) return notFound();
  const ext = file.slice(file.lastIndexOf("."));
  if (!MIME[ext]) return notFound();
  return new Response(Bun.file(file), {
    headers: { "Content-Type": MIME[ext], "Cache-Control": "no-cache", ...SECURITY },
  });
}

export function startServer(port = PORT) {
  return Bun.serve({
    port, hostname: HOST,
    development: false,                 // jangan pernah tampilkan halaman error Bun (berisi detail internal)
    maxRequestBodySize: 16 * 1024,      // tolak body besar sebelum dibaca ke memori
    async fetch(req, server) {
      // X-Real-IP hanya dipercaya di belakang nginx (yang menimpa header ini dengan IP asli).
      const ip = (TRUST_PROXY && req.headers.get("x-real-ip")) || server.requestIP(req)?.address || "unknown";
      try { return await handle(req, ip); }
      catch (e) { console.error("galat permintaan", req.method, new URL(req.url).pathname, e); return text("Terjadi kesalahan di server.", 500); }
    },
    error(e) {
      console.error("galat server", e);
      return text("Terjadi kesalahan di server.", 500);
    },
  });
}

if (import.meta.main) {
  const s = startServer();
  console.log(`Gangsal berjalan di http://${s.hostname}:${s.port} (db: ${DB_PATH})`);
}
