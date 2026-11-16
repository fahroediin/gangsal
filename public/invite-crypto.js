// Enkripsi untuk fitur undangan. Berjalan di browser (dan di Bun untuk tes) memakai WebCrypto.
//
// Prinsip: server tidak pernah melihat nama peserta, judul undangan, atau kunci apa pun.
// - Pembuat membuat pasangan kunci ECDH P-256. Kunci publik dikirim ke server.
//   Kunci privat hanya ada di bagian # link rekap (bagian # tidak pernah dikirim browser ke server).
// - Nama peserta dienkripsi di browser peserta dengan kunci publik itu (ECIES: ECDH sementara + HKDF + AES-GCM).
// - Judul undangan dienkripsi AES-GCM dengan kunci judul yang ada di bagian # link peserta dan link rekap.
// - Token admin acak membuktikan kepemilikan rekap; server hanya menyimpan hash SHA-256-nya.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64u(bytes) {
  const b = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

/** Semua kunci untuk satu undangan baru. */
export async function newInviteKeys() {
  const kp = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  return {
    pub: b64u(await subtle.exportKey("raw", kp.publicKey)),          // ke server
    priv: b64u(await subtle.exportKey("pkcs8", kp.privateKey)),      // hanya di link rekap
    titleKey: b64u(rand(16)),                                         // di link peserta dan rekap
    adminToken: b64u(rand(32)),                                       // di link rekap; server simpan hash-nya
  };
}

export async function sha256Hex(text) {
  const h = new Uint8Array(await subtle.digest("SHA-256", enc.encode(text)));
  return [...h].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function aesKey(raw, usage) {
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, false, usage);
}

export async function encryptTitle(title, titleKey) {
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(unb64u(titleKey), ["encrypt"]), enc.encode(title));
  return { iv: b64u(iv), ct: b64u(ct) };
}
export async function decryptTitle(box, titleKey) {
  const pt = await subtle.decrypt({ name: "AES-GCM", iv: unb64u(box.iv) }, await aesKey(unb64u(titleKey), ["decrypt"]), unb64u(box.ct));
  return dec.decode(pt);
}

async function nameKey(sharedBits, epkRaw, usage) {
  const ikm = await subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: epkRaw, info: enc.encode("gangsal-name-v1") },
    ikm, { name: "AES-GCM", length: 256 }, false, usage);
}

/** Enkripsi nama untuk pemilik kunci publik undangan. */
export async function sealName(name, pubB64) {
  const pub = await subtle.importKey("raw", unb64u(pubB64), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const eph = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const epkRaw = new Uint8Array(await subtle.exportKey("raw", eph.publicKey));
  const bits = await subtle.deriveBits({ name: "ECDH", public: pub }, eph.privateKey, 256);
  const key = await nameKey(bits, epkRaw, ["encrypt"]);
  const iv = rand(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(name));
  return { epk: b64u(epkRaw), iv: b64u(iv), ct: b64u(ct) };
}

/** Buka nama dengan kunci privat dari link rekap. */
export async function openName(box, privB64) {
  const priv = await subtle.importKey("pkcs8", unb64u(privB64), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const epkRaw = unb64u(box.epk);
  const epk = await subtle.importKey("raw", epkRaw, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const bits = await subtle.deriveBits({ name: "ECDH", public: epk }, priv, 256);
  const key = await nameKey(bits, epkRaw, ["decrypt"]);
  return dec.decode(await subtle.decrypt({ name: "AES-GCM", iv: unb64u(box.iv) }, key, unb64u(box.ct)));
}

/* ---------- format link ---------- */
// Link peserta: /i/<kode>#<titleKey>
// Link rekap:   /r/<kode>#<adminToken>.<titleKey>.<priv>
export function participantFragment(keys) { return keys.titleKey; }
export function adminFragment(keys) { return `${keys.adminToken}.${keys.titleKey}.${keys.priv}`; }
export function parseAdminFragment(frag) {
  const parts = (frag || "").replace(/^#/, "").split(".");
  if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]{16,400}$/.test(p))) return null;
  return { adminToken: parts[0], titleKey: parts[1], priv: parts[2] };
}
