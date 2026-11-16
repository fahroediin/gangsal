import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ITEMS, DIMS, score, level, encode, decode, persona, basePersonas, OCEAN, ITEM_META, CONSENT_VERSION, normsReady, NORM_MIN_N } from "./public/core.js";
import { characterSVG } from "./public/character.js";

const dbFile = join(tmpdir(), `gangsal-test-${Date.now()}.sqlite`);
process.env.DB_PATH = dbFile;
const { startServer, validate, sharePage, shareCode, makeLimiter, validateInvite, cleanupInvitesNow, RETENTION_MS, resetLimits } = await import("./server.ts");
import * as ic from "./public/invite-crypto.js";
import { Database } from "bun:sqlite";

let server: ReturnType<typeof startServer>;
let base = "";
beforeAll(() => { server = startServer(0); base = `http://127.0.0.1:${server.port}`; });
afterAll(() => { server.stop(true); for (const f of [dbFile, dbFile + "-wal", dbFile + "-shm"]) try { rmSync(f); } catch {} });

const cid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const post = (body: unknown) => fetch(base + "/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
// jawaban yang membuat satu dimensi maksimal (semua kunci + = 5, kunci - = 1) dan sisanya netral
const maxFor = (dim: string) => ITEMS.map(([, d, k]) => (d === dim ? (k > 0 ? 5 : 1) : 3));

describe("soal dan kunci IPIP", () => {
  test("50 soal, 10 per dimensi, unik", () => {
    expect(ITEMS.length).toBe(50);
    for (const d of DIMS) expect(ITEMS.filter(([, x]) => x === d.key).length).toBe(10);
    expect(new Set(ITEMS.map(([t]) => t)).size).toBe(50);
  });
  test("pola kunci sesuai sumber IPIP (+/- per dimensi)", () => {
    const plus = Object.fromEntries(DIMS.map((d) => [d.key, ITEMS.filter(([, x, k]) => x === d.key && k > 0).length]));
    // Sumber: E 5+, A 6+, C 6+, Stabilitas 2+, Imajinasi 7+
    expect(plus).toEqual({ E: 5, A: 6, C: 6, S: 2, I: 7 });
  });
});

describe("skoring", () => {
  test("netral semua = 50, ekstrem = 0 atau 100", () => {
    expect(score(new Array(50).fill(3))).toEqual({ E: 50, A: 50, C: 50, S: 50, I: 50 });
    expect(score(maxFor("E")).E).toBe(100);
    expect(score(maxFor("E").map((v, i) => (ITEMS[i][1] === "E" ? 6 - v : v))).E).toBe(0);
  });
  test("level dan kode", () => {
    expect([level(34), level(35), level(65), level(66)]).toEqual(["rendah", "sedang", "sedang", "tinggi"]);
    const s = { E: 72, A: 55, C: 40, S: 80, I: 30 };
    expect(decode(encode(s))).toEqual(s);
    expect(decode("1-2-3")).toBeNull();
    expect(decode("101-0-0-0-0")).toBeNull();
  });
  test("nama persona", () => {
    expect(persona({ E: 50, A: 52, C: 48, S: 55, I: 45 })).toBe("Si Penyeimbang");
    expect(persona({ E: 95, A: 50, C: 50, S: 50, I: 20 })).toBe("Si Penggembira yang Membumi");
  });
  test("butir memakai IPIP-BFM-50 Indonesia dengan kode dan kunci sesuai IPIP", () => {
    expect(ITEM_META.map((m) => m.code).slice(0, 5)).toEqual(["E1", "A2", "C3", "ES4", "I5"]);
    expect(ITEMS[0][0]).toBe("Menghidupkan suasana dalam suatu acara");      // Akhtar & Azwar (2019)
    expect(ITEM_META[0].en).toBe("Am the life of the party.");
    // kode butir konsisten dengan dimensi (ES = Stabilitas Emosi = S)
    ITEM_META.forEach((m, i) => expect(m.code.replace(/\d+$/, "").replace("ES", "S")).toBe(ITEMS[i][1]));
  });
  test("tingkat memakai norma ±0,5 SD bila sampel cukup", () => {
    const norm = { mean: 60, sd: 20 };
    expect([level(49, norm), level(50, norm), level(70, norm), level(71, norm)]).toEqual(["rendah", "sedang", "sedang", "tinggi"]);
    expect(level(30, null)).toBe("rendah");                                  // batas sementara
    expect(normsReady({ n: NORM_MIN_N - 1 })).toBe(false);
    expect(normsReady({ n: NORM_MIN_N })).toBe(true);
  });
  test("katalog 11 karakter dasar konsisten dengan nama persona", () => {
    const list = basePersonas();
    expect(list.length).toBe(11);
    expect(new Set(list.map((p) => p.name)).size).toBe(11);
    for (const p of list) expect(persona(p.avg)).toBe(p.name);
  });
  test("OCEAN memakai urutan baku dan N = 100 - Stabilitas", () => {
    expect(OCEAN.map((o) => o.k).join("")).toBe("OCEAN");
    const s = { E: 43, A: 40, C: 38, S: 80, I: 32 };
    expect(OCEAN.map((o) => o.from(s))).toEqual([32, 38, 43, 40, 20]);
  });
  test("karakter berubah sesuai skor", () => {
    const hiI = characterSVG({ E: 50, A: 50, C: 50, S: 50, I: 95 });
    const loI = characterSVG({ E: 50, A: 50, C: 50, S: 50, I: 5 });
    expect((hiI.match(/class="glow"/g) || []).length).toBe(2);
    expect(loI.includes('class="glow"')).toBe(false);
    expect(characterSVG({ E: 50, A: 50, C: 50, S: 10, I: 50 })).toContain('class="drip"');
    expect(characterSVG({ E: 50, A: 50, C: 50, S: 50, I: 50 }, { animate: false })).not.toContain("<style>");
  });
});

describe("validate", () => {
  test("terima 50 jawaban 1..5", () => {
    const v = validate({ cid: cid(1), answers: maxFor("C") });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.scores.C).toBe(100);
  });
  test("tolak jawaban kurang, di luar rentang, atau cid salah", () => {
    expect(validate({ cid: cid(1), answers: new Array(49).fill(3) }).ok).toBe(false);
    expect(validate({ cid: cid(1), answers: [...new Array(49).fill(3), 6] }).ok).toBe(false);
    expect(validate({ cid: cid(1), answers: [...new Array(49).fill(3), 2.5] }).ok).toBe(false);
    expect(validate({ cid: "abc", answers: new Array(50).fill(3) }).ok).toBe(false);
  });
});

describe("API", () => {
  test("stats kosong di awal", async () => {
    const r = await (await fetch(base + "/api/stats")).json();
    expect(r.total).toBe(0);
    expect(r.avg).toEqual({ E: 50, A: 50, C: 50, S: 50, I: 50 });
  });
  test("kirim, timpa dari perangkat yang sama, lalu rekap", async () => {
    expect((await post({ cid: cid(2), answers: maxFor("E") })).status).toBe(201);
    expect((await post({ cid: cid(3), answers: new Array(50).fill(3) })).status).toBe(201);
    expect((await post({ cid: cid(2), answers: maxFor("A") })).status).toBe(201);
    const r = await (await fetch(base + "/api/stats")).json();
    expect(r.total).toBe(2);
    expect(r.avg).toEqual({ E: 50, A: 75, C: 50, S: 50, I: 50 });
    expect(r.levels.A).toEqual({ rendah: 0, sedang: 1, tinggi: 1 });
    // dikelompokkan per karakter
    expect(r.personas.reduce((t: number, p: any) => t + p.n, 0)).toBe(2);
    expect(r.personas.map((p: any) => p.name).sort()).toEqual([persona({ E: 50, A: 100, C: 50, S: 50, I: 50 }), "Si Penyeimbang"].sort());
    expect(r.personas.find((p: any) => p.name === "Si Penyeimbang").avg).toEqual({ E: 50, A: 50, C: 50, S: 50, I: 50 });
  });
  test("tolak body rusak dan metode salah", async () => {
    expect((await fetch(base + "/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" })).status).toBe(400);
    expect((await fetch(base + "/api/results", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" })).status).toBe(415);
    expect((await fetch(base + "/api/results")).status).toBe(405);
  });
  test("halaman share punya meta khusus, kode rusak dialihkan", async () => {
    const r = await fetch(base + "/h/73-55-40-80-30");
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(html).toContain('property="og:title"');
    expect(html).toContain("Ekstraversi 73");
    expect(sharePage("bukan-kode", base)).toBeNull();
    expect((await fetch(base + "/h/abc", { redirect: "manual" })).status).toBe(302);
  });
  test("gambar pratinjau PNG 1200x630 dan meta og:image", async () => {
    const r = await fetch(base + "/og/73-55-40-80-30.png");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    const buf = new Uint8Array(await r.arrayBuffer());
    expect([...buf.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
    const dv = new DataView(buf.buffer);
    expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([1200, 630]);
    expect((await fetch(base + "/og/abc.png")).status).toBe(404);
    expect(await (await fetch(base + "/h/73-55-40-80-30")).text()).toContain("/og/73-55-40-80-30.png");
  });
  test("gambar karakter SVG dan file statis", async () => {
    const c = await fetch(base + "/c/73-55-40-80-30.svg");
    expect(c.headers.get("content-type")).toBe("image/svg+xml");
    expect(await c.text()).toContain("<svg");
    const r = await fetch(base + "/");
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect((await fetch(base + "/..%2fserver.ts")).status).toBe(404);
  });
  test("batas 20 kiriman per jam per IP", async () => {
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await post({ cid: cid(100 + i), answers: new Array(50).fill(3) })).status;
    expect(last).toBe(429);
  });
});

describe("enkripsi undangan", () => {
  test("nama hanya terbuka dengan kunci privat pembuat", async () => {
    const k = await ic.newInviteKeys();
    const box = await ic.sealName("Siti Rahayu", k.pub);
    expect(JSON.stringify(box)).not.toContain("Siti");
    expect(await ic.openName(box, k.priv)).toBe("Siti Rahayu");
    const other = await ic.newInviteKeys();
    await expect(ic.openName(box, other.priv)).rejects.toThrow();
  });
  test("judul terenkripsi dan format link rekap", async () => {
    const k = await ic.newInviteKeys();
    const t = await ic.encryptTitle("Rekrutmen Keuangan", k.titleKey);
    expect(await ic.decryptTitle(t, k.titleKey)).toBe("Rekrutmen Keuangan");
    expect(ic.parseAdminFragment("#" + ic.adminFragment(k))).toEqual({ adminToken: k.adminToken, titleKey: k.titleKey, priv: k.priv });
    expect(ic.parseAdminFragment("#rusak")).toBeNull();
  });
});

describe("API undangan", () => {
  // IP berbeda tidak bisa dipalsukan di tes lokal, jadi tes ini memakai kiriman sesedikit mungkin.
  let keys: any, code = "";
  const mkInvite = async (extra: any = {}) => {
    keys = await ic.newInviteKeys();
    const body = { pub: keys.pub, adminHash: await ic.sha256Hex(keys.adminToken), title: await ic.encryptTitle("Tim IT", keys.titleKey), duration: "1h", maxParticipants: 2, ...extra };
    return fetch(base + "/api/invites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  };
  test("validasi input pembuatan undangan", async () => {
    resetLimits();
    const k = await ic.newInviteKeys();
    const ok = { pub: k.pub, adminHash: "a".repeat(64), duration: "1d", maxParticipants: null, title: null };
    expect(validateInvite(ok).ok).toBe(true);
    expect(validateInvite({ ...ok, duration: "2h" }).ok).toBe(false);
    expect(validateInvite({ ...ok, maxParticipants: 0 }).ok).toBe(false);
    expect(validateInvite({ ...ok, pub: "x" }).ok).toBe(false);
    expect(validateInvite({ ...ok, adminHash: "zz" }).ok).toBe(false);
    expect(validateInvite({ ...ok, title: { iv: "a", ct: "b" } }).ok).toBe(false);
  });
  test("buat undangan, isi, lalu rekap hanya terbuka dengan token admin", async () => {
    const r = await mkInvite();
    expect(r.status).toBe(201);
    ({ code } = await r.json());
    expect(code).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/);

    const pub = await (await fetch(`${base}/api/invites/${code}`)).json();
    expect(pub.open).toBe(true);
    expect(JSON.stringify(pub)).not.toContain("admin");

    const totalBefore = (await (await fetch(base + "/api/stats")).json()).total;
    const send = async (n: number, name: string, consent: any = CONSENT_VERSION) => fetch(`${base}/api/invites/${code}/results`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid: cid(500 + n), answers: maxFor("C"), name: await ic.sealName(name, keys.pub), consent }) });
    expect((await send(9, "Tanpa Setuju", null)).status).toBe(400);   // persetujuan wajib
    expect((await send(1, "Budi Santoso")).status).toBe(201);
    expect((await send(1, "Budi Santoso")).status).toBe(409);           // perangkat sama, undangan sama
    expect((await send(2, "Ani")).status).toBe(201);
    expect((await send(3, "Citra")).status).toBe(409);                  // kuota 2 penuh
    expect((await fetch(`${base}/api/invites/${code}/results`)).status).toBe(403);   // tanpa token
    expect((await fetch(`${base}/api/invites/${code}/results`, { headers: { "X-Admin-Token": (await ic.newInviteKeys()).adminToken } })).status).toBe(403);
    const res = await fetch(`${base}/api/invites/${code}/results`, { headers: { "X-Admin-Token": keys.adminToken } });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rows.length).toBe(2);
    expect(JSON.stringify(data)).not.toContain("Budi");
    expect(await ic.openName(data.rows[0].name, keys.priv)).toBe("Budi Santoso");
    expect(data.rows[0].scores.C).toBe(100);
    expect(data.invite.full).toBe(true);
    expect(data.rows[0].consent).toBe(CONSENT_VERSION);   // persetujuan terekam
    // hapus satu peserta: butuh token, lalu barisnya hilang
    const id = data.rows[1].id;
    expect((await fetch(`${base}/api/invites/${code}/results/${id}`, { method: "DELETE" })).status).toBe(403);
    expect((await fetch(`${base}/api/invites/${code}/results/${id}`, { method: "DELETE", headers: { "X-Admin-Token": keys.adminToken } })).status).toBe(200);
    const after = await (await fetch(`${base}/api/invites/${code}/results`, { headers: { "X-Admin-Token": keys.adminToken } })).json();
    expect(after.rows.length).toBe(1);
    expect((await fetch(`${base}/api/invites/${code}/results/${id}`, { method: "DELETE", headers: { "X-Admin-Token": keys.adminToken } })).status).toBe(404);
    // skor anonim ikut rekap umum (tunggu cache stats 10 detik tidak perlu: cache dibuang saat ada kiriman)
    expect((await (await fetch(base + "/api/stats")).json()).total).toBe(totalBefore + 2);
  });
  test("database tidak menyimpan nama dalam bentuk terbaca", () => {
    const d = new Database(dbFile, { readonly: true });
    const dump = JSON.stringify(d.query("SELECT * FROM invite_results").all()) + JSON.stringify(d.query("SELECT * FROM invites").all());
    d.close();
    expect(dump).not.toContain("Budi");
    expect(dump).not.toContain("Tim IT");
  });
  test("hapus undangan butuh token, lalu kode tidak bisa dipakai", async () => {
    expect((await fetch(`${base}/api/invites/${code}`, { method: "DELETE" })).status).toBe(403);
    expect((await fetch(`${base}/api/invites/${code}`, { method: "DELETE", headers: { "X-Admin-Token": keys.adminToken } })).status).toBe(200);
    expect((await fetch(`${base}/api/invites/${code}`)).status).toBe(404);
  });
  test("undangan kedaluwarsa menolak kiriman dan dibersihkan setelah 90 hari", async () => {
    const r = await mkInvite({ maxParticipants: null });
    const { code: c2, expiresAt } = await r.json();
    const d = new Database(dbFile);
    d.run("UPDATE invites SET expires_at = ? WHERE code = ?", [Date.now() - 1000, c2]);
    d.close();
    const res = await fetch(`${base}/api/invites/${c2}/results`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cid: cid(900), answers: maxFor("E"), name: await ic.sealName("X Y", keys.pub), consent: CONSENT_VERSION }) });
    expect(res.status).toBe(410);
    expect((await (await fetch(`${base}/api/invites/${c2}`)).json()).open).toBe(false);
    cleanupInvitesNow(Date.now() + RETENTION_MS + 5000);
    expect((await fetch(`${base}/api/invites/${c2}`)).status).toBe(404);
    expect(expiresAt).toBeGreaterThan(0);
  });
  test("halaman undangan dan rekap disajikan, rekap tidak di-cache", async () => {
    expect((await fetch(base + "/undang")).status).toBe(200);
    expect((await fetch(base + "/metode")).status).toBe(200);
    expect((await fetch(base + "/items-id.js")).headers.get("content-type")).toContain("javascript");
    const st = await (await fetch(base + "/api/stats")).json();
    expect(st.norms.n).toBe(st.total);
    expect(typeof st.normsReady).toBe("boolean");
    expect((await fetch(base + "/i/abcdefgh")).status).toBe(200);
    const r = await fetch(base + "/r/abcdefgh");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  });
});

describe("keamanan", () => {
  test("mulai dengan kuota bersih", () => { resetLimits(); });
  test("URL dengan encoding rusak tidak memicu error 500 atau halaman error Bun", async () => {
    for (const p of ["/%E0%A4%A", "/h/%E0%A4%A", "/%ZZ"]) {
      const r = await fetch(base + p, { redirect: "manual" });
      expect([302, 404]).toContain(r.status);
      expect(await r.text()).not.toContain("__bun");
    }
  });
  test("database, dotfile, folder, dan file di luar public tidak bisa diambil", async () => {
    for (const p of ["/data/gangsal.sqlite", "/../data/gangsal.sqlite", "/%2e%2e/server.ts", "/%2e%2e%5cserver.ts",
      "/.git/config", "/%2egit/config", "/package.json", "/server.ts", "/public/", "/index.html%00.js"]) {
      expect((await fetch(base + p)).status).toBe(404);
    }
  });
  test("hanya skor yang bisa dihasilkan tes yang diterima di tautan share", async () => {
    expect(shareCode("73-55-40-80-30")).not.toBeNull();
    expect(shareCode("72-55-40-80-30")).toBeNull();   // 72 tidak mungkin keluar dari 10 jawaban
    expect((await fetch(base + "/og/72-55-40-80-30.png")).status).toBe(404);
    expect((await fetch(base + "/c/1-2-3-4-6.svg")).status).toBe(404);
  });
  test("body besar tanpa Content-Length ditolak", async () => {
    const big = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("x".repeat(200_000))); c.close(); } });
    const r = await fetch(base + "/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: big, duplex: "half" } as any);
    expect(r.status).toBe(413);
  });
  test("render gambar baru dibatasi per IP, gambar di cache tetap dilayani", async () => {
    const codes = Array.from({ length: 14 }, (_, k) => `${Math.round(k * 2.5)}-50-50-50-50`);
    const statuses: number[] = [];
    for (const c of codes) statuses.push((await fetch(`${base}/og/${c}.png`)).status);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
    expect((await fetch(base + "/og/73-55-40-80-30.png")).status).toBe(200);   // sudah di cache
  });
  test("header keamanan lengkap", async () => {
    const r = await fetch(base + "/");
    for (const h of ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy"]) {
      expect(r.headers.get(h)).toBeTruthy();
    }
  });
  test("pembatas laju membuang kunci lama dan reset saat banjir", () => {
    const lim = makeLimiter(1, 60_000, 3);
    expect(lim("a")).toBe(false);
    expect(lim("a")).toBe(true);
    for (const k of ["b", "c", "d", "e"]) lim(k);
    expect(lim("a")).toBe(false);   // peta dikosongkan saat melebihi batas kunci
  });
});
