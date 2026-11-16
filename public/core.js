// Inti tes: soal, kunci skoring, dan perhitungan skor. Dipakai browser (app.js) dan server (server.ts).
// Soal: IPIP Big-Five Factor Markers 50 item (Goldberg, 1992), public domain, https://ipip.ori.org.
// Terjemahan: IPIP-BFM-50 Indonesia (Akhtar & Azwar, 2019), CC BY-SA 4.0, lihat items-id.js.
import { ITEMS_ID } from "./items-id.js";

export const DIMS = [
  { key: "E", name: "Ekstraversi", short: "Ekstraversi",
    low: "Pendiam", high: "Supel",
    about: "Seberapa besar kamu mendapat energi dari interaksi sosial dan keramaian." },
  { key: "A", name: "Keramahan", short: "Keramahan",
    low: "Lugas", high: "Hangat",
    about: "Seberapa besar kamu mengutamakan kerja sama, empati, dan kepercayaan pada orang lain." },
  { key: "C", name: "Kehati-hatian", short: "Kehati-hatian",
    low: "Spontan", high: "Teratur",
    about: "Seberapa terencana, rapi, dan tekun kamu dalam menyelesaikan tugas." },
  { key: "S", name: "Stabilitas Emosi", short: "Stabilitas",
    low: "Peka", high: "Tenang",
    about: "Seberapa tenang kamu menghadapi tekanan. Kebalikan dari kecenderungan cemas atau mudah gelisah." },
  { key: "I", name: "Imajinasi", short: "Imajinasi",
    low: "Membumi", high: "Imajinatif",
    about: "Seberapa tertarik kamu pada ide, gagasan abstrak, dan hal-hal baru. Di IPIP disebut Intelek/Imajinasi; padanan terdekatnya di OCEAN adalah Keterbukaan (O)." }
];

// [teks, dimensi, arah] dalam urutan asli IPIP (dimensi berselang-seling, kunci + dan - bergantian).
export const ITEMS = ITEMS_ID.map(([, text, , dim, key]) => [text, dim, key]);
/** Kode butir (E1, A2, ...) dan butir asli bahasa Inggris, untuk halaman metode dan analisis reliabilitas. */
export const ITEM_META = ITEMS_ID.map(([code, , en]) => ({ code, en }));

export const SCALE = ["Sangat tidak sesuai", "Agak tidak sesuai", "Netral", "Agak sesuai", "Sangat sesuai"];
export const SCALE_SHORT = ["Sangat tidak", "Tidak", "Netral", "Sesuai", "Sangat sesuai"];

/** answers: array 50 angka 1..5 (atau null). Hasil: skor 0..100 per dimensi, dibulatkan. */
export function score(answers) {
  const sum = {}, n = {};
  for (const d of DIMS) { sum[d.key] = 0; n[d.key] = 0; }
  ITEMS.forEach(([, dim, key], i) => {
    const v = answers[i];
    if (v == null) return;
    sum[dim] += key > 0 ? v : 6 - v;
    n[dim]++;
  });
  const out = {};
  for (const d of DIMS) out[d.key] = n[d.key] ? Math.round(((sum[d.key] / n[d.key]) - 1) / 4 * 100) : 50;
  return out;
}

/*
 * Tingkat rendah/sedang/tinggi.
 * Mengikuti saran IPIP ("Interpreting Individual IPIP Scale Scores"): skor dalam ±0,5 simpangan baku dari
 * rata-rata sampel sendiri = sedang; di luar itu rendah atau tinggi. Norma dipakai setelah sampel cukup
 * (NORM_MIN_N). Sebelum itu dipakai batas sementara pada skala POMP 0-100 dan ditandai sebagai sementara.
 */
/** Versi teks persetujuan peserta undangan; disimpan bersama hasil (UU PDP Pasal 22). Ganti bila teksnya berubah. */
export const CONSENT_VERSION = "persetujuan-v1-2026-11";

export const NORM_MIN_N = 100;
export const PROVISIONAL = { low: 35, high: 65 };
/** @param {number} v skor 0..100  @param {{mean:number, sd:number}|null} norm norma dimensi itu */
export function level(v, norm = null) {
  if (norm && norm.sd > 0) {
    const half = norm.sd / 2;
    return v < norm.mean - half ? "rendah" : v > norm.mean + half ? "tinggi" : "sedang";
  }
  return v < PROVISIONAL.low ? "rendah" : v > PROVISIONAL.high ? "tinggi" : "sedang";
}
/** Norma siap dipakai bila jumlah sampel memenuhi NORM_MIN_N. */
export const normsReady = norms => !!norms && norms.n >= NORM_MIN_N;

export const ORDER = DIMS.map(d => d.key);
export function encode(s) { return ORDER.map(k => s[k]).join("-"); }
export function decode(code) {
  const m = /^(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})$/.exec(code || "");
  if (!m) return null;
  const nums = m.slice(1).map(Number);
  if (nums.some(x => x > 100)) return null;
  const s = {}; ORDER.forEach((k, i) => s[k] = nums[i]);
  return s;
}

// Nama karakter dari dua sifat paling menonjol (jarak terjauh dari 50).
export const NOUN = {
  E: ["Si Pengamat", "Si Penggembira"],
  A: ["Si Pemberi Kritik", "Si Penyayang"],
  C: ["Si Petualang Bebas", "Si Perancang"],
  S: ["Si Perasa", "Si Penenang"],
  I: ["Si Praktis", "Si Penjelajah Ide"]
};
const ADJ = {
  E: ["yang Kalem", "yang Supel"],
  A: ["yang Blak-blakan", "yang Hangat"],
  C: ["yang Santai", "yang Rapi"],
  S: ["yang Peka", "yang Tenang"],
  I: ["yang Membumi", "yang Imajinatif"]
};
/** 11 karakter dasar: Si Penyeimbang + ujung tinggi/rendah tiap dimensi (dimensi lain 50). */
export function basePersonas() {
  const mid = { E: 50, A: 50, C: 50, S: 50, I: 50 };
  return [
    { name: "Si Penyeimbang", avg: { ...mid }, trait: "Kelima sisi di tengah" },
    ...DIMS.flatMap(d => [1, 0].map(hi => ({
      name: NOUN[d.key][hi], avg: { ...mid, [d.key]: hi ? 90 : 10 },
      trait: `${d.name} ${hi ? "tinggi" : "rendah"}`,
    }))),
  ];
}

/** Skor dalam urutan OCEAN baku. N (Neurotisisme) = 100 - Stabilitas Emosi. */
export const OCEAN = [
  { k: "O", name: "Keterbukaan", dim: "I", from: s => s.I },
  { k: "C", name: "Kehati-hatian", dim: "C", from: s => s.C },
  { k: "E", name: "Ekstraversi", dim: "E", from: s => s.E },
  { k: "A", name: "Keramahan", dim: "A", from: s => s.A },
  { k: "N", name: "Neurotisisme", dim: "S", from: s => 100 - s.S },
];

export function persona(s) {
  const ranked = ORDER.map(k => ({ k, d: Math.abs(s[k] - 50), hi: s[k] >= 50 ? 1 : 0 })).sort((a, b) => b.d - a.d);
  if (ranked[0].d < 12) return "Si Penyeimbang";
  const [a, b] = ranked;
  return b.d < 12 ? NOUN[a.k][a.hi] : `${NOUN[a.k][a.hi]} ${ADJ[b.k][b.hi]}`;
}

// Penjelasan per dimensi per level.
export const TEXT = {
  E: {
    rendah: "Kamu cenderung menyimpan energi untuk diri sendiri. Obrolan mendalam dengan sedikit orang terasa lebih berarti daripada keramaian, dan waktu sendiri membuatmu pulih.",
    sedang: "Kamu bisa menikmati keramaian maupun waktu sendiri. Kamu menyesuaikan diri dengan situasi: aktif saat perlu, tenang saat cukup.",
    tinggi: "Kamu bersemangat di tengah orang banyak. Memulai obrolan terasa mudah, dan suasana jadi lebih hidup saat kamu ada."
  },
  A: {
    rendah: "Kamu lugas dan tidak mudah terbawa perasaan orang lain. Kamu berani menyampaikan pendapat yang berbeda dan menilai sesuatu apa adanya.",
    sedang: "Kamu bisa hangat sekaligus tegas. Kamu peduli pada orang lain, tetapi tetap menjaga kepentinganmu sendiri.",
    tinggi: "Kamu peka pada perasaan orang lain dan senang membantu. Orang merasa nyaman di dekatmu, dan kamu mengutamakan kerukunan."
  },
  C: {
    rendah: "Kamu spontan dan luwes. Rencana yang terlalu kaku terasa mengekang, dan kamu nyaman menyelesaikan hal sambil jalan.",
    sedang: "Kamu cukup terencana untuk urusan penting, tetapi tidak keberatan dengan sedikit kekacauan dalam keseharian.",
    tinggi: "Kamu teratur, teliti, dan bisa diandalkan. Jadwal dan daftar tugas membantumu, dan pekerjaanmu jarang terbengkalai."
  },
  S: {
    rendah: "Kamu peka terhadap tekanan dan perasaanmu mudah bergerak. Kepekaan ini membuatmu cepat menangkap masalah, walau kadang melelahkan.",
    sedang: "Kamu biasanya cukup tenang, tetapi tekanan yang menumpuk tetap bisa membuatmu gelisah. Hal ini wajar dialami kebanyakan orang.",
    tinggi: "Kamu tenang dan jarang terbawa cemas. Saat situasi kacau, kamu cenderung tetap kepala dingin."
  },
  I: {
    rendah: "Kamu praktis dan menyukai hal yang jelas dan terbukti. Kamu lebih tertarik pada apa yang bisa langsung dipakai daripada teori.",
    sedang: "Kamu terbuka pada ide baru selama ada gunanya. Kamu bisa berpikir abstrak, tetapi tetap berpijak pada kenyataan.",
    tinggi: "Kamu penuh rasa ingin tahu dan imajinasi. Gagasan baru, pertanyaan besar, dan cara pandang berbeda membuatmu bersemangat."
  }
};
