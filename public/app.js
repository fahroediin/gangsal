import { DIMS, ITEMS, SCALE, TEXT, score, level, encode, decode, persona, basePersonas, OCEAN } from "/core.js";
import { characterSVG } from "/character.js";
import { newInviteKeys, sha256Hex, encryptTitle, decryptTitle, sealName, openName,
  participantFragment, adminFragment, parseAdminFragment } from "/invite-crypto.js";

const TOTAL = ITEMS.length;
const SAMPLE = { E: 68, A: 74, C: 41, S: 55, I: 82 };
const LEVEL_TXT = { rendah: "rendah", sedang: "sedang", tinggi: "tinggi" };
const ANSWER_TXT = ["Sangat tidak sesuai", "Agak tidak sesuai", "Netral atau ragu-ragu", "Agak sesuai", "Sangat sesuai"];
const DK = Object.fromEntries(DIMS.map(d => [d.key, d.key.toLowerCase()]));   // E -> e, untuk var(--d-e)

/* ---------- storage ---------- */
function lsGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function lsSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
function ssGet(k){ try{ return sessionStorage.getItem(k); }catch(e){ return null; } }
function ssSet(k,v){ try{ sessionStorage.setItem(k,v); }catch(e){} }
function clientId(){
  let id = lsGet("gangsal-cid");
  if (!id || !/^[0-9a-f-]{36}$/.test(id)){
    id = crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==="x"?r:(r&3|8)).toString(16);});
    lsSet("gangsal-cid", id);
  }
  return id;
}

/* ---------- state ---------- */
// mode tes: null = tes umum; { code, pub, name, title } = mengisi undangan
let mode = null;
const draftKey = ()=> mode ? `gangsal-inv-${mode.code}` : "gangsal-draft2";
let answers = new Array(TOTAL).fill(null);
let qi = 0;
let recap = null, recapErr = null;
let saveState = { state:"idle", msg:"" };
let advanceTimer = null;
let quizActive = false;
function loadDraft(){
  answers = new Array(TOTAL).fill(null); qi = 0;
  try { const d = JSON.parse(lsGet(draftKey())||"null"); if (d && Array.isArray(d.a) && d.a.length===TOTAL){ answers = d.a; qi = Math.min(Math.max(d.q|0,0), TOTAL-1); } } catch(e){}
}
loadDraft();
const saveDraft = ()=>lsSet(draftKey(), JSON.stringify({a:answers,q:qi}));
const clearDraft = ()=>lsDel(draftKey());
const answeredCount = ()=>answers.filter(v=>v!==null).length;
const resetTest = ()=>{ answers = new Array(TOTAL).fill(null); qi = 0; clearDraft(); };
function setMode(m){ mode = m; loadDraft(); }

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const reduceMotion = ()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
function setTitle(t){ document.title = t ? `${t} | Gangsal` : "Gangsal: Tes Kepribadian Big Five"; }
function setNav(which){
  $("#navTest").setAttribute("aria-current", which==="test"?"page":"false");
  $("#navRecap").setAttribute("aria-current", which==="recap"?"page":"false");
  $("#navInvite").setAttribute("aria-current", which==="invite"?"page":"false");
  if (which !== "test") quizActive = false;
}
const fmtTime = ms => new Date(ms).toLocaleString("id-ID", { weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
function fmtLeft(ms){
  if (ms <= 0) return "sudah ditutup";
  const m = Math.ceil(ms/60000);
  if (m < 60) return `${m} menit lagi`;
  const h = Math.floor(m/60);
  if (h < 48) return `${h} jam ${m%60 ? (m%60)+" menit " : ""}lagi`;
  return `${Math.floor(h/24)} hari lagi`;
}
function nav(path){ history.pushState(null, "", path); route(); window.scrollTo(0,0); }

/* ---------- pentagon ---------- */
// urutan sudut searah jarum jam mulai dari atas: E, A, C, S, I
function vertex(i, r, cx, cy){ const a = (-90 + i*72) * Math.PI/180; return [cx + r*Math.cos(a), cy + r*Math.sin(a)]; }

function pentaFrame(s){
  const pts = DIMS.map((_,i)=>vertex(i, 44, 50, 52));
  const poly = pts.map(p=>p.map(n=>n.toFixed(2)).join(",")).join(" ");
  const tags = DIMS.map((d,i)=>{ const [x,y] = vertex(i, 47, 50, 52);
    return `<span class="tag" style="left:${x}%;top:${y}%;color:var(--t-${DK[d.key]})">${d.short}</span>`; }).join("");
  return `<div class="penta">
    <svg class="frame" viewBox="0 0 100 100" aria-hidden="true">
      <polygon points="${poly}" fill="var(--stage)" stroke="var(--line)" stroke-width=".8" stroke-linejoin="round"/>
      ${pts.map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="2.4" fill="var(--d-${DK[DIMS[i].key]})"/>`).join("")}
    </svg>
    <div class="char">${characterSVG(s, {title:"Contoh karakter"})}</div>
    ${tags}
  </div>`;
}

function radar(s, label){
  const cx = 200, cy = 200, R = 108;
  const ring = f => DIMS.map((_,i)=>vertex(i, R*f, cx, cy).map(n=>n.toFixed(1)).join(",")).join(" ");
  const data = DIMS.map((d,i)=>vertex(i, R*Math.max(s[d.key],3)/100, cx, cy));
  const labels = DIMS.map((d,i)=>{
    const [x,y] = vertex(i, R+36, cx, cy);
    const anchor = Math.abs(x-cx) < 8 ? "middle" : x > cx ? "start" : "end";
    const dx = anchor==="start" ? -16 : anchor==="end" ? 16 : 0;
    const dy = i===0 ? -18 : i>=2 && i<=3 ? 10 : 0;
    return `<text x="${(x+dx).toFixed(1)}" y="${(y-6+dy).toFixed(1)}" text-anchor="${anchor}" font-size="23" fill="var(--t-${DK[d.key]})">${d.short}</text>
      <text x="${(x+dx).toFixed(1)}" y="${(y+24+dy).toFixed(1)}" text-anchor="${anchor}" font-size="28" fill="var(--ink)">${s[d.key]}</text>`;
  }).join("");
  return `<svg class="radar" viewBox="-82 0 564 400" role="img" aria-label="${esc(label)}: ${DIMS.map(d=>`${d.name} ${s[d.key]}`).join(", ")}">
    ${[1,.75,.5,.25].map(f=>`<polygon points="${ring(f)}" fill="${f===1?"var(--surface)":"none"}" stroke="var(--line)" stroke-width="1.5"/>`).join("")}
    ${DIMS.map((_,i)=>{ const [x,y] = vertex(i, R, cx, cy); return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)" stroke-width="1.5"/>`; }).join("")}
    <polygon points="${data.map(p=>p.map(n=>n.toFixed(1)).join(",")).join(" ")}" fill="var(--ink)" fill-opacity=".1" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/>
    ${data.map(([x,y],i)=>`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9" fill="var(--d-${DK[DIMS[i].key]})" stroke="var(--surface)" stroke-width="3"/>`).join("")}
    ${labels}
  </svg>`;
}

/* ---------- kartu karakter + OCEAN ---------- */
function oceanHTML(s){
  return `<dl class="ocean" aria-label="Profil OCEAN">${OCEAN.map(o=>{ const v = o.from(s); return `
    <div title="${o.name} ${v}%"><dt style="color:var(--t-${DK[o.dim]})">${o.k}</dt><dd><span class="num">${v}%</span><i aria-hidden="true"><b style="width:${Math.max(v,3)}%;background:var(--d-${DK[o.dim]})"></b></i></dd></div>`; }).join("")}</dl>`;
}
const OCEAN_LEGEND = `<p class="ocean-legend">${OCEAN.map(o=>`<span><b>${o.k}</b> ${o.name}</span>`).join("")}</p>`;
// thumbnail tanpa animasi: banyak kartu sekaligus tidak perlu bergerak
function personaCard(p, meta = ""){
  return `<li class="pcard">
    <div class="pthumb">${characterSVG(p.avg, { animate:false })}</div>
    <div class="pbody"><b class="pname">${esc(p.name)}</b>${meta}${oceanHTML(p.avg)}</div>
  </li>`;
}
function groupByPersona(rows){
  const m = new Map();
  for (const r of rows){
    const name = persona(r.scores);
    const g = m.get(name) || { name, n: 0, sum: { E:0, A:0, C:0, S:0, I:0 }, members: [] };
    g.n++; DIMS.forEach(d=>g.sum[d.key] += r.scores[d.key]);
    if (r.name) g.members.push(r.name);
    m.set(name, g);
  }
  return [...m.values()].map(g=>({ name: g.name, n: g.n, members: g.members,
    avg: Object.fromEntries(DIMS.map(d=>[d.key, Math.round(g.sum[d.key]/g.n)])) }))
    .sort((a,b)=>b.n - a.n || a.name.localeCompare(b.name));
}

/* ---------- beranda ---------- */
function viewIntro(){
  setNav("test"); setTitle("");
  const n = answeredCount();
  $("#view").innerHTML = `
  <section class="home">
    <div class="home-copy">
      <h1>Kenali lima sisi kepribadianmu.</h1>
      <p class="lede">Jawab 50 pernyataan singkat tentang dirimu. Hasilnya berupa skor di lima dimensi kepribadian Big Five, dan satu karakter animasi yang bentuknya mengikuti skormu.</p>
      <div class="facts"><span><b class="num">50</b> pernyataan</span><span><b class="num">8</b> menit</span><span><b class="num">0</b> data pribadi</span></div>
      <div class="row">
        <button class="btn primary" id="start" type="button">${n ? `Lanjutkan, sudah ${n} dari ${TOTAL}` : "Mulai tes"}</button>
        ${n ? `<button class="btn" id="restart" type="button">Mulai dari awal</button>` : `<button class="btn link" id="toTeams" type="button">Untuk tim dan HR</button>`}
      </div>
      <p class="fineprint">Gangsal artinya lima dalam bahasa Jawa. Tanpa daftar akun. Jawabanmu tersimpan di perangkat ini, jadi bisa dilanjutkan nanti. Hasil untuk refleksi diri, bukan diagnosis. <a href="#disclaimer">Baca disclaimer</a>.</p>
    </div>
    <div class="home-art">${pentaFrame(SAMPLE)}</div>
  </section>
  <section class="dims" aria-label="Lima dimensi yang diukur">
    ${DIMS.map(d=>`<div><i style="background:var(--d-${DK[d.key]})"></i><b>${d.name}</b><span>${d.about}</span></div>`).join("")}
  </section>
  <section class="catalog" aria-labelledby="catTitle">
    <div class="catalog-head">
      <h2 id="catTitle">Karakter yang bisa kamu dapat</h2>
      <p class="lede">Nama karaktermu berasal dari sifat yang paling menonjol. Bila ada sifat kedua yang juga menonjol, namanya digabung, misalnya <i>Si Perancang yang Hangat</i>. Ini sebelas karakter dasarnya.</p>
      ${OCEAN_LEGEND}
    </div>
    <ul class="plist collapsed" id="catList">${basePersonas().map(p=>personaCard(p, `<span class="pmeta">${p.trait}</span>`)).join("")}</ul>
    <div><button class="btn" type="button" id="catMore" aria-controls="catList" aria-expanded="false">Lihat ${basePersonas().length - 6} karakter lainnya</button></div>
  </section>
  <section class="teams" aria-labelledby="teamsTitle">
    <div class="teams-copy">
      <h2 id="teamsTitle">Pakai Gangsal untuk tim atau calon karyawan.</h2>
      <p class="lede">Buat satu kode undangan, bagikan ke peserta, lalu lihat nama dan hasil setiap pengisi di satu halaman rekap. Tanpa daftar akun, gratis.</p>
      <div class="row"><button class="btn primary" id="toInvite" type="button">Buat undangan</button></div>
    </div>
    <ol class="steps">
      <li><b>Buat undangan</b><span>Beri judul, pilih batas waktu (1 jam sampai 30 hari) dan batas jumlah peserta.</span></li>
      <li><b>Bagikan kode</b><span>Peserta membuka link atau mengetik kode 8 huruf, mengisi nama, lalu mengerjakan tes.</span></li>
      <li><b>Lihat rekap</b><span>Nama, skor lima dimensi, dan karakter setiap peserta. Bisa diunduh sebagai CSV.</span></li>
    </ol>
    <p class="teams-note">Nama peserta dienkripsi di perangkat peserta. Hanya pemegang link rekap yang bisa membacanya, termasuk kami pun tidak.</p>
    <form class="joincode" id="joinForm" novalidate>
      <label for="joinCode">Punya kode undangan?</label>
      <div class="row">
        <input id="joinCode" name="joinCode" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="9" placeholder="contoh: k7m2x9pq">
        <button class="btn" type="submit">Buka undangan</button>
      </div>
      <p class="field-error" id="joinErr" role="alert" hidden></p>
    </form>
  </section>`;
  $("#toInvite").onclick = ()=>nav("/undang");
  $("#catMore").onclick = ()=>{
    const list = $("#catList"), open = list.classList.toggle("collapsed") === false;
    $("#catMore").setAttribute("aria-expanded", String(open));
    $("#catMore").textContent = open ? "Tampilkan lebih sedikit" : `Lihat ${basePersonas().length - 6} karakter lainnya`;
    if (!open) $("#catTitle").scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
  };
  if ($("#toTeams")) $("#toTeams").onclick = ()=>{ $(".teams").scrollIntoView({behavior: reduceMotion() ? "auto" : "smooth", block:"start"}); $("#teamsTitle").setAttribute("tabindex","-1"); $("#teamsTitle").focus({preventScroll:true}); };
  $("#joinForm").onsubmit = e=>{
    e.preventDefault();
    const c = $("#joinCode").value.trim().toLowerCase().replace(/[\s-]/g, "");
    if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/.test(c)){
      const er = $("#joinErr"); er.hidden = false; er.textContent = "Kode undangan terdiri dari 8 huruf dan angka. Periksa lagi kodenya.";
      $("#joinCode").setAttribute("aria-invalid","true"); return;
    }
    nav("/i/"+c);
  };
  $("#joinCode").oninput = ()=>{ $("#joinErr").hidden = true; $("#joinCode").removeAttribute("aria-invalid"); };
  $("#start").onclick = ()=>{ if (!n) qi = 0; nav("/#tes"); };
  if ($("#restart")) $("#restart").onclick = ()=>{ resetTest(); nav("/#tes"); };
}

/* ---------- tes: satu pernyataan per layar ---------- */
function viewTest(){
  setNav("test"); setTitle(`Pernyataan ${qi+1} dari ${TOTAL}`);
  quizActive = true;
  clearTimeout(advanceTimer);
  const [text] = ITEMS[qi];
  const done = answeredCount();
  const cur = answers[qi];
  $("#view").innerHTML = `
  <section class="quiz">
    <div class="quiz-top">
      ${mode ? `<p class="quiz-invite" title="${esc(`${mode.title ? mode.title+", " : ""}atas nama ${mode.name}`)}">${mode.title ? `<b>${esc(mode.title)}</b>, ` : "Undangan, "}atas nama <b>${esc(mode.name)}</b></p>` : ""}
      <div class="quiz-meta"><span>Pernyataan <b class="num">${qi+1}</b> dari ${TOTAL}</span><span class="saved num">${done} terjawab</span></div>
      <div class="track" role="progressbar" aria-label="Kemajuan tes" aria-valuemin="0" aria-valuemax="${TOTAL}" aria-valuenow="${done}"><i style="width:${done/TOTAL*100}%"></i></div>
    </div>
    <div>
      <p class="ask${qi===0 ? "" : " repeat"}">${qi===0 ? "Gambarkan dirimu seperti biasanya sekarang, bukan seperti yang kamu inginkan. Seberapa sesuai pernyataan ini?" : "Seberapa sesuai pernyataan ini dengan dirimu?"}</p>
      <p class="statement" id="statement" tabindex="-1">${esc(text)}</p>
    </div>
    <div class="answers" role="radiogroup" aria-labelledby="statement">
      ${SCALE.map((_,j)=>`<button type="button" class="ans" role="radio" aria-checked="${cur===j+1}" data-v="${j+1}">
        <span class="key" aria-hidden="true">${j+1}</span><span>${ANSWER_TXT[j]}</span><span class="mark" aria-hidden="true"></span></button>`).join("")}
    </div>
    <div class="quiz-nav">
      <button class="btn" type="button" id="prev">${qi===0 ? (mode ? "Ganti nama" : "Kembali ke beranda") : "Sebelumnya"}</button>
      <span class="keys-hint">Bisa juga tekan angka 1 sampai 5</span>
      ${cur!==null && qi<TOTAL-1 ? `<button class="btn primary" type="button" id="next">Berikutnya</button>` : ""}
      ${cur!==null && qi===TOTAL-1 ? `<button class="btn primary" type="button" id="finish">${mode ? "Kirim dan lihat hasil" : "Lihat hasil"}</button>` : ""}
    </div>
  </section>`;
  document.querySelectorAll(".ans").forEach(b=>b.onclick = ()=>choose(+b.dataset.v));
  $("#prev").onclick = prev;
  if ($("#next")) $("#next").onclick = next;
  if ($("#finish")) $("#finish").onclick = finish;
}
function choose(v){
  answers[qi] = v; saveDraft();
  document.querySelectorAll(".ans").forEach(b=>b.setAttribute("aria-checked", String(+b.dataset.v===v)));
  clearTimeout(advanceTimer);
  advanceTimer = setTimeout(()=>{ if (qi < TOTAL-1) next(); else finish(); }, reduceMotion() ? 120 : 320);
}
function next(){
  if (qi < TOTAL-1){ qi++; saveDraft(); viewTest(); $("#statement")?.focus({preventScroll:true}); window.scrollTo(0,0); }
}
function prev(){
  clearTimeout(advanceTimer);
  if (qi===0) return mode ? viewInviteJoin(mode.code, { edit: true }) : nav("/");
  qi--; saveDraft(); viewTest(); $("#statement")?.focus({preventScroll:true});
}
let finishing = false;
async function finish(){
  const miss = answers.findIndex(v=>v===null);
  if (miss !== -1){ qi = miss; saveDraft(); viewTest(); return; }
  if (finishing) return;
  const s = score(answers);
  const sent = answers.slice();
  if (mode){
    finishing = true;
    quizActive = false;
    $("#view").innerHTML = `<section class="quiz"><p class="statement">Mengirim hasilmu ke pembuat undangan...</p></section>`;
    const inv = mode;
    let outcome;
    try{
      const name = await sealName(inv.name, inv.pub);
      const res = await fetch(`/api/invites/${inv.code}/results`, {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({cid:clientId(), answers:sent, name})});
      outcome = res.ok ? "ok" : res.status===410 ? "expired" : res.status===409 ? ((await res.json().catch(()=>({}))).error==="already" ? "already" : "full")
        : res.status===429 ? "limited" : "error";
    }catch(e){ outcome = "network"; }
    finishing = false;
    const MSG = {
      ok: ["ok", `Hasilmu sudah terkirim ke pembuat undangan${inv.title ? ` "${inv.title}"` : ""} atas nama ${inv.name}, dan ikut rekap umum tanpa nama.`],
      expired: ["warn", "Batas waktu undangan sudah lewat, jadi hasilmu tidak terkirim. Hasil di bawah tetap milikmu."],
      already: ["warn", "Perangkat ini sudah pernah mengirim hasil untuk undangan ini, jadi hasil baru tidak dikirim."],
      full: ["warn", "Kuota peserta undangan ini sudah penuh, jadi hasilmu tidak terkirim."],
      limited: ["warn", "Terlalu banyak percobaan dari jaringan ini. Hasilmu belum terkirim; coba kirim lagi nanti dari perangkat ini."],
      error: ["warn", "Hasilmu tidak terkirim karena ada kesalahan di server."],
      network: ["warn", "Hasilmu belum terkirim karena koneksi terputus. Periksa internet lalu tekan Kirim lagi."],
    }[outcome];
    if (outcome === "network" || outcome === "limited" || outcome === "error"){
      // simpan draft supaya bisa dikirim ulang
      saveDraft(); qi = TOTAL-1;
      viewTest();
      const st = document.createElement("p"); st.className = "status warn"; st.setAttribute("role","alert"); st.textContent = MSG[1];
      $(".quiz").prepend(st);
      return;
    }
    resetTest();
    if (outcome === "ok" || outcome === "already") lsSet(`gangsal-inv-done-${inv.code}`, outcome === "ok" ? encode(s) : "1");
    lsSet("gangsal-last", encode(s));
    ssSet("gangsal-mine", encode(s));
    saveState = {state: MSG[0], msg: MSG[1]};
    setMode(null);
    nav("/h/"+encode(s));
    return;
  }
  resetTest();
  lsSet("gangsal-last", encode(s));
  ssSet("gangsal-mine", encode(s));
  saveResult(sent);
  nav("/h/"+encode(s));
}
document.addEventListener("keydown", e=>{
  if (!quizActive || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest && e.target.closest("input,textarea")) return;
  if (/^[1-5]$/.test(e.key)){ e.preventDefault(); choose(+e.key); }
  else if (e.key==="ArrowLeft"){ e.preventDefault(); prev(); }
  else if (e.key==="ArrowRight" && answers[qi]!==null){ e.preventDefault(); if (qi<TOTAL-1) next(); else finish(); }
});

async function saveResult(ans){
  saveState = {state:"saving", msg:"Menyimpan hasil ke rekap..."}; updateSaveStatus();
  try{
    const res = await fetch("/api/results", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({cid:clientId(), answers:ans})});
    if (res.ok){ saveState = {state:"ok", msg:"Hasilmu masuk rekap peserta tanpa nama. Tes ulang dari perangkat ini akan menimpa hasil lama."}; recap = null; }
    else if (res.status===429) saveState = {state:"warn", msg:"Hasil tidak masuk rekap karena terlalu banyak percobaan dari jaringan ini. Coba lagi satu jam lagi."};
    else saveState = {state:"warn", msg:"Hasil tidak masuk rekap. Hasilmu di halaman ini tetap berlaku."};
  }catch(e){ saveState = {state:"warn", msg:"Hasil belum masuk rekap karena koneksi terputus. Hasilmu di halaman ini tetap berlaku."}; }
  updateSaveStatus();
}
function updateSaveStatus(){
  const el = $("#saveStatus"); if (!el) return;
  el.hidden = saveState.state==="idle";
  el.className = "status "+(saveState.state==="ok"?"ok":saveState.state==="warn"?"warn":"");
  el.textContent = saveState.msg;
}

/* ---------- hasil ---------- */
function summary(s){
  const hi = DIMS.filter(d=>s[d.key]>65).map(d=>d.high.toLowerCase());
  const lo = DIMS.filter(d=>s[d.key]<35).map(d=>d.low.toLowerCase());
  const join = a => a.length<2 ? a.join("") : a.slice(0,-1).join(", ")+" dan "+a[a.length-1];
  if (!hi.length && !lo.length) return "Kelima sisimu berada di tengah. Kamu luwes dan mudah menyesuaikan diri dengan banyak situasi.";
  const parts = [];
  if (hi.length) parts.push(`cenderung ${join(hi)}`);
  if (lo.length) parts.push(`${hi.length?"sekaligus ":""}cenderung ${join(lo)}`);
  return `Kamu ${parts.join(", ")}. Bentuk dan gerak karakter ini dibangun dari kelima skormu.`;
}

function viewResult(s, code){
  setNav("test");
  const mine = ssGet("gangsal-mine")===code;
  const name = persona(s);
  setTitle(name);
  $("#view").innerHTML = `
  <section class="result">
    <div class="stage">${characterSVG(s, {title:name})}</div>
    <div class="result-copy">
      <p class="who">${mine ? "Karaktermu adalah" : "Seseorang membagikan karakternya"}</p>
      <h1>${name}</h1>
      <p class="lede">${summary(s)}</p>
      <p class="status" id="saveStatus" role="status" hidden></p>
      <div class="row">
        <button class="btn primary" id="shareBtn" type="button">Bagikan karakter</button>
        <button class="btn" id="saveImg" type="button">Unduh gambar</button>
      </div>
      <p class="status" id="shareStatus" role="status"></p>
      <textarea id="shareFallback" readonly hidden rows="3" aria-label="Tautan untuk disalin"></textarea>
      ${mine ? "" : `<div><button class="btn" id="tryIt" type="button">Ikut tes dan buat karaktermu</button></div>`}
    </div>
  </section>
  <section class="profile" aria-labelledby="profileTitle">
    <div>
      <h2 id="profileTitle" style="margin-bottom:12px">Skor lima sisi</h2>
      ${radar(s, "Skor "+name)}
    </div>
    <div class="readings">
      ${DIMS.map(d=>{ const v = s[d.key], lv = level(v); return `
      <article class="reading">
        <span class="score num" style="color:var(--t-${DK[d.key]})">${v}</span>
        <h3>${d.name} <small>${LEVEL_TXT[lv]}</small></h3>
        <p>${TEXT[d.key][lv]}</p>
      </article>`; }).join("")}
      <p class="note">Skor 0 sampai 100 dihitung dari jawabanmu sendiri, bukan perbandingan dengan orang lain. Tidak ada skor yang lebih baik; tiap ujung punya kelebihannya.</p>
      ${mine ? `<div class="row" style="margin-top:20px"><button class="btn" id="again" type="button">Ulangi tes</button><button class="btn link" id="toRecap2" type="button">Lihat rekap peserta</button></div>` : ""}
    </div>
  </section>`;
  if (mine) updateSaveStatus();
  const url = location.origin + "/h/" + code;
  const text = `Karakter kepribadianku: ${name}. ` + DIMS.map(d=>`${d.short} ${s[d.key]}`).join(", ") + ". Buat karaktermu:";
  const st = $("#shareStatus");
  const copy = (str, okMsg)=> (navigator.clipboard ? navigator.clipboard.writeText(str) : Promise.reject())
    .then(()=>{ st.className="status ok"; st.textContent=okMsg; $("#shareFallback").hidden = true; })
    .catch(()=>{ const f=$("#shareFallback"); f.hidden=false; f.value=str; f.focus(); f.select(); st.className="status"; st.textContent="Salin teks di bawah ini: tekan Ctrl+C, atau tahan lalu pilih Salin."; });
  $("#shareBtn").onclick = ()=>{
    if (navigator.share) navigator.share({title:name, text, url}).catch(()=>{});
    else copy(text+" "+url, "Teks dan tautan sudah disalin. Tempel di media sosialmu.");
  };
  $("#saveImg").onclick = async ()=>{
    try{
      const blob = await renderCard(s, name);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `gangsal-${code}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
      st.className="status ok"; st.textContent="Gambar sudah diunduh.";
    }catch(e){ st.className="status warn"; st.textContent="Gambar gagal dibuat di peramban ini. Coba peramban lain."; }
  };
  if ($("#tryIt")) $("#tryIt").onclick = ()=>{ resetTest(); nav("/#tes"); };
  if ($("#again")) $("#again").onclick = ()=>{ resetTest(); nav("/#tes"); };
  if ($("#toRecap2")) $("#toRecap2").onclick = ()=>nav("/#rekap");
}

async function renderCard(s, name){
  const W=1080, H=1350, c=document.createElement("canvas"); c.width=W; c.height=H;
  const g=c.getContext("2d");
  const ink="#181B22", mu="#525866", tr="#DCE1E8";
  const col = {E:"#F4845F",A:"#EE8FAE",C:"#5B8DEF",S:"#4FBF95",I:"#A77BE0"};
  g.fillStyle="#F1F3F6"; g.fillRect(0,0,W,H);
  g.fillStyle="#E3E8EF"; rr(g,90,70,W-180,620,48); g.fill();
  const img = new Image();
  img.src = URL.createObjectURL(new Blob([characterSVG(s, {animate:false})], {type:"image/svg+xml"}));
  await img.decode();
  g.drawImage(img, (W-540)/2, 80, 540, 585);
  URL.revokeObjectURL(img.src);
  g.textAlign="center"; g.fillStyle=ink; g.font="800 64px 'Bricolage Grotesque', sans-serif";
  g.fillText(name, W/2, 780, W-140);
  g.textAlign="left";
  let y = 860;
  DIMS.forEach(d=>{
    const v = s[d.key];
    g.fillStyle=ink; g.font="700 34px 'Atkinson Hyperlegible', sans-serif"; g.fillText(d.name, 110, y);
    const t=String(v); g.fillText(t, W-110-g.measureText(t).width, y);
    g.fillStyle=tr; rr(g,110,y+18,W-220,20,10); g.fill();
    g.fillStyle=col[d.key]; rr(g,110,y+18,Math.max((W-220)*v/100,20),20,10); g.fill();
    y += 88;
  });
  g.fillStyle=mu; g.font="400 28px 'Atkinson Hyperlegible', sans-serif"; g.textAlign="center";
  g.fillText(`Tes Big Five Gangsal, ${location.host}`, W/2, H-48);
  return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("toBlob")),"image/png"));
}
function rr(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }

/* ---------- rekap ---------- */
async function loadRecap(){
  recapErr = null;
  const ctl = new AbortController(); const timer = setTimeout(()=>ctl.abort(), 10000);
  try{
    const res = await fetch("/api/stats", {signal:ctl.signal});
    if (!res.ok) throw new Error(String(res.status));
    recap = await res.json();
  }catch(e){ recapErr = "Rekap gagal dimuat. Periksa koneksi internet, lalu tekan Rekap lagi."; }
  finally{ clearTimeout(timer); }
  if (location.hash==="#rekap") viewRecap();
}

function viewRecap(){
  setNav("recap"); setTitle("Rekap peserta");
  if (recap===null && !recapErr) loadRecap();
  let body;
  if (recapErr) body = `<div class="empty">${recapErr}</div>`;
  else if (recap===null) body = `<div class="empty">Memuat rekap peserta...</div>`;
  else if (!recap.total) body = `<div class="empty">Belum ada peserta. Jadilah yang pertama, lalu hasilmu akan muncul di sini.</div>`;
  else {
    const n = recap.total, name = persona(recap.avg);
    const LV = [["rendah","var(--soft)","var(--muted)"],["sedang","var(--line)","var(--ink)"],["tinggi","var(--ink)","var(--primary-ink)"]];
    body = `
      <section class="result" style="margin-top:8px">
        <div class="stage">${characterSVG(recap.avg, {title:"Karakter rata-rata peserta"})}</div>
        <div class="result-copy">
          <p class="who">Kalau semua peserta digabung jadi satu karakter, hasilnya</p>
          <h1>${name}</h1>
          <p class="lede"><span class="big-count num">${n}</span> peserta sudah ikut tes.</p>
        </div>
      </section>
      <section class="profile">
        <div>
          <h2 style="margin-bottom:12px">Rata-rata skor</h2>
          ${radar(recap.avg, "Rata-rata skor peserta")}
        </div>
        <div>
          <h2 style="margin-bottom:18px">Sebaran tingkat</h2>
          <div class="levels">${DIMS.map(d=>{ const b = recap.levels[d.key]; return `
            <div class="lv-row"><b>${d.name}</b>
              <div class="lv-bar" role="img" aria-label="${d.name}: rendah ${b.rendah} orang, sedang ${b.sedang} orang, tinggi ${b.tinggi} orang">
                ${LV.map(([l,bg,fg])=>b[l]?`<i style="width:${b[l]/n*100}%;background:${bg};color:${fg}">${Math.round(b[l]/n*100)}%</i>`:"").join("")}
              </div></div>`;}).join("")}
          </div>
          <div class="lv-legend" style="margin-top:16px">${LV.map(([l,bg])=>`<span><i style="background:${bg};border:1px solid var(--line)"></i>${l[0].toUpperCase()+l.slice(1)} (${l==="rendah"?"0-34":l==="sedang"?"35-65":"66-100"})</span>`).join("")}</div>
          <p class="note">Satu hasil per perangkat. Tes ulang dari perangkat yang sama menimpa hasil lama.</p>
        </div>
      </section>
      ${(recap.personas || []).length ? `<section class="catalog" aria-labelledby="pTitle">
        <div class="catalog-head">
          <h2 id="pTitle">Karakter para peserta</h2>
          <p class="lede">${recap.personas.length} karakter berbeda dari ${n} peserta, diurutkan dari yang paling banyak. Persentase OCEAN adalah rata-rata peserta di karakter itu.</p>
          ${OCEAN_LEGEND}
        </div>
        <ul class="plist">${recap.personas.map(p=>personaCard(p, `<span class="pmeta"><b class="num">${p.n}</b> peserta, ${Math.round(p.n/n*100)}%</span>`)).join("")}</ul>
      </section>` : ""}`;
  }
  $("#view").innerHTML = `
    ${recap && recap.total ? "" : `<h1 style="margin-bottom:24px">Rekap peserta</h1>`}
    ${body}
    <div class="row" style="margin-top:32px"><button class="btn primary" id="toTest" type="button">Ikut tes</button>${recap?`<button class="btn link" id="refresh" type="button">Muat ulang rekap</button>`:""}</div>`;
  $("#toTest").onclick = ()=>nav("/#tes");
  if ($("#refresh")) $("#refresh").onclick = ()=>{ recap = null; viewRecap(); };
}

/* ---------- undangan: daftar milik perangkat ini ---------- */
// Link rekap berisi kunci rahasia; disimpan HANYA di browser pembuat supaya tidak hilang saat halaman ditinggal.
const MY_INV_KEY = "gangsal-my-invites";
function myInvites(){
  try { const l = JSON.parse(lsGet(MY_INV_KEY)||"[]"); return Array.isArray(l) ? l.filter(x=>x && /^[a-z0-9]{8}$/.test(x.code) && typeof x.admin==="string") : []; }
  catch(e){ return []; }
}
function rememberInvite(entry){
  const l = myInvites().filter(x=>x.code !== entry.code);
  l.unshift({ ...(myInvites().find(x=>x.code===entry.code) || {}), ...entry });
  lsSet(MY_INV_KEY, JSON.stringify(l.slice(0, 50)));
}
function forgetInvite(code){ lsSet(MY_INV_KEY, JSON.stringify(myInvites().filter(x=>x.code !== code))); }
const recapUrl = x => `${location.origin}/r/${x.code}#${x.admin}`;
const joinUrl = x => `${location.origin}/i/${x.code}#${x.tkey}`;
function myInvitesHTML(){
  const l = myInvites();
  if (!l.length) return "";
  const now = Date.now();
  return `<section class="my-inv" aria-labelledby="myInvTitle">
    <h2 id="myInvTitle">Undangan yang kamu buat di perangkat ini</h2>
    <p class="hint">Disimpan hanya di browser ini. Simpan juga link rekap di tempat lain bila ingin membukanya dari perangkat lain.</p>
    <ul class="inv-list">${l.map(x=>`<li>
      <div class="inv-item-main"><b>${x.title ? esc(x.title) : "Undangan tanpa judul"}</b>
        <span class="muted">Kode ${x.code} &middot; ${x.expiresAt ? (x.expiresAt > now ? `terbuka sampai ${fmtTime(x.expiresAt)}` : `ditutup ${fmtTime(x.expiresAt)}`) : ""}</span></div>
      <div class="row">
        <a class="btn primary" href="/r/${x.code}#${esc(x.admin)}">Buka rekap</a>
        ${x.tkey ? `<button class="btn" type="button" data-copy="${x.code}">Salin link peserta</button>` : ""}
        <button class="btn link" type="button" data-forget="${x.code}">Hapus dari daftar</button>
      </div></li>`).join("")}</ul>
  </section>`;
}
function bindMyInvites(){
  document.querySelectorAll("[data-copy]").forEach(b=>{ const x = myInvites().find(i=>i.code===b.dataset.copy); if (x) copyBtn(b, joinUrl(x), "Tersalin"); });
  document.querySelectorAll("[data-forget]").forEach(b=>b.onclick = ()=>{
    const code = b.dataset.forget;
    const li = b.closest("li");
    li.innerHTML = `<p>Hapus <b>${code}</b> dari daftar perangkat ini? Undangan dan datanya tetap ada di server, tapi tanpa link rekap kamu tidak bisa membukanya lagi.</p>
      <div class="row"><button class="btn danger-btn" type="button" data-yes>Hapus dari daftar</button><button class="btn link" type="button" data-no>Batal</button></div>`;
    li.querySelector("[data-no]").onclick = ()=>viewInviteCreate();
    li.querySelector("[data-yes]").onclick = ()=>{ forgetInvite(code); viewInviteCreate(); };
  });
}

/* ---------- undangan: buat ---------- */
const DURATION_OPTS = [["1h","1 jam"],["1d","1 hari"],["7d","7 hari"],["30d","30 hari"]];
function copyBtn(btn, value, okText){
  btn.onclick = ()=>{
    const done = ()=>{ const t = btn.textContent; btn.textContent = okText; setTimeout(()=>btn.textContent = t, 1800); };
    (navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject()).then(done).catch(()=>{
      const inp = btn.parentElement.querySelector("input"); if (inp){ inp.focus(); inp.select(); }
    });
  };
}
function viewInviteCreate(){
  setNav("invite"); setTitle("Buat undangan");
  $("#view").innerHTML = `
  <section class="form-page">
    <h1>Buat undangan tes</h1>
    <p class="lede">Peserta yang memakai kode ini mengisi nama lalu mengerjakan tes. Kamu melihat nama dan hasil mereka di halaman rekap. Kamu tidak perlu daftar akun.</p>
    <form id="invForm" class="form" novalidate>
      <div class="field">
        <label for="invTitle">Judul undangan <span class="opt">opsional</span></label>
        <input id="invTitle" name="invTitle" maxlength="80" autocomplete="off" placeholder="contoh: Rekrutmen Staf Keuangan, Mei">
        <p class="hint">Tampil ke peserta. Judul dienkripsi, jadi kami tidak bisa membacanya.</p>
      </div>
      <fieldset class="field">
        <legend>Batas waktu pengisian</legend>
        <p class="hint">Dihitung sejak undangan dibuat. Setelah lewat, kode tidak bisa dipakai lagi.</p>
        <div class="choices">
          ${DURATION_OPTS.map(([v,l],i)=>`<label class="choice"><input type="radio" name="dur" id="dur-${v}" value="${v}" ${i===0?"checked":""}><span>${l}</span></label>`).join("")}
        </div>
      </fieldset>
      <div class="field">
        <label for="invMax">Batas jumlah peserta <span class="opt">opsional</span></label>
        <input id="invMax" name="invMax" type="number" inputmode="numeric" min="1" max="500" placeholder="tanpa batas">
        <p class="field-error" id="invMaxErr" role="alert" hidden></p>
      </div>
      <div class="row"><button class="btn primary" id="invSubmit" type="submit">Buat undangan</button></div>
      <p class="status warn" id="invStatus" role="alert" hidden></p>
    </form>
    ${myInvitesHTML()}
  </section>`;
  bindMyInvites();
  const max = $("#invMax"), maxErr = $("#invMaxErr");
  const checkMax = ()=>{
    const v = max.value.trim();
    const bad = v !== "" && !(Number.isInteger(+v) && +v >= 1 && +v <= 500);
    maxErr.hidden = !bad; maxErr.textContent = bad ? "Isi angka 1 sampai 500, atau kosongkan untuk tanpa batas." : "";
    bad ? max.setAttribute("aria-invalid","true") : max.removeAttribute("aria-invalid");
    return !bad;
  };
  max.onblur = checkMax;
  max.oninput = ()=>{ maxErr.hidden = true; max.removeAttribute("aria-invalid"); };
  $("#invForm").onsubmit = async e=>{
    e.preventDefault();
    if (!checkMax()){ max.focus(); return; }
    const btn = $("#invSubmit"), st = $("#invStatus");
    btn.disabled = true; btn.textContent = "Membuat undangan..."; st.hidden = true;
    try{
      const keys = await newInviteKeys();
      const title = $("#invTitle").value.trim();
      const body = {
        pub: keys.pub, adminHash: await sha256Hex(keys.adminToken),
        title: title ? await encryptTitle(title, keys.titleKey) : null,
        duration: document.querySelector('input[name="dur"]:checked').value,
        maxParticipants: max.value.trim() ? +max.value : null,
      };
      const res = await fetch("/api/invites", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body)});
      if (!res.ok) throw new Error(res.status===429 ? "Terlalu banyak undangan dibuat dari jaringan ini. Coba lagi satu jam lagi." : "Undangan gagal dibuat. Coba lagi.");
      const { code, expiresAt } = await res.json();
      viewInviteCreated({ code, expiresAt, title, keys, max: body.maxParticipants });
    }catch(err){
      btn.disabled = false; btn.textContent = "Buat undangan";
      st.hidden = false; st.textContent = err instanceof TypeError ? "Koneksi terputus. Periksa internet lalu coba lagi." : err.message;
    }
  };
}
function viewInviteCreated({ code, expiresAt, title, keys, max }){
  const pLink = `${location.origin}/i/${code}#${participantFragment(keys)}`;
  const aLink = `${location.origin}/r/${code}#${adminFragment(keys)}`;
  rememberInvite({ code, title, expiresAt, admin: adminFragment(keys), tkey: participantFragment(keys) });
  history.replaceState(null, "", "/undang");
  $("#view").innerHTML = `
  <section class="form-page">
    <h1>Undangan siap dibagikan</h1>
    <p class="lede">${title ? `"${esc(title)}". ` : ""}Bisa diisi sampai ${fmtTime(expiresAt)}${max ? `, maksimal ${max} peserta` : ""}.</p>
    <div class="codebox"><span>Kode undangan</span><b class="code-big">${code}</b></div>
    <div class="field">
      <label for="pLink">Link untuk peserta</label>
      <div class="copyrow"><input id="pLink" readonly value="${esc(pLink)}"><button class="btn" type="button" id="cpP">Salin</button></div>
      <p class="hint">Peserta juga bisa mengetik kode di beranda, tapi judul undangan hanya tampil lewat link ini.</p>
    </div>
    <div class="secret">
      <h2>Link rekap, khusus untukmu</h2>
      <p>Hanya link ini yang bisa membuka nama peserta. Link sudah tersimpan di browser ini (lihat menu <b>Undang</b>), tapi simpan juga salinannya. <b>Kalau browser ini dibersihkan dan salinannya tidak ada, rekap tidak bisa dibuka lagi oleh siapa pun, termasuk kami.</b> Jangan bagikan ke peserta.</p>
      <div class="copyrow"><input id="aLink" readonly value="${esc(aLink)}"><button class="btn" type="button" id="cpA">Salin</button></div>
      <div class="row">
        <button class="btn" type="button" id="dlA">Unduh sebagai file</button>
        <button class="btn primary" type="button" id="openA">Buka rekap</button>
      </div>
    </div>
  </section>`;
  copyBtn($("#cpP"), pLink, "Tersalin");
  copyBtn($("#cpA"), aLink, "Tersalin");
  $("#dlA").onclick = ()=>{
    const txt = `Gangsal - undangan ${code}\n${title ? "Judul: "+title+"\n" : ""}Batas waktu: ${fmtTime(expiresAt)}\n\nLink peserta:\n${pLink}\n\nLink rekap (RAHASIA, jangan dibagikan):\n${aLink}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], {type:"text/plain"})); a.download = `gangsal-undangan-${code}.txt`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  };
  $("#openA").onclick = ()=>{ location.href = aLink; };
}

/* ---------- undangan: peserta ---------- */
async function fetchInvite(code){
  const res = await fetch(`/api/invites/${code}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}
let joinCache = { code:null, inv:null, title:null };
async function viewInviteJoin(code, opts = {}){
  setNav("test"); setTitle("Undangan tes"); quizActive = false;
  const titleKey = location.hash.slice(1);
  $("#view").innerHTML = `<section class="form-page"><p class="lede">Memuat undangan...</p></section>`;
  let inv, title = null;
  try{
    if (joinCache.code === code){ inv = joinCache.inv; title = joinCache.title; }
    else {
      inv = await fetchInvite(code);
      if (inv && inv.title && /^[A-Za-z0-9_-]{16,40}$/.test(titleKey)){ try{ title = await decryptTitle(inv.title, titleKey); }catch(e){} }
      joinCache = { code, inv, title };
    }
  }catch(e){
    $("#view").innerHTML = `<section class="form-page"><h1>Undangan belum bisa dimuat</h1><p class="lede">Periksa koneksi internet, lalu muat ulang halaman ini.</p></section>`;
    return;
  }
  if (!inv){
    $("#view").innerHTML = `<section class="form-page"><h1>Kode undangan tidak ditemukan</h1><p class="lede">Periksa lagi kode <b>${esc(code)}</b> dengan pembuat undangan. Undangan juga dihapus otomatis 90 hari setelah batas waktunya habis.</p><div class="row"><button class="btn primary" id="home" type="button">Ke beranda</button></div></section>`;
    $("#home").onclick = ()=>nav("/");
    return;
  }
  const left = inv.expiresAt - Date.now();
  if (!inv.open){
    $("#view").innerHTML = `<section class="form-page"><h1>Undangan sudah ditutup</h1>
      <p class="lede">${title ? `"${esc(title)}" ` : "Undangan ini "}${inv.full ? "sudah mencapai batas jumlah peserta." : `ditutup pada ${fmtTime(inv.expiresAt)}.`} Hubungi pembuat undangan bila kamu masih perlu mengisi.</p>
      <div class="row"><button class="btn" id="home" type="button">Coba tes tanpa undangan</button></div></section>`;
    $("#home").onclick = ()=>nav("/");
    return;
  }
  const NAME_KEY = `gangsal-inv-name-${code}`;
  const done = lsGet(`gangsal-inv-done-${code}`);
  if (done){
    $("#view").innerHTML = `<section class="form-page join">
      <h1>Hasilmu sudah terkirim</h1>
      <p class="lede">Perangkat ini sudah mengirim hasil untuk undangan ${title ? `"${esc(title)}"` : esc(code)}${lsGet(NAME_KEY) ? ` atas nama ${esc(lsGet(NAME_KEY))}` : ""}. Satu perangkat hanya bisa mengirim satu kali per undangan.</p>
      <div class="row">${decode(done) ? `<button class="btn primary" id="seeMine" type="button">Lihat hasilku</button>` : ""}<button class="btn" id="home" type="button">Ke beranda</button></div>
    </section>`;
    if ($("#seeMine")) $("#seeMine").onclick = ()=>{ ssSet("gangsal-mine", done); nav("/h/"+done); };
    $("#home").onclick = ()=>nav("/");
    return;
  }
  const savedName = (mode && mode.code === code ? mode.name : lsGet(NAME_KEY)) || "";
  const start = name => {
    lsSet(NAME_KEY, name);
    setMode({ code, pub: inv.pub, name, title });
    viewTest(); $("#statement")?.focus({preventScroll:true}); window.scrollTo(0,0);
  };
  // Sudah pernah mulai di perangkat ini (dan tidak sedang kembali dari pernyataan pertama): langsung lanjutkan.
  if (!opts.edit && savedName && !(mode && mode.code === code)){
    const draft = (()=>{ try { return JSON.parse(lsGet(`gangsal-inv-${code}`)||"null"); } catch(e){ return null; } })();
    if (draft && Array.isArray(draft.a) && draft.a.some(v=>v!==null)) return start(savedName);
  }
  $("#view").innerHTML = `
  <section class="form-page join">
    <p class="join-ctx">${title ? `<b>${esc(title)}</b>` : "Undangan tes kepribadian Big Five"}<span>Terbuka ${fmtLeft(left)}, 50 pernyataan, sekitar 8 menit</span></p>
    <form id="joinStart" class="form" novalidate>
      <div class="field">
        <label for="pName" class="join-q">Siapa namamu?</label>
        <input id="pName" name="pName" class="join-input" maxlength="80" autocomplete="name" autocapitalize="words" enterkeyhint="go" value="${esc(savedName)}" placeholder="Nama lengkap" required>
        <p class="field-error" id="pNameErr" role="alert" hidden></p>
      </div>
      <button class="btn primary join-go" type="submit">Mulai tes</button>
      <p class="hint">Dengan menekan Mulai tes, kamu setuju nama dan hasil tesmu dikirim ke pembuat undangan ini, dan skormu ikut rekap umum tanpa nama. Namamu dienkripsi di perangkat ini; hanya pembuat undangan yang bisa membacanya.</p>
    </form>
  </section>`;
  const nm = $("#pName"), nmErr = $("#pNameErr");
  const checkName = ()=>{
    const v = nm.value.trim(); const bad = v.length < 2;
    nmErr.hidden = !bad; nmErr.textContent = bad ? "Isi nama lengkapmu, minimal 2 huruf." : "";
    bad ? nm.setAttribute("aria-invalid","true") : nm.removeAttribute("aria-invalid");
    return !bad;
  };
  nm.oninput = ()=>{ nmErr.hidden = true; nm.removeAttribute("aria-invalid"); };
  nm.focus({ preventScroll: true });
  $("#joinStart").onsubmit = e=>{
    e.preventDefault();
    if (!checkName()){ nm.focus(); return; }
    start(nm.value.trim().replace(/\s+/g," "));
  };
}

/* ---------- undangan: rekap pembuat ---------- */
// label pendek untuk kartu peserta di layar sempit (nama lengkap tetap di tabel desktop dan atribut title)
const CARD_LABEL = { E:"Ekstra", A:"Ramah", C:"Hati-hati", S:"Stabil", I:"Imaji" };
function csvCell(v){ const s = String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
let recapTimer = null;
let recapSort = { code: null, key: "at", dir: 1 };
async function viewInviteRecap(code, opts = {}){
  clearInterval(recapTimer);
  setNav("invite"); setTitle("Rekap undangan"); quizActive = false;
  const keys = parseAdminFragment(location.hash);
  if (!keys){
    $("#view").innerHTML = `<section class="form-page"><h1>Link rekap tidak lengkap</h1><p class="lede">Buka link rekap lengkap yang kamu terima saat membuat undangan, termasuk bagian setelah tanda #. Tanpa bagian itu, nama peserta tidak bisa dibuka.</p></section>`;
    return;
  }
  const keepY = opts.silent ? scrollY : 0;
  if (!opts.silent) $("#view").innerHTML = `<section class="form-page"><p class="lede">Memuat rekap...</p></section>`;
  let data;
  try{
    const res = await fetch(`/api/invites/${code}/results`, { headers: { "X-Admin-Token": keys.adminToken }, cache: "no-store" });
    if (res.status === 404){ $("#view").innerHTML = `<section class="form-page"><h1>Undangan tidak ditemukan</h1><p class="lede">Undangan ini sudah dihapus, atau sudah lewat 90 hari setelah batas waktunya sehingga datanya dihapus otomatis.</p></section>`; return; }
    if (res.status === 403){ $("#view").innerHTML = `<section class="form-page"><h1>Link rekap tidak cocok</h1><p class="lede">Link ini bukan link rekap untuk undangan ${esc(code)}. Periksa apakah link tersalin utuh.</p></section>`; return; }
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  }catch(e){
    if (opts.silent){ const s = document.querySelector(".refresh-row .hint"); if (s) s.textContent = "Gagal memperbarui. Periksa koneksi; data di bawah adalah data terakhir."; return; }
    $("#view").innerHTML = `<section class="form-page"><h1>Rekap belum bisa dimuat</h1><p class="lede">Periksa koneksi internet, lalu muat ulang halaman ini.</p></section>`;
    return;
  }
  let title = null;
  if (data.invite.title){ try{ title = await decryptTitle(data.invite.title, keys.titleKey); }catch(e){} }
  // ingat undangan ini di perangkat pembuat (misalnya bila link dibuka dari file atau pesan)
  rememberInvite({ code, title, expiresAt: data.invite.expiresAt, admin: location.hash.slice(1), tkey: keys.titleKey });
  const rows = [];
  for (const r of data.rows){
    let name; try{ name = await openName(r.name, keys.priv); }catch(e){ name = null; }
    rows.push({ name, scores: r.scores, at: r.at, persona: persona(r.scores) });
  }
  const inv = data.invite, now = Date.now(), n = rows.length;
  const avg = {}; DIMS.forEach(d=>avg[d.key] = n ? Math.round(rows.reduce((t,r)=>t+r.scores[d.key],0)/n) : 50);
  if (recapSort.code !== code) recapSort = { code, key: "at", dir: 1 };
  let sortKey = recapSort.key, sortDir = recapSort.dir;
  const pLink = `${location.origin}/i/${code}#${keys.titleKey}`;
  const render = ()=>{
    const sorted = rows.slice().sort((a,b)=>{
      const va = sortKey==="name" ? (a.name||"").toLowerCase() : sortKey==="at" ? a.at : a.scores[sortKey];
      const vb = sortKey==="name" ? (b.name||"").toLowerCase() : sortKey==="at" ? b.at : b.scores[sortKey];
      return (va < vb ? -1 : va > vb ? 1 : 0) * sortDir;
    });
    const th = (k, label)=>`<th scope="col" aria-sort="${sortKey===k ? (sortDir>0?"ascending":"descending") : "none"}"><button type="button" class="sort" data-k="${k}">${label}${sortKey===k ? (sortDir>0?" (naik)":" (turun)") : ""}</button></th>`;
    $("#tableWrap").innerHTML = n ? `<table class="rtable">
      <thead><tr>${th("name","Nama")}${DIMS.map(d=>th(d.key, d.short)).join("")}<th scope="col">Karakter</th>${th("at","Waktu")}</tr></thead>
      <tbody>${sorted.map(r=>`<tr>
        <th scope="row">${r.name===null ? `<span class="muted">Nama tidak terbaca</span>` : esc(r.name)}</th>
        ${DIMS.map(d=>{ const v = r.scores[d.key]; return `<td class="num sc" data-label="${CARD_LABEL[d.key]}" title="${d.name} ${v}"><span class="cell-score lv-${level(v)}">${v}</span></td>`; }).join("")}
        <td class="persona" data-label="Karakter"><a href="/h/${encode(r.scores)}" target="_blank" rel="noopener">${esc(r.persona)}</a></td>
        <td class="num muted when" data-label="Waktu">${fmtTime(r.at)}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">Belum ada peserta yang mengirim hasil. Bagikan link peserta di atas.</div>`;
    document.querySelectorAll(".sort").forEach(b=>b.onclick = ()=>{ const k = b.dataset.k; sortDir = sortKey===k ? -sortDir : (k==="name"||k==="at" ? 1 : -1); sortKey = k; recapSort = { code, key: sortKey, dir: sortDir }; render(); });
    if ($("#sortSel")) $("#sortSel").value = ["name","at",...DIMS.map(d=>d.key)].includes(sortKey) ? sortKey : "at";
  };
  $("#view").innerHTML = `
  <section class="recap-inv">
    <p class="who">Rekap undangan ${esc(code)}</p>
    <h1>${title ? esc(title) : "Undangan tanpa judul"}</h1>
    <div class="inv-meta">
      <span class="pill ${inv.open ? "open" : "closed"}">${inv.open ? "Terbuka" : "Ditutup"}</span>
      <span>${inv.open ? `Sampai ${fmtTime(inv.expiresAt)}, ${fmtLeft(inv.expiresAt-now)}` : `Ditutup ${inv.full ? "karena kuota penuh" : fmtTime(inv.expiresAt)}`}</span>
      <span><b class="num">${n}</b>${inv.maxParticipants ? ` dari ${inv.maxParticipants}` : ""} peserta</span>
    </div>
    <div class="row refresh-row">
      <button class="btn" type="button" id="reloadRecap">Muat ulang</button>
      <span class="hint" role="status">Diperbarui pukul ${new Date().toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"})}${inv.open ? ". Halaman ini memperbarui diri setiap 30 detik." : "."}</span>
    </div>
    ${inv.open ? `<div class="field" style="margin-top:20px"><label for="pLink2">Link untuk peserta</label><div class="copyrow"><input id="pLink2" readonly value="${esc(pLink)}"><button class="btn" type="button" id="cpP2">Salin</button></div></div>` : ""}
    <p class="hint" style="margin-top:12px">Simpan halaman ini di bookmark. Data dihapus otomatis pada ${fmtTime(inv.expiresAt + 90*86400000)}.</p>
  </section>
  <section class="recap-table">
    <div class="row" style="justify-content:space-between;margin-bottom:12px"><h2>Peserta</h2>${n ? `<button class="btn" type="button" id="csv">Unduh CSV</button>` : ""}</div>
    ${n > 1 ? `<div class="sort-mobile"><label for="sortSel">Urutkan</label><select id="sortSel">
      <option value="at">Waktu mengisi</option><option value="name">Nama</option>
      ${DIMS.map(d=>`<option value="${d.key}">${d.name} tertinggi</option>`).join("")}</select></div>` : ""}
    <div class="table-scroll" id="tableWrap"></div>
    <p class="note">Rendah 0-34, sedang 35-65, tinggi 66-100. Skor dihitung dari jawaban peserta sendiri, bukan perbandingan dengan populasi. Gunakan sebagai bahan percakapan, bukan satu-satunya dasar keputusan.</p>
  </section>
  ${n ? `<section class="profile inv-avg">
    <div><h2 style="margin-bottom:12px">Rata-rata ${n} peserta</h2>${radar(avg, "Rata-rata peserta undangan")}</div>
    <div class="result-copy" style="align-self:center"><div class="stage">${characterSVG(avg, {title:"Karakter rata-rata"})}</div><p class="lede" style="text-align:center">${persona(avg)}</p></div>
  </section>
  <section class="catalog" aria-labelledby="ipTitle">
    <div class="catalog-head">
      <h2 id="ipTitle">Karakter peserta undangan ini</h2>
      ${OCEAN_LEGEND}
    </div>
    <ul class="plist">${groupByPersona(rows).map(p=>personaCard(p,
      `<span class="pmeta"><b class="num">${p.n}</b> peserta, ${Math.round(p.n/n*100)}%</span>${p.members.length ? `<span class="pmembers">${p.members.map(esc).join(", ")}</span>` : ""}`)).join("")}</ul>
  </section>` : ""}
  <section class="danger">
    <h2>Hapus undangan</h2>
    <p>Menghapus kode, semua nama, dan hasil per peserta untuk undangan ini secara permanen. Skor anonim di rekap umum tidak ikut terhapus.</p>
    <div id="delArea"><button class="btn danger-btn" type="button" id="delStart">Hapus undangan ini</button></div>
  </section>`;
  render();
  if (opts.silent) scrollTo(0, keepY);
  $("#reloadRecap").onclick = ()=>viewInviteRecap(code, { silent: true });
  if (inv.open) recapTimer = setInterval(()=>{
    if (location.pathname !== `/r/${code}`){ clearInterval(recapTimer); return; }
    if (document.hidden || $("#delConfirm") || document.activeElement?.id === "sortSel") return;
    viewInviteRecap(code, { silent: true });
  }, 30_000);
  if ($("#sortSel")) $("#sortSel").onchange = e=>{ sortKey = e.target.value; sortDir = (sortKey==="name"||sortKey==="at") ? 1 : -1; recapSort = { code, key: sortKey, dir: sortDir }; render(); };
  if ($("#cpP2")) copyBtn($("#cpP2"), pLink, "Tersalin");
  if ($("#csv")) $("#csv").onclick = ()=>{
    const head = ["Nama", ...DIMS.map(d=>d.name), "Karakter", "Waktu"];
    const lines = [head, ...rows.map(r=>[r.name ?? "", ...DIMS.map(d=>r.scores[d.key]), r.persona, new Date(r.at).toISOString()])].map(l=>l.map(csvCell).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿"+lines.join("\r\n")], {type:"text/csv"})); a.download = `gangsal-rekap-${code}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  };
  $("#delStart").onclick = ()=>{
    $("#delArea").innerHTML = `<div class="field"><label for="delConfirm">Ketik kode <b>${code}</b> untuk menghapus undangan beserta ${n} hasil peserta</label>
      <div class="copyrow"><input id="delConfirm" autocomplete="off" autocapitalize="none"><button class="btn danger-btn" type="button" id="delGo" disabled>Hapus permanen</button></div>
      <button class="btn link" type="button" id="delCancel">Batal</button><p class="status warn" id="delSt" role="alert" hidden></p></div>`;
    $("#delConfirm").focus();
    $("#delConfirm").oninput = ()=>{ $("#delGo").disabled = $("#delConfirm").value.trim().toLowerCase() !== code; };
    $("#delCancel").onclick = ()=>viewInviteRecap(code);
    $("#delGo").onclick = async ()=>{
      try{
        const res = await fetch(`/api/invites/${code}`, { method:"DELETE", headers: { "X-Admin-Token": keys.adminToken } });
        if (!res.ok) throw new Error();
        clearInterval(recapTimer);
        forgetInvite(code);
        $("#view").innerHTML = `<section class="form-page"><h1>Undangan ${esc(code)} sudah dihapus</h1><p class="lede">Kode tidak bisa dipakai lagi dan semua nama serta hasil per peserta sudah dihapus.</p><div class="row"><button class="btn primary" id="newInv" type="button">Buat undangan baru</button></div></section>`;
        $("#newInv").onclick = ()=>nav("/undang");
      }catch(e){ const s = $("#delSt"); s.hidden = false; s.textContent = "Undangan gagal dihapus. Periksa koneksi lalu coba lagi."; }
    };
  };
}

/* ---------- tema ---------- */
const THEMES = ["system","light","dark"];
const THEME_TXT = {system:"Sistem", light:"Terang", dark:"Gelap"};
const ICONS = {
  system:"M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-6v2h3v2H7v-2h3v-2H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v8h14V7H5Z",
  light:"M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0-5 1 3h-2l1-3Zm0 20-1-3h2l-1 3ZM2 12l3-1v2l-3-1Zm20 0-3 1v-2l3 1ZM4.9 4.9l2.8 1.4-1.4 1.4-1.4-2.8Zm14.2 14.2-2.8-1.4 1.4-1.4 1.4 2.8Zm0-14.2-1.4 2.8-1.4-1.4 2.8-1.4ZM4.9 19.1l1.4-2.8 1.4 1.4-2.8 1.4Z",
  dark:"M14.5 2.5a9.5 9.5 0 1 0 7 15.9A8 8 0 0 1 14.5 2.5Z"
};
const currentTheme = ()=>{ const t = lsGet("gangsal-theme"); return t==="light"||t==="dark" ? t : "system"; };
function applyTheme(t){
  if (t==="system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  $("#themeLabel").textContent = THEME_TXT[t];
  $("#themeIcon").setAttribute("d", ICONS[t]);
  $("#themeBtn").setAttribute("aria-label", `Tema: ${THEME_TXT[t]}. Tekan untuk ganti.`);
  const dark = t==="dark" || (t==="system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute("content", dark?"#14161B":"#F1F3F6"));
}

/* ---------- routing ---------- */
function route(){
  const p = location.pathname, h = location.hash.slice(1);
  const im = /^\/([ir])\/([a-z0-9]{8})$/.exec(p);
  if (im) return im[1]==="i" ? viewInviteJoin(im[2]) : viewInviteRecap(im[2]);
  if (p === "/undang") return viewInviteCreate();
  if (mode) setMode(null);
  if (p.startsWith("/h/")){
    const code = decodeURIComponent(p.slice(3));
    const s = decode(code);
    if (s) return viewResult(s, code);
    history.replaceState(null, "", "/");
  }
  if (h==="tes") viewTest();
  else if (h==="rekap") viewRecap();
  else if (h==="disclaimer"){ viewIntro(); $("#disclaimer").scrollIntoView(); }
  else viewIntro();
}
window.addEventListener("popstate", route);
window.addEventListener("hashchange", ()=>{ route(); if (location.hash!=="#disclaimer") window.scrollTo(0,0); });
$("#brand").onclick = e=>{ e.preventDefault(); nav("/"); };
document.querySelector(".skip").onclick = e=>{ e.preventDefault(); $("#view").focus(); };
$("#navTest").onclick = ()=>nav("/#tes");
$("#navRecap").onclick = ()=>nav("/#rekap");
$("#navInvite").onclick = ()=>nav("/undang");
$("#themeBtn").onclick = ()=>{ const t = THEMES[(THEMES.indexOf(currentTheme())+1)%3]; if (t==="system") lsDel("gangsal-theme"); else lsSet("gangsal-theme", t); applyTheme(t); };
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", ()=>applyTheme(currentTheme()));
applyTheme(currentTheme());
route();
