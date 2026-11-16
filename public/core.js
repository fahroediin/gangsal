// Inti tes: soal, kunci skoring, dan perhitungan skor. Dipakai browser (app.js) dan server (server.ts).
// Soal: IPIP Big-Five Factor Markers 50 item (Goldberg, 1992), public domain, https://ipip.ori.org.
// Terjemahan bahasa Indonesia: tim Gangsal (belum divalidasi secara psikometrik).

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
    about: "Seberapa tertarik kamu pada ide, gagasan abstrak, dan hal-hal baru. Disebut juga Intelek atau Keterbukaan." }
];

// [teks, dimensi, arah] dalam urutan asli IPIP (dimensi berselang-seling, kunci + dan - bergantian).
export const ITEMS = [
  ["Saya menjadi penghidup suasana di acara kumpul-kumpul.", "E", 1],
  ["Saya kurang peduli pada orang lain.", "A", -1],
  ["Saya selalu siap sebelum melakukan sesuatu.", "C", 1],
  ["Saya mudah stres.", "S", -1],
  ["Kosakata saya kaya.", "I", 1],
  ["Saya tidak banyak bicara.", "E", -1],
  ["Saya tertarik pada orang lain.", "A", 1],
  ["Saya meninggalkan barang-barang saya berserakan.", "C", -1],
  ["Saya santai hampir sepanjang waktu.", "S", 1],
  ["Saya sulit memahami ide-ide abstrak.", "I", -1],
  ["Saya merasa nyaman berada di antara banyak orang.", "E", 1],
  ["Saya menghina orang lain.", "A", -1],
  ["Saya memperhatikan detail.", "C", 1],
  ["Saya mengkhawatirkan banyak hal.", "S", -1],
  ["Imajinasi saya hidup.", "I", 1],
  ["Saya lebih suka berada di belakang layar.", "E", -1],
  ["Saya ikut merasakan perasaan orang lain.", "A", 1],
  ["Saya sering membuat keadaan jadi berantakan.", "C", -1],
  ["Saya jarang merasa murung.", "S", 1],
  ["Saya tidak tertarik pada ide-ide abstrak.", "I", -1],
  ["Saya yang memulai percakapan.", "E", 1],
  ["Saya tidak tertarik pada masalah orang lain.", "A", -1],
  ["Saya langsung menyelesaikan pekerjaan rumah atau tugas sehari-hari.", "C", 1],
  ["Perasaan saya mudah terusik.", "S", -1],
  ["Saya punya ide-ide yang sangat bagus.", "I", 1],
  ["Saya tidak punya banyak hal untuk dibicarakan.", "E", -1],
  ["Hati saya lembut.", "A", 1],
  ["Saya sering lupa mengembalikan barang ke tempatnya.", "C", -1],
  ["Saya mudah merasa kesal.", "S", -1],
  ["Daya khayal saya kurang.", "I", -1],
  ["Di sebuah acara, saya mengobrol dengan banyak orang yang berbeda.", "E", 1],
  ["Saya tidak terlalu tertarik pada orang lain.", "A", -1],
  ["Saya menyukai keteraturan.", "C", 1],
  ["Suasana hati saya sering berubah.", "S", -1],
  ["Saya cepat memahami sesuatu.", "I", 1],
  ["Saya tidak suka menarik perhatian.", "E", -1],
  ["Saya meluangkan waktu untuk orang lain.", "A", 1],
  ["Saya melalaikan kewajiban saya.", "C", -1],
  ["Suasana hati saya sering naik-turun.", "S", -1],
  ["Saya memakai kata-kata yang jarang dipakai orang.", "I", 1],
  ["Saya tidak keberatan menjadi pusat perhatian.", "E", 1],
  ["Saya ikut merasakan emosi orang lain.", "A", 1],
  ["Saya mengikuti jadwal.", "C", 1],
  ["Saya mudah jengkel.", "S", -1],
  ["Saya meluangkan waktu untuk merenungkan berbagai hal.", "I", 1],
  ["Saya pendiam di depan orang yang belum saya kenal.", "E", -1],
  ["Saya membuat orang lain merasa nyaman.", "A", 1],
  ["Saya menuntut ketepatan dalam pekerjaan saya.", "C", 1],
  ["Saya sering merasa murung.", "S", -1],
  ["Saya penuh ide.", "I", 1]
];

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

export function level(v) { return v < 35 ? "rendah" : v > 65 ? "tinggi" : "sedang"; }

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
const NOUN = {
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
