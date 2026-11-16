import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ITEMS, DIMS, score, level, encode, decode, persona } from "./public/core.js";
import { characterSVG } from "./public/character.js";

const dbFile = join(tmpdir(), `gangsal-test-${Date.now()}.sqlite`);
process.env.DB_PATH = dbFile;
const { startServer, validate, sharePage, shareCode, makeLimiter } = await import("./server.ts");

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

describe("keamanan", () => {
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
