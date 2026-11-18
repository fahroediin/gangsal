import { DIMS as DIMS_ID, dims, ITEMS, itemText, SCALE, texts, levelName, score, level, encode, decode, persona as personaL, personaName,
  basePersonas as basePersonasL, ocean, normsReady, NORM_MIN_N, CONSENT_VERSION } from "/core.js";
import { characterSVG } from "/character.js";
import { newInviteKeys, sha256Hex, encryptTitle, decryptTitle, sealName, openName,
  participantFragment, adminFragment, parseAdminFragment } from "/invite-crypto.js";

/* ---------- bahasa ---------- */
// Semua teks tampilan ditulis berpasangan: L("teks Indonesia", "English text").
// Bahasa disimpan di browser (gangsal-lang); ?lang=en di URL berlaku untuk kunjungan itu saja.
let lang = "id";
let DIMS = DIMS_ID, TEXT = texts("id"), OCEAN = ocean("id"), ITEM_TXT = itemText("id");
const L = (id, en) => lang === "en" ? en : id;
const persona = s => personaL(s, lang);
const basePersonas = () => basePersonasL(lang);
const LOC = () => lang === "en" ? "en-GB" : "id-ID";
const langQ = () => lang === "en" ? "?lang=en" : "";
/** "peserta" / "participant(s)": bahasa Indonesia tidak berubah untuk jamak. */
const pt = n => L("peserta", n === 1 ? "participant" : "participants");
const peopleWord = n => L("orang sudah ikut", n === 1 ? "person so far" : "people so far");

const TOTAL = ITEMS.length;
const SAMPLE = { E: 68, A: 74, C: 41, S: 55, I: 82 };
const answerTxt = () => L(["Sangat tidak sesuai", "Agak tidak sesuai", "Netral atau ragu-ragu", "Agak sesuai", "Sangat sesuai"],
  ["Very inaccurate", "Moderately inaccurate", "Neither accurate nor inaccurate", "Moderately accurate", "Very accurate"]);
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
function setTitle(t){ document.title = t ? `${t} | Gangsal` : L("Gangsal: Tes Kepribadian Big Five", "Gangsal: Big Five Personality Test"); }
function setNav(which){
  $("#navTest").setAttribute("aria-current", which==="test"?"page":"false");
  $("#navInvite").setAttribute("aria-current", which==="invite"?"page":"false");
  if (which !== "test") quizActive = false;
}
const fmtTime = ms => new Date(ms).toLocaleString(LOC(), { weekday:"short", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
function fmtLeft(ms){
  if (ms <= 0) return L("sudah ditutup", "closed");
  const m = Math.ceil(ms/60000);
  if (m < 60) return L(`${m} menit lagi`, `${m} min left`);
  const h = Math.floor(m/60);
  if (h < 48) return L(`${h} jam ${m%60 ? (m%60)+" menit " : ""}lagi`, `${h} h ${m%60 ? (m%60)+" min " : ""}left`);
  return L(`${Math.floor(h/24)} hari lagi`, `${Math.floor(h/24)} days left`);
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
    <div class="char">${characterSVG(s, {title:L("Contoh karakter","Sample character")})}</div>
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

/* ---------- norma sampel ---------- */
// Diisi dari /api/stats. Label tingkat memakai norma (rata-rata ±0,5 SD) setelah sampel >= NORM_MIN_N.
let NORMS = null;
const normFor = k => normsReady(NORMS) ? NORMS[k] : null;
function levelBasisNote(){
  return normsReady(NORMS)
    ? L(`Tingkat rendah, sedang, dan tinggi dibandingkan dengan ${NORMS.n} peserta Gangsal: sedang berarti dalam setengah simpangan baku dari rata-rata.`,
        `Low, medium and high are relative to ${NORMS.n} Gangsal participants: medium means within half a standard deviation of the mean.`)
    : L(`Tingkat rendah, sedang, dan tinggi masih sementara (batas 35 dan 65) karena peserta belum mencapai ${NORM_MIN_N}. Setelah itu tingkat dihitung dari rata-rata peserta.`,
        `Low, medium and high are provisional (cut-offs 35 and 65) until there are ${NORM_MIN_N} participants. After that they are based on the participants' mean.`);
}
async function loadNorms(){
  try{
    const r = await fetch("/api/stats");
    if (!r.ok) return;
    const s = await r.json();
    const changed = JSON.stringify(s.norms) !== JSON.stringify(NORMS);
    NORMS = s.norms || null;
    if (changed && normsReady(NORMS) && /^\/h\//.test(location.pathname)) route();
  }catch(e){}
}

/* ---------- kartu karakter + OCEAN ---------- */
function oceanHTML(s){
  return `<dl class="ocean" aria-label="${L("Profil OCEAN","OCEAN profile")}">${OCEAN.map(o=>{ const v = o.from(s); return `
    <div title="${o.name} ${v}%"><dt style="color:var(--t-${DK[o.dim]})">${o.k}</dt><dd><span class="num">${v}%</span><i aria-hidden="true"><b style="width:${Math.max(v,3)}%;background:var(--d-${DK[o.dim]})"></b></i></dd></div>`; }).join("")}</dl>`;
}
const oceanLegend = () => `<p class="ocean-legend">${OCEAN.map(o=>`<span><b>${o.k}</b> ${o.name}</span>`).join("")}</p>
  <p class="ocean-legend">${L(`Angka adalah persen dari skor maksimum (POMP), bukan persentil. O memakai skala Intelek/Imajinasi IPIP; N = 100 dikurangi Stabilitas Emosi. <a href="/metode#ocean">Penjelasan</a>.`,
    `Numbers are percent of maximum possible score (POMP), not percentiles. O uses the IPIP Intellect/Imagination scale; N = 100 minus Emotional Stability. <a href="/metode#ocean">Details</a>.`)}</p>`;
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
      <h1>${L("Kenali lima sisi kepribadianmu.", "Get to know the five sides of your personality.")}</h1>
      <p class="lede">${L("Jawab 50 pernyataan singkat. Kamu mendapat skor lima dimensi kepribadian Big Five dan karakter animasi yang bentuknya mengikuti skormu.",
        "Answer 50 short statements. You get a score on each of the five Big Five dimensions and an animated character shaped by your scores.")}</p>
      <div class="facts">
        <span><b class="num">50</b> ${L("pernyataan","statements")}</span><span><b class="num">8</b> ${L("menit","minutes")}</span>
        <span class="live" aria-live="polite"><b class="num" id="liveCount">${liveTotal === null ? "..." : fmtNum(liveTotal)}</b> <span id="liveWord">${peopleWord(liveTotal)}</span> <a href="#rekap">${L("lihat rekapnya","see the recap")}</a></span>
      </div>
      <div class="row">
        <button class="btn primary" id="start" type="button">${n ? L(`Lanjutkan, sudah ${n} dari ${TOTAL}`, `Continue, ${n} of ${TOTAL} done`) : L("Mulai tes","Start the test")}</button>
        ${n ? `<button class="btn" id="restart" type="button">${L("Mulai dari awal","Start over")}</button>` : `<button class="btn link" id="toTeams" type="button">${L("Untuk tim dan HR","For teams and HR")}</button>`}
      </div>
      <p class="fineprint">${L("Gangsal artinya lima dalam bahasa Jawa. Tanpa akun; jawabanmu tersimpan di perangkat ini.", "Gangsal means five in Javanese. No account; your answers stay on this device.")}</p>
    </div>
    <div class="home-art">${pentaFrame(SAMPLE)}</div>
  </section>
  <section class="hrecap" id="rekap" aria-labelledby="recapTitle" tabindex="-1">
    <div class="hrecap-head">
      <h2 id="recapTitle">${L("Rekap peserta","Participant recap")}</h2>
      <span class="hint">${L("Diperbarui otomatis setiap 30 detik","Updates every 30 seconds")}</span>
    </div>
    <div id="recapBody"></div>
  </section>
  <section class="catalog" aria-labelledby="catTitle">
    <div class="catalog-head">
      <div class="cat-title-row">
        <h2 id="catTitle">${L("Karakter","Characters")}</h2>
        <div class="seg" role="group" aria-label="${L("Pilih daftar karakter","Choose a character list")}">
          <button type="button" class="seg-btn" data-tab="peserta" aria-pressed="false">${L("Karakter peserta","Participants")}</button>
          <button type="button" class="seg-btn" data-tab="semua" aria-pressed="false">${L("Semua karakter","All characters")}</button>
        </div>
      </div>
      <p class="note" style="margin-top:0" id="catNote"></p>
      ${oceanLegend()}
    </div>
    <ul class="plist collapsed" id="catList"></ul>
    <div class="cat-more"><button class="btn" type="button" id="catMore" aria-controls="catList" aria-expanded="false"></button></div>
  </section>
  <section class="teams" aria-labelledby="teamsTitle">
    <div class="teams-copy">
      <h2 id="teamsTitle">${L("Untuk tim dan calon karyawan.","For teams and job candidates.")}</h2>
      <p>${L("Buat kode undangan, bagikan, lalu lihat nama dan hasil setiap peserta di satu halaman. Nama dienkripsi; hanya kamu yang bisa membacanya.",
        "Create an invitation code, share it, and see every participant's name and result on one page. Names are encrypted; only you can read them.")}</p>
      <div class="row"><button class="btn primary" id="toInvite" type="button">${L("Buat undangan","Create an invitation")}</button></div>
    </div>
    <form class="joincode" id="joinForm" novalidate>
      <label for="joinCode">${L("Punya kode undangan?","Have an invitation code?")}</label>
      <div class="row">
        <input id="joinCode" name="joinCode" inputmode="text" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="9" placeholder="${L("contoh","e.g.")}: k7m2x9pq">
        <button class="btn" type="submit">${L("Buka","Open")}</button>
      </div>
      <p class="field-error" id="joinErr" role="alert" hidden></p>
    </form>
  </section>`;
  $("#toInvite").onclick = ()=>nav("/undang");
  $("#catMore").onclick = ()=>{
    catOpen = !catOpen; renderCatalog();
    if (!catOpen) $("#catTitle").scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
  };
  document.querySelectorAll(".seg-btn").forEach(b=>b.onclick = ()=>{ catTab = b.dataset.tab; catOpen = false; renderCatalog(); });
  renderHomeRecap();
  if ($("#toTeams")) $("#toTeams").onclick = ()=>{ $(".teams").scrollIntoView({behavior: reduceMotion() ? "auto" : "smooth", block:"start"}); $("#teamsTitle").setAttribute("tabindex","-1"); $("#teamsTitle").focus({preventScroll:true}); };
  refreshLive();
  $("#joinForm").onsubmit = e=>{
    e.preventDefault();
    const c = $("#joinCode").value.trim().toLowerCase().replace(/[\s-]/g, "");
    if (!/^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/.test(c)){
      const er = $("#joinErr"); er.hidden = false; er.textContent = L("Kode undangan terdiri dari 8 huruf dan angka. Periksa lagi kodenya.", "An invitation code has 8 letters and digits. Check the code again.");
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
  setNav("test"); setTitle(L(`Pernyataan ${qi+1} dari ${TOTAL}`, `Statement ${qi+1} of ${TOTAL}`));
  quizActive = true;
  // tombol donasi disembunyikan selama tes agar layar fokus (seperti Riuh saat soal berjalan)
  document.body.classList.add("in-quiz");
  if (!$("#donatePanel").hidden) setDonate(false);
  clearTimeout(advanceTimer);
  const text = ITEM_TXT[qi];
  const done = answeredCount();
  const cur = answers[qi];
  $("#view").innerHTML = `
  <section class="quiz">
    <div class="quiz-top">
      ${mode ? `<p class="quiz-invite" title="${esc(`${mode.title ? mode.title+", " : ""}${L("atas nama","as")} ${mode.name}`)}">${mode.title ? `<b>${esc(mode.title)}</b>, ` : L("Undangan, ","Invitation, ")}${L("atas nama","as")} <b>${esc(mode.name)}</b></p>` : ""}
      <div class="quiz-meta"><span>${L("Pernyataan","Statement")} <b class="num">${qi+1}</b> ${L("dari","of")} ${TOTAL}</span><span class="saved num">${done} ${L("terjawab","answered")}</span></div>
      <div class="track" role="progressbar" aria-label="${L("Kemajuan tes","Test progress")}" aria-valuemin="0" aria-valuemax="${TOTAL}" aria-valuenow="${done}"><i style="width:${done/TOTAL*100}%"></i></div>
    </div>
    <div>
      <p class="ask${qi===0 ? "" : " repeat"}">${qi===0 ? L("Gambarkan dirimu seperti biasanya sekarang, bukan seperti yang kamu inginkan. Seberapa sesuai pernyataan ini?", "Describe yourself as you generally are now, not as you wish to be. How accurately does this describe you?") : L("Seberapa sesuai pernyataan ini dengan dirimu?", "How accurately does this describe you?")}</p>
      <p class="statement" id="statement" tabindex="-1">${esc(text)}</p>
    </div>
    <div class="answers" role="radiogroup" aria-labelledby="statement">
      ${SCALE.map((_,j)=>`<button type="button" class="ans" role="radio" aria-checked="${cur===j+1}" data-v="${j+1}">
        <span class="key" aria-hidden="true">${j+1}</span><span>${answerTxt()[j]}</span><span class="mark" aria-hidden="true"></span></button>`).join("")}
    </div>
    <div class="quiz-nav">
      <button class="btn" type="button" id="prev">${qi===0 ? (mode ? L("Ganti nama","Change name") : L("Kembali ke beranda","Back to home")) : L("Sebelumnya","Previous")}</button>
      <span class="keys-hint">${L("Bisa juga tekan angka 1 sampai 5","You can also press 1 to 5")}</span>
      ${cur!==null && qi<TOTAL-1 ? `<button class="btn primary" type="button" id="next">${L("Berikutnya","Next")}</button>` : ""}
      ${cur!==null && qi===TOTAL-1 ? `<button class="btn primary" type="button" id="finish">${mode ? L("Kirim dan lihat hasil","Submit and see results") : L("Lihat hasil","See results")}</button>` : ""}
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
    $("#view").innerHTML = `<section class="quiz"><p class="statement">${L("Mengirim hasilmu ke pembuat undangan...","Sending your result to the organiser...")}</p></section>`;
    const inv = mode;
    let outcome;
    try{
      const name = await sealName(inv.name, inv.pub);
      const res = await fetch(`/api/invites/${inv.code}/results`, {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({cid:clientId(), answers:sent, name, consent: CONSENT_VERSION})});
      outcome = res.ok ? "ok" : res.status===410 ? "expired" : res.status===409 ? ((await res.json().catch(()=>({}))).error==="already" ? "already" : "full")
        : res.status===429 ? "limited" : "error";
    }catch(e){ outcome = "network"; }
    finishing = false;
    const MSG = {
      ok: ["ok", L(`Hasilmu sudah terkirim ke pembuat undangan${inv.title ? ` "${inv.title}"` : ""} atas nama ${inv.name}, dan ikut rekap umum tanpa nama.`,
        `Your result was sent to the organiser${inv.title ? ` of "${inv.title}"` : ""} as ${inv.name}, and added to the public recap without your name.`)],
      expired: ["warn", L("Batas waktu undangan sudah lewat, jadi hasilmu tidak terkirim. Hasil di bawah tetap milikmu.", "The invitation has closed, so your result was not sent. The result below is still yours.")],
      already: ["warn", L("Perangkat ini sudah pernah mengirim hasil untuk undangan ini, jadi hasil baru tidak dikirim.", "This device already sent a result for this invitation, so the new one was not sent.")],
      full: ["warn", L("Kuota peserta undangan ini sudah penuh, jadi hasilmu tidak terkirim.", "This invitation is full, so your result was not sent.")],
      limited: ["warn", L("Terlalu banyak percobaan dari jaringan ini. Hasilmu belum terkirim; coba kirim lagi nanti dari perangkat ini.", "Too many attempts from this network. Your result was not sent yet; try again later from this device.")],
      error: ["warn", L("Hasilmu tidak terkirim karena ada kesalahan di server.", "Your result was not sent because of a server error.")],
      network: ["warn", L("Hasilmu belum terkirim karena koneksi terputus. Periksa internet lalu tekan Kirim lagi.", "Your result was not sent because the connection dropped. Check your internet and press Submit again.")],
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
  saveState = {state:"saving", msg:L("Menyimpan hasil ke rekap...","Saving your result to the recap...")}; updateSaveStatus();
  try{
    const res = await fetch("/api/results", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({cid:clientId(), answers:ans})});
    if (res.ok){ saveState = {state:"ok", msg:L("Hasilmu masuk rekap peserta tanpa nama. Tes ulang dari perangkat ini akan menimpa hasil lama.", "Your result was added to the recap without your name. Retaking the test on this device replaces it.")}; recap = null; }
    else if (res.status===429) saveState = {state:"warn", msg:L("Hasil tidak masuk rekap karena terlalu banyak percobaan dari jaringan ini. Coba lagi satu jam lagi.", "Your result was not added to the recap because of too many attempts from this network. Try again in an hour.")};
    else saveState = {state:"warn", msg:L("Hasil tidak masuk rekap. Hasilmu di halaman ini tetap berlaku.", "Your result was not added to the recap. The result on this page is still valid.")};
  }catch(e){ saveState = {state:"warn", msg:L("Hasil belum masuk rekap karena koneksi terputus. Hasilmu di halaman ini tetap berlaku.", "Your result was not added to the recap because the connection dropped. The result on this page is still valid.")}; }
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
  const join = a => a.length<2 ? a.join("") : a.slice(0,-1).join(", ")+L(" dan "," and ")+a[a.length-1];
  if (!hi.length && !lo.length) return L("Kelima sisimu berada di tengah. Kamu luwes dan mudah menyesuaikan diri dengan banyak situasi.",
    "All five of your sides sit in the middle. You are flexible and adapt easily to many situations.");
  const all = [...hi, ...lo];
  if (lang === "en") return `You tend to be ${join(all)}. This character's shape and movement are built from your five scores.`;
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
      <p class="who">${mine ? L("Karaktermu adalah","Your character is") : L("Seseorang membagikan karakternya","Someone shared their character")}</p>
      <h1>${name}</h1>
      <p class="lede">${summary(s)}</p>
      <p class="status" id="saveStatus" role="status" hidden></p>
      <div class="row">
        <button class="btn primary" id="shareBtn" type="button">${L("Bagikan karakter","Share character")}</button>
        <button class="btn" id="saveImg" type="button">${L("Unduh gambar","Download image")}</button>
      </div>
      <p class="status" id="shareStatus" role="status"></p>
      <textarea id="shareFallback" readonly hidden rows="3" aria-label="${L("Tautan untuk disalin","Link to copy")}"></textarea>
      ${mine ? "" : `<div><button class="btn" id="tryIt" type="button">${L("Ikut tes dan buat karaktermu","Take the test and get your character")}</button></div>`}
    </div>
  </section>
  <section class="profile" aria-labelledby="profileTitle">
    <div>
      <h2 id="profileTitle" style="margin-bottom:12px">${L("Skor lima sisi","Your five scores")}</h2>
      ${radar(s, L("Skor ","Scores: ")+name)}
    </div>
    <div class="readings">
      ${DIMS.map(d=>{ const v = s[d.key], lv = level(v, normFor(d.key)); return `
      <article class="reading">
        <span class="score num" style="color:var(--t-${DK[d.key]})">${v}</span>
        <h3>${d.name} <small>${levelName(lv, lang)}</small></h3>
        <p>${TEXT[d.key][lv]}</p>
      </article>`; }).join("")}
      <p class="note">${L("Skor 0 sampai 100 adalah persen dari skor maksimum yang mungkin (POMP), dihitung dari jawabanmu sendiri; bukan persentil.", "Scores from 0 to 100 are the percent of maximum possible score (POMP), calculated from your own answers; they are not percentiles.")} ${levelBasisNote()} ${L("Tidak ada skor yang lebih baik; tiap ujung punya kelebihannya.", "No score is better than another; each end has its strengths.")} <a href="/metode">${L("Cara penghitungan dan rujukan","How it is calculated, with references")}</a>.</p>
      ${mine ? `<div class="row" style="margin-top:20px"><button class="btn" id="again" type="button">${L("Ulangi tes","Retake the test")}</button></div>` : ""}
    </div>
  </section>`;
  if (mine) updateSaveStatus();
  const url = location.origin + "/h/" + code + langQ();
  const text = L(`Karakter kepribadianku: ${name}. `, `My personality character: ${name}. `) + DIMS.map(d=>`${d.short} ${s[d.key]}`).join(", ") + L(". Buat karaktermu:", ". Get yours:");
  const st = $("#shareStatus");
  const copy = (str, okMsg)=> (navigator.clipboard ? navigator.clipboard.writeText(str) : Promise.reject())
    .then(()=>{ st.className="status ok"; st.textContent=okMsg; $("#shareFallback").hidden = true; })
    .catch(()=>{ const f=$("#shareFallback"); f.hidden=false; f.value=str; f.focus(); f.select(); st.className="status"; st.textContent=L("Salin teks di bawah ini: tekan Ctrl+C, atau tahan lalu pilih Salin.", "Copy the text below: press Ctrl+C, or press and hold, then choose Copy."); });
  $("#shareBtn").onclick = ()=>{
    if (navigator.share) navigator.share({title:name, text, url}).catch(()=>{});
    else copy(text+" "+url, L("Teks dan tautan sudah disalin. Tempel di media sosialmu.", "Text and link copied. Paste them into your social media."));
  };
  $("#saveImg").onclick = async ()=>{
    try{
      const blob = await renderCard(s, name);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `gangsal-${code}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
      st.className="status ok"; st.textContent=L("Gambar sudah diunduh.","Image downloaded.");
    }catch(e){ st.className="status warn"; st.textContent=L("Gambar gagal dibuat di peramban ini. Coba peramban lain.","This browser could not create the image. Try another browser."); }
  };
  if ($("#tryIt")) $("#tryIt").onclick = ()=>{ resetTest(); nav("/#tes"); };
  if ($("#again")) $("#again").onclick = ()=>{ resetTest(); nav("/#tes"); };
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
  g.fillText(L(`Tes Big Five Gangsal, ${location.host}`, `Gangsal Big Five test, ${location.host}`), W/2, H-48);
  return new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error("toBlob")),"image/png"));
}
function rr(g,x,y,w,h,r){ g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }

/* ---------- rekap dan total live ---------- */
// Satu sumber data untuk total pengguna di beranda, norma, dan halaman rekap. Diperbarui otomatis.
let liveTotal = null;
const fmtNum = n => Number(n).toLocaleString(LOC());
let loadingStats = false;
async function loadRecap(){
  if (loadingStats) return;
  loadingStats = true;
  const ctl = new AbortController(); const timer = setTimeout(()=>ctl.abort(), 10000);
  try{
    const res = await fetch("/api/stats", { signal: ctl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    recap = await res.json(); recapErr = null;
    if (recap.norms) NORMS = recap.norms;
    liveTotal = recap.total;
  }catch(e){ if (recap === null) recapErr = "load"; }
  finally{ clearTimeout(timer); loadingStats = false; }
  const el = $("#liveCount"); if (el && liveTotal !== null){ el.textContent = fmtNum(liveTotal); $("#liveWord").textContent = peopleWord(liveTotal); }
  renderHomeRecap();
}
const refreshLive = loadRecap;
const onLivePage = () => location.pathname === "/" && (location.hash === "" || location.hash === "#rekap");
setInterval(()=>{ if (!document.hidden && onLivePage()) loadRecap(); }, 30_000);
document.addEventListener("visibilitychange", ()=>{ if (!document.hidden && onLivePage()) loadRecap(); });

/* rekap di beranda: tidak ada halaman terpisah; bagian #rekap diisi ulang setiap data baru masuk */
const LV = [["rendah","var(--soft)","var(--muted)"],["sedang","var(--line)","var(--ink)"],["tinggi","var(--ink)","var(--primary-ink)"]];
let catTab = null, catOpen = false;
function renderHomeRecap(){
  const box = $("#recapBody"); if (!box) return;
  // Data sama dengan yang sudah tampil: jangan gambar ulang (animasi dan posisi geser tidak terulang).
  const key = JSON.stringify([recap, recapErr, lang]);
  if (box.childElementCount && box.dataset.key === key) return;
  box.dataset.key = key;
  if (recapErr && recap === null) box.innerHTML = `<div class="empty">${L("Rekap belum bisa dimuat. Halaman ini akan mencoba lagi otomatis.","The recap could not be loaded yet. This page will retry on its own.")}</div>`;
  else if (recap === null) box.innerHTML = `<div class="empty">${L("Memuat rekap peserta...","Loading the recap...")}</div>`;
  else if (!recap.total) box.innerHTML = `<div class="empty">${L("Belum ada peserta. Jadilah yang pertama, lalu hasilmu akan muncul di sini.","No participants yet. Be the first, and your result will show up here.")}</div>`;
  else {
    const n = recap.total;
    box.innerHTML = `
    <div class="hrecap-grid">
      <div class="hrecap-avg">
        <div class="stage">${characterSVG(recap.avg, {title:L("Karakter rata-rata peserta","Average participant character")})}</div>
        <div>
          <p class="who">${L("Semua peserta digabung jadi satu karakter:","All participants combined into one character:")}</p>
          <p class="hrecap-name">${esc(persona(recap.avg))}</p>
          <p class="hrecap-count"><b class="num">${fmtNum(n)}</b> ${pt(n)}</p>
        </div>
      </div>
      <div>
        <div class="levels compact">${DIMS.map(d=>{ const b = recap.levels[d.key]; return `
          <div class="lv-row"><span class="lv-label"><b>${d.name}</b><span>${L("rata-rata","average")} <b class="num">${recap.avg[d.key]}</b></span></span>
            <div class="lv-bar" role="img" aria-label="${d.name}: ${L("rata-rata","average")} ${recap.avg[d.key]}; ${L(`rendah ${b.rendah} orang, sedang ${b.sedang} orang, tinggi ${b.tinggi} orang`, `low ${b.rendah}, medium ${b.sedang}, high ${b.tinggi} people`)}">
              ${LV.map(([l,bg,fg])=>b[l]?`<i style="width:${b[l]/n*100}%;background:${bg};color:${fg}" title="${levelName(l, lang)} ${Math.round(b[l]/n*100)}%">${b[l]/n >= .2 ? Math.round(b[l]/n*100)+"%" : ""}</i>`:"").join("")}
            </div></div>`;}).join("")}
        </div>
        <div class="lv-legend" style="margin-top:12px">${LV.map(([l,bg])=>{ const t = levelName(l, lang); return `<span><i style="background:${bg};border:1px solid var(--line)"></i>${t[0].toUpperCase()+t.slice(1)}</span>`; }).join("")}</div>
        <p class="note">${levelBasisNote()} ${L("Satu hasil per perangkat.","One result per device.")}</p>
      </div>
    </div>`;
  }
  renderCatalog();
}
function renderCatalog(){
  const list = $("#catList"); if (!list) return;
  // Server mengirim kunci karakter; nama diterjemahkan di sini sesuai bahasa.
  const people = ((recap && recap.personas) || []).map(p=>({ ...p, name: (p.key && personaName(p.key, lang)) || p.name }));
  // Tab bawaan baru dikunci setelah data rekap tiba; sebelum itu tampilkan semua karakter.
  if (!catTab && recap) catTab = people.length ? "peserta" : "semua";
  if (catTab === "peserta" && !people.length) catTab = "semua";
  const items = (catTab || "semua") === "peserta"
    ? people.map(p=>personaCard(p, `<span class="pmeta"><b class="num">${p.n}</b> ${pt(p.n)}, ${Math.round(p.n/recap.total*100)}%</span>`))
    : basePersonas().map(p=>personaCard(p, `<span class="pmeta">${p.trait}</span>`));
  const x = list.scrollLeft;
  list.innerHTML = items.join("");
  list.scrollLeft = x;
  list.classList.toggle("collapsed", !catOpen);
  document.querySelectorAll(".seg-btn").forEach(b=>{
    b.setAttribute("aria-pressed", String(b.dataset.tab === (catTab || "semua")));
    if (b.dataset.tab === "peserta"){ b.disabled = !people.length; b.textContent = (people.length ? L(`Karakter peserta (${people.length})`, `Participants (${people.length})`) : L("Karakter peserta","Participants")); }
  });
  $("#catNote").innerHTML = (catTab || "semua") === "peserta"
    ? L(`Diurutkan dari yang paling banyak. Persentase OCEAN adalah rata-rata peserta di karakter itu. Karakter adalah ilustrasi, bukan tipe kepribadian. <a href="/metode#karakter">Kenapa</a>.`,
        `Most common first. OCEAN percentages are the average of the participants with that character. Characters are illustrations, not personality types. <a href="/metode#karakter">Why</a>.`)
    : L(`Nama karakter diambil dari sifat yang paling menonjol, misalnya <i>Si Perancang yang Hangat</i>. Karakter adalah ilustrasi, bukan tipe kepribadian. <a href="/metode#karakter">Kenapa</a>.`,
        `A character is named after your most pronounced traits, for example <i>The Warm Planner</i>. Characters are illustrations, not personality types. <a href="/metode#karakter">Why</a>.`);
  const more = $("#catMore"), extra = items.length - 6;
  more.parentElement.hidden = extra <= 0;
  more.setAttribute("aria-expanded", String(catOpen));
  more.textContent = catOpen ? L("Tampilkan lebih sedikit","Show fewer") : L(`Lihat ${extra} karakter lainnya`, `Show ${extra} more characters`);
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
    <h2 id="myInvTitle">${L("Undangan yang kamu buat di perangkat ini","Invitations you created on this device")}</h2>
    <p class="hint">${L("Disimpan hanya di browser ini. Simpan juga link rekap di tempat lain bila ingin membukanya dari perangkat lain.","Stored only in this browser. Keep the recap link somewhere else too if you want to open it from another device.")}</p>
    <ul class="inv-list">${l.map(x=>`<li>
      <div class="inv-item-main"><b>${x.title ? esc(x.title) : L("Undangan tanpa judul","Untitled invitation")}</b>
        <span class="muted">${L("Kode","Code")} ${x.code} &middot; ${x.expiresAt ? (x.expiresAt > now ? L(`terbuka sampai ${fmtTime(x.expiresAt)}`, `open until ${fmtTime(x.expiresAt)}`) : L(`ditutup ${fmtTime(x.expiresAt)}`, `closed ${fmtTime(x.expiresAt)}`)) : ""}</span></div>
      <div class="row">
        <a class="btn primary" href="/r/${x.code}#${esc(x.admin)}">${L("Buka rekap","Open recap")}</a>
        ${x.tkey ? `<button class="btn" type="button" data-copy="${x.code}">${L("Salin link peserta","Copy participant link")}</button>` : ""}
        <button class="btn link" type="button" data-forget="${x.code}">${L("Hapus dari daftar","Remove from list")}</button>
      </div></li>`).join("")}</ul>
  </section>`;
}
function bindMyInvites(){
  document.querySelectorAll("[data-copy]").forEach(b=>{ const x = myInvites().find(i=>i.code===b.dataset.copy); if (x) copyBtn(b, joinUrl(x), L("Tersalin","Copied")); });
  document.querySelectorAll("[data-forget]").forEach(b=>b.onclick = ()=>{
    const code = b.dataset.forget;
    const li = b.closest("li");
    li.innerHTML = `<p>${L(`Hapus <b>${code}</b> dari daftar perangkat ini? Undangan dan datanya tetap ada di server, tapi tanpa link rekap kamu tidak bisa membukanya lagi.`, `Remove <b>${code}</b> from this device's list? The invitation and its data stay on the server, but without the recap link you cannot open it again.`)}</p>
      <div class="row"><button class="btn danger-btn" type="button" data-yes>${L("Hapus dari daftar","Remove from list")}</button><button class="btn link" type="button" data-no>${L("Batal","Cancel")}</button></div>`;
    li.querySelector("[data-no]").onclick = ()=>viewInviteCreate();
    li.querySelector("[data-yes]").onclick = ()=>{ forgetInvite(code); viewInviteCreate(); };
  });
}

/* ---------- undangan: buat ---------- */
const durationOpts = () => L([["1h","1 jam"],["1d","1 hari"],["7d","7 hari"],["30d","30 hari"]], [["1h","1 hour"],["1d","1 day"],["7d","7 days"],["30d","30 days"]]);
function copyBtn(btn, value, okText){
  btn.onclick = ()=>{
    const done = ()=>{ const t = btn.textContent; btn.textContent = okText; setTimeout(()=>btn.textContent = t, 1800); };
    (navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject()).then(done).catch(()=>{
      const inp = btn.parentElement.querySelector("input"); if (inp){ inp.focus(); inp.select(); }
    });
  };
}
function viewInviteCreate(){
  setNav("invite"); setTitle(L("Buat undangan","Create an invitation"));
  $("#view").innerHTML = `
  <section class="form-page">
    <h1>${L("Buat undangan tes","Create a test invitation")}</h1>
    <p class="lede">${L("Peserta yang memakai kode ini mengisi nama lalu mengerjakan tes. Kamu melihat nama dan hasil mereka di halaman rekap. Kamu tidak perlu daftar akun.",
      "Participants who use this code enter their name and take the test. You see their names and results on a recap page. No account needed.")}</p>
    <form id="invForm" class="form" novalidate>
      <div class="field">
        <label for="invTitle">${L("Judul undangan","Invitation title")} <span class="opt">${L("opsional","optional")}</span></label>
        <input id="invTitle" name="invTitle" maxlength="80" autocomplete="off" placeholder="${L("contoh: Rekrutmen Staf Keuangan, Mei","e.g. Finance staff hiring, May")}">
        <p class="hint">${L("Tampil ke peserta. Judul dienkripsi, jadi kami tidak bisa membacanya.","Shown to participants. The title is encrypted, so we cannot read it.")}</p>
      </div>
      <fieldset class="field">
        <legend>${L("Batas waktu pengisian","Time limit")}</legend>
        <p class="hint">${L("Dihitung sejak undangan dibuat. Setelah lewat, kode tidak bisa dipakai lagi.","Counted from when the invitation is created. After that, the code stops working.")}</p>
        <div class="choices">
          ${durationOpts().map(([v,l],i)=>`<label class="choice"><input type="radio" name="dur" id="dur-${v}" value="${v}" ${i===0?"checked":""}><span>${l}</span></label>`).join("")}
        </div>
      </fieldset>
      <div class="field">
        <label for="invMax">${L("Batas jumlah peserta","Participant limit")} <span class="opt">${L("opsional","optional")}</span></label>
        <input id="invMax" name="invMax" type="number" inputmode="numeric" min="1" max="500" placeholder="${L("tanpa batas","no limit")}">
        <p class="field-error" id="invMaxErr" role="alert" hidden></p>
      </div>
      <div class="row"><button class="btn primary" id="invSubmit" type="submit">${L("Buat undangan","Create invitation")}</button></div>
      <p class="status warn" id="invStatus" role="alert" hidden></p>
    </form>
    ${myInvitesHTML()}
  </section>`;
  bindMyInvites();
  const max = $("#invMax"), maxErr = $("#invMaxErr");
  const checkMax = ()=>{
    const v = max.value.trim();
    const bad = v !== "" && !(Number.isInteger(+v) && +v >= 1 && +v <= 500);
    maxErr.hidden = !bad; maxErr.textContent = bad ? L("Isi angka 1 sampai 500, atau kosongkan untuk tanpa batas.","Enter a number from 1 to 500, or leave it empty for no limit.") : "";
    bad ? max.setAttribute("aria-invalid","true") : max.removeAttribute("aria-invalid");
    return !bad;
  };
  max.onblur = checkMax;
  max.oninput = ()=>{ maxErr.hidden = true; max.removeAttribute("aria-invalid"); };
  $("#invForm").onsubmit = async e=>{
    e.preventDefault();
    if (!checkMax()){ max.focus(); return; }
    const btn = $("#invSubmit"), st = $("#invStatus");
    btn.disabled = true; btn.textContent = L("Membuat undangan...","Creating invitation..."); st.hidden = true;
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
      if (!res.ok) throw new Error(res.status===429 ? L("Terlalu banyak undangan dibuat dari jaringan ini. Coba lagi satu jam lagi.","Too many invitations created from this network. Try again in an hour.") : L("Undangan gagal dibuat. Coba lagi.","The invitation could not be created. Try again."));
      const { code, expiresAt } = await res.json();
      viewInviteCreated({ code, expiresAt, title, keys, max: body.maxParticipants });
    }catch(err){
      btn.disabled = false; btn.textContent = L("Buat undangan","Create invitation");
      st.hidden = false; st.textContent = err instanceof TypeError ? L("Koneksi terputus. Periksa internet lalu coba lagi.","The connection dropped. Check your internet and try again.") : err.message;
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
    <h1>${L("Undangan siap dibagikan","Your invitation is ready")}</h1>
    <p class="lede">${title ? `"${esc(title)}". ` : ""}${L(`Bisa diisi sampai ${fmtTime(expiresAt)}${max ? `, maksimal ${max} peserta` : ""}.`, `Open until ${fmtTime(expiresAt)}${max ? `, up to ${max} participants` : ""}.`)}</p>
    <div class="codebox"><span>${L("Kode undangan","Invitation code")}</span><b class="code-big">${code}</b></div>
    <div class="field">
      <label for="pLink">${L("Link untuk peserta","Participant link")}</label>
      <div class="copyrow"><input id="pLink" readonly value="${esc(pLink)}"><button class="btn" type="button" id="cpP">${L("Salin","Copy")}</button></div>
      <p class="hint">${L("Peserta juga bisa mengetik kode di beranda, tapi judul undangan hanya tampil lewat link ini.","Participants can also type the code on the home page, but the title only shows through this link.")}</p>
    </div>
    <div class="secret">
      <h2>${L("Link rekap, khusus untukmu","Recap link, for you only")}</h2>
      <p>${L(`Hanya link ini yang bisa membuka nama peserta. Link sudah tersimpan di browser ini (lihat menu <b>Undang</b>), tapi simpan juga salinannya. <b>Kalau browser ini dibersihkan dan salinannya tidak ada, rekap tidak bisa dibuka lagi oleh siapa pun, termasuk kami.</b> Jangan bagikan ke peserta.`,
        `Only this link can show participant names. It is saved in this browser (see the <b>Invite</b> menu), but keep a copy as well. <b>If this browser is cleared and you have no copy, nobody can open the recap again, including us.</b> Do not share it with participants.`)}</p>
      <div class="copyrow"><input id="aLink" readonly value="${esc(aLink)}"><button class="btn" type="button" id="cpA">${L("Salin","Copy")}</button></div>
      <div class="row">
        <button class="btn" type="button" id="dlA">${L("Unduh sebagai file","Download as a file")}</button>
        <button class="btn primary" type="button" id="openA">${L("Buka rekap","Open recap")}</button>
      </div>
    </div>
  </section>`;
  copyBtn($("#cpP"), pLink, L("Tersalin","Copied"));
  copyBtn($("#cpA"), aLink, L("Tersalin","Copied"));
  $("#dlA").onclick = ()=>{
    const txt = L(`Gangsal - undangan ${code}\n${title ? "Judul: "+title+"\n" : ""}Batas waktu: ${fmtTime(expiresAt)}\n\nLink peserta:\n${pLink}\n\nLink rekap (RAHASIA, jangan dibagikan):\n${aLink}\n`,
      `Gangsal - invitation ${code}\n${title ? "Title: "+title+"\n" : ""}Open until: ${fmtTime(expiresAt)}\n\nParticipant link:\n${pLink}\n\nRecap link (SECRET, do not share):\n${aLink}\n`);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([txt], {type:"text/plain"})); a.download = L(`gangsal-undangan-${code}.txt`, `gangsal-invitation-${code}.txt`);
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
  setNav("test"); setTitle(L("Undangan tes","Test invitation")); quizActive = false;
  const titleKey = location.hash.slice(1);
  $("#view").innerHTML = `<section class="form-page"><p class="lede">${L("Memuat undangan...","Loading invitation...")}</p></section>`;
  let inv, title = null;
  try{
    if (joinCache.code === code){ inv = joinCache.inv; title = joinCache.title; }
    else {
      inv = await fetchInvite(code);
      if (inv && inv.title && /^[A-Za-z0-9_-]{16,40}$/.test(titleKey)){ try{ title = await decryptTitle(inv.title, titleKey); }catch(e){} }
      joinCache = { code, inv, title };
    }
  }catch(e){
    $("#view").innerHTML = `<section class="form-page"><h1>${L("Undangan belum bisa dimuat","The invitation could not be loaded")}</h1><p class="lede">${L("Periksa koneksi internet, lalu muat ulang halaman ini.","Check your internet connection, then reload this page.")}</p></section>`;
    return;
  }
  if (!inv){
    $("#view").innerHTML = `<section class="form-page"><h1>${L("Kode undangan tidak ditemukan","Invitation code not found")}</h1><p class="lede">${L(`Periksa lagi kode <b>${esc(code)}</b> dengan pembuat undangan. Undangan juga dihapus otomatis 90 hari setelah batas waktunya habis.`, `Check the code <b>${esc(code)}</b> with the organiser. Invitations are also deleted automatically 90 days after they close.`)}</p><div class="row"><button class="btn primary" id="home" type="button">${L("Ke beranda","Go to home")}</button></div></section>`;
    $("#home").onclick = ()=>nav("/");
    return;
  }
  const left = inv.expiresAt - Date.now();
  if (!inv.open){
    $("#view").innerHTML = `<section class="form-page"><h1>${L("Undangan sudah ditutup","This invitation is closed")}</h1>
      <p class="lede">${title ? `"${esc(title)}" ` : L("Undangan ini ","This invitation ")}${inv.full ? L("sudah mencapai batas jumlah peserta.","has reached its participant limit.") : L(`ditutup pada ${fmtTime(inv.expiresAt)}.`, `closed on ${fmtTime(inv.expiresAt)}.`)} ${L("Hubungi pembuat undangan bila kamu masih perlu mengisi.","Contact the organiser if you still need to take part.")}</p>
      <div class="row"><button class="btn" id="home" type="button">${L("Coba tes tanpa undangan","Take the test without an invitation")}</button></div></section>`;
    $("#home").onclick = ()=>nav("/");
    return;
  }
  const NAME_KEY = `gangsal-inv-name-${code}`;
  const done = lsGet(`gangsal-inv-done-${code}`);
  if (done){
    $("#view").innerHTML = `<section class="form-page join">
      <h1>${L("Hasilmu sudah terkirim","Your result has been sent")}</h1>
      <p class="lede">${L(`Perangkat ini sudah mengirim hasil untuk undangan ${title ? `"${esc(title)}"` : esc(code)}${lsGet(NAME_KEY) ? ` atas nama ${esc(lsGet(NAME_KEY))}` : ""}. Satu perangkat hanya bisa mengirim satu kali per undangan.`,
        `This device already sent a result for the invitation ${title ? `"${esc(title)}"` : esc(code)}${lsGet(NAME_KEY) ? ` as ${esc(lsGet(NAME_KEY))}` : ""}. Each device can send one result per invitation.`)}</p>
      <div class="row">${decode(done) ? `<button class="btn primary" id="seeMine" type="button">${L("Lihat hasilku","See my result")}</button>` : ""}<button class="btn" id="home" type="button">${L("Ke beranda","Go to home")}</button></div>
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
    <p class="join-ctx">${title ? `<b>${esc(title)}</b>` : L("Undangan tes kepribadian Big Five","Big Five personality test invitation")}<span>${L(`Terbuka ${fmtLeft(left)}, 50 pernyataan, sekitar 8 menit`, `Open, ${fmtLeft(left)}. 50 statements, about 8 minutes`)}</span></p>
    <form id="joinStart" class="form" novalidate>
      <div class="field">
        <label for="pName" class="join-q">${L("Siapa namamu?","What is your name?")}</label>
        <input id="pName" name="pName" class="join-input" maxlength="80" autocomplete="name" autocapitalize="words" enterkeyhint="go" value="${esc(savedName)}" placeholder="${L("Nama lengkap","Full name")}" required>
        <p class="field-error" id="pNameErr" role="alert" hidden></p>
      </div>
      <button class="btn primary join-go" type="submit">${L("Mulai tes","Start the test")}</button>
      <div class="hint consent-text">${L(`
        <p>Dengan menekan <b>Mulai tes</b>, kamu setuju:</p>
        <ul>
          <li>nama, jawaban, dan skormu dikirim ke pembuat undangan ini untuk keperluan yang ia sampaikan kepadamu;</li>
          <li>skormu juga ikut rekap umum Gangsal tanpa nama;</li>
          <li>data per peserta disimpan sampai 90 hari setelah batas waktu undangan, lalu dihapus otomatis.</li>
        </ul>
        <p>Namamu dienkripsi di perangkat ini; hanya pembuat undangan yang bisa membacanya. Kamu berhak meminta pembuat undangan menghapus datamu kapan saja. Hasil tes sebaiknya tidak menjadi satu-satunya dasar keputusan tentang dirimu. <a href="/metode">Metode dan rujukan</a>.</p>`, `
        <p>By pressing <b>Start the test</b>, you agree that:</p>
        <ul>
          <li>your name, answers and scores are sent to the organiser of this invitation, for the purpose they told you about;</li>
          <li>your scores are also added to the public Gangsal recap without your name;</li>
          <li>per-participant data is kept until 90 days after the invitation closes, then deleted automatically.</li>
        </ul>
        <p>Your name is encrypted on this device; only the organiser can read it. You can ask the organiser to delete your data at any time. Test results should not be the only basis for decisions about you. <a href="/metode">Method and references</a>.</p>`)}
      </div>
    </form>
  </section>`;
  const nm = $("#pName"), nmErr = $("#pNameErr");
  const checkName = ()=>{
    const v = nm.value.trim(); const bad = v.length < 2;
    nmErr.hidden = !bad; nmErr.textContent = bad ? L("Isi nama lengkapmu, minimal 2 huruf.","Enter your full name, at least 2 letters.") : "";
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
const cardLabel = () => L({ E:"Ekstra", A:"Ramah", C:"Hati-hati", S:"Stabil", I:"Imaji" }, { E:"Extra", A:"Agree", C:"Consc", S:"Stable", I:"Imag" });
function csvCell(v){ const s = String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
let recapTimer = null;
let recapSort = { code: null, key: "at", dir: 1 };
async function viewInviteRecap(code, opts = {}){
  clearInterval(recapTimer);
  setNav("invite"); setTitle(L("Rekap undangan","Invitation recap")); quizActive = false;
  const keys = parseAdminFragment(location.hash);
  if (!keys){
    $("#view").innerHTML = `<section class="form-page"><h1>${L("Link rekap tidak lengkap","The recap link is incomplete")}</h1><p class="lede">${L("Buka link rekap lengkap yang kamu terima saat membuat undangan, termasuk bagian setelah tanda #. Tanpa bagian itu, nama peserta tidak bisa dibuka.","Open the full recap link you received when you created the invitation, including the part after the # sign. Without it, participant names cannot be read.")}</p></section>`;
    return;
  }
  const keepY = opts.silent ? scrollY : 0;
  if (!opts.silent) $("#view").innerHTML = `<section class="form-page"><p class="lede">${L("Memuat rekap...","Loading recap...")}</p></section>`;
  let data;
  try{
    const res = await fetch(`/api/invites/${code}/results`, { headers: { "X-Admin-Token": keys.adminToken }, cache: "no-store" });
    if (res.status === 404){ $("#view").innerHTML = `<section class="form-page"><h1>${L("Undangan tidak ditemukan","Invitation not found")}</h1><p class="lede">${L("Undangan ini sudah dihapus, atau sudah lewat 90 hari setelah batas waktunya sehingga datanya dihapus otomatis.","This invitation was deleted, or more than 90 days have passed since it closed, so its data was deleted automatically.")}</p></section>`; return; }
    if (res.status === 403){ $("#view").innerHTML = `<section class="form-page"><h1>${L("Link rekap tidak cocok","The recap link does not match")}</h1><p class="lede">${L(`Link ini bukan link rekap untuk undangan ${esc(code)}. Periksa apakah link tersalin utuh.`, `This is not the recap link for invitation ${esc(code)}. Check that the whole link was copied.`)}</p></section>`; return; }
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
  }catch(e){
    if (opts.silent){ const s = document.querySelector(".refresh-row .hint"); if (s) s.textContent = L("Gagal memperbarui. Periksa koneksi; data di bawah adalah data terakhir.","Could not update. Check your connection; the data below is the latest loaded."); return; }
    $("#view").innerHTML = `<section class="form-page"><h1>${L("Rekap belum bisa dimuat","The recap could not be loaded")}</h1><p class="lede">${L("Periksa koneksi internet, lalu muat ulang halaman ini.","Check your internet connection, then reload this page.")}</p></section>`;
    return;
  }
  let title = null;
  if (data.invite.title){ try{ title = await decryptTitle(data.invite.title, keys.titleKey); }catch(e){} }
  // ingat undangan ini di perangkat pembuat (misalnya bila link dibuka dari file atau pesan)
  rememberInvite({ code, title, expiresAt: data.invite.expiresAt, admin: location.hash.slice(1), tkey: keys.titleKey });
  const rows = [];
  for (const r of data.rows){
    let name; try{ name = await openName(r.name, keys.priv); }catch(e){ name = null; }
    rows.push({ id: r.id, name, scores: r.scores, at: r.at, persona: persona(r.scores) });
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
    const th = (k, label)=>`<th scope="col" aria-sort="${sortKey===k ? (sortDir>0?"ascending":"descending") : "none"}"><button type="button" class="sort" data-k="${k}">${label}${sortKey===k ? (sortDir>0?L(" (naik)"," (ascending)"):L(" (turun)"," (descending)")) : ""}</button></th>`;
    $("#tableWrap").innerHTML = n ? `<table class="rtable">
      <thead><tr>${th("name",L("Nama","Name"))}${DIMS.map(d=>th(d.key, d.short)).join("")}<th scope="col">${L("Karakter","Character")}</th>${th("at",L("Waktu","Time"))}<th scope="col"><span class="sr-only">${L("Hapus","Delete")}</span></th></tr></thead>
      <tbody>${sorted.map(r=>`<tr>
        <th scope="row">${r.name===null ? `<span class="muted">${L("Nama tidak terbaca","Name unreadable")}</span>` : esc(r.name)}</th>
        ${DIMS.map(d=>{ const v = r.scores[d.key]; return `<td class="num sc" data-label="${cardLabel()[d.key]}" title="${d.name} ${v}"><span class="cell-score lv-${level(v, normFor(d.key))}">${v}</span></td>`; }).join("")}
        <td class="persona" data-label="${L("Karakter","Character")}"><a href="/h/${encode(r.scores)}" target="_blank" rel="noopener">${esc(r.persona)}</a></td>
        <td class="num muted when" data-label="${L("Waktu","Time")}">${fmtTime(r.at)}</td>
        <td class="rowdel"><button class="btn link" type="button" data-del="${r.id}" data-name="${esc(r.name ?? L("peserta ini","this participant"))}">${L("Hapus data","Delete data")}</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">${L("Belum ada peserta yang mengirim hasil. Bagikan link peserta di atas.","No participant has sent a result yet. Share the participant link above.")}</div>`;
    document.querySelectorAll(".sort").forEach(b=>b.onclick = ()=>{ const k = b.dataset.k; sortDir = sortKey===k ? -sortDir : (k==="name"||k==="at" ? 1 : -1); sortKey = k; recapSort = { code, key: sortKey, dir: sortDir }; render(); });
    if ($("#sortSel")) $("#sortSel").value = ["name","at",...DIMS.map(d=>d.key)].includes(sortKey) ? sortKey : "at";
    // Hapus data satu peserta (misalnya atas permintaan peserta itu).
    document.querySelectorAll("[data-del]").forEach(b=>b.onclick = ()=>{
      const cell = b.parentElement, id = b.dataset.del, who = b.dataset.name;
      clearInterval(recapTimer);
      cell.innerHTML = `<div class="rowdel-confirm" role="group" aria-label="${L("Konfirmasi hapus","Confirm deletion")}">
        <span>${L(`Hapus nama dan hasil <b>${esc(who)}</b> secara permanen?`, `Permanently delete the name and result of <b>${esc(who)}</b>?`)}</span>
        <button class="btn danger-btn" type="button" data-yes>${L("Hapus","Delete")}</button>
        <button class="btn link" type="button" data-no>${L("Batal","Cancel")}</button></div>`;
      cell.querySelector("[data-no]").onclick = ()=>viewInviteRecap(code, { silent: true });
      cell.querySelector("[data-yes]").onclick = async ()=>{
        try{
          const res = await fetch(`/api/invites/${code}/results/${id}`, { method:"DELETE", headers: { "X-Admin-Token": keys.adminToken } });
          if (!res.ok) throw new Error();
          viewInviteRecap(code, { silent: true });
        }catch(e){ cell.querySelector("span").textContent = L("Gagal menghapus. Periksa koneksi lalu coba lagi.","Could not delete. Check your connection and try again."); }
      };
      cell.querySelector("[data-yes]").focus();
    });
  };
  $("#view").innerHTML = `
  <section class="recap-inv">
    <p class="who">${L("Rekap undangan","Invitation recap")} ${esc(code)}</p>
    <h1>${title ? esc(title) : L("Undangan tanpa judul","Untitled invitation")}</h1>
    <div class="inv-meta">
      <span class="pill ${inv.open ? "open" : "closed"}">${inv.open ? L("Terbuka","Open") : L("Ditutup","Closed")}</span>
      <span>${inv.open ? L(`Sampai ${fmtTime(inv.expiresAt)}, ${fmtLeft(inv.expiresAt-now)}`, `Until ${fmtTime(inv.expiresAt)}, ${fmtLeft(inv.expiresAt-now)}`) : L(`Ditutup ${inv.full ? "karena kuota penuh" : fmtTime(inv.expiresAt)}`, `Closed ${inv.full ? "because it is full" : fmtTime(inv.expiresAt)}`)}</span>
      <span><b class="num">${n}</b>${inv.maxParticipants ? L(` dari ${inv.maxParticipants}`, ` of ${inv.maxParticipants}`) : ""} ${pt(inv.maxParticipants || n)}</span>
    </div>
    <div class="row refresh-row">
      <button class="btn" type="button" id="reloadRecap">${L("Muat ulang","Reload")}</button>
      <span class="hint" role="status">${L("Diperbarui pukul","Updated at")} ${new Date().toLocaleTimeString(LOC(),{hour:"2-digit",minute:"2-digit"})}${inv.open ? L(". Halaman ini memperbarui diri setiap 30 detik.",". This page updates every 30 seconds.") : "."}</span>
    </div>
    ${inv.open ? `<div class="field" style="margin-top:20px"><label for="pLink2">${L("Link untuk peserta","Participant link")}</label><div class="copyrow"><input id="pLink2" readonly value="${esc(pLink)}"><button class="btn" type="button" id="cpP2">${L("Salin","Copy")}</button></div></div>` : ""}
    <p class="hint" style="margin-top:12px">${L(`Simpan halaman ini di bookmark. Data dihapus otomatis pada ${fmtTime(inv.expiresAt + 90*86400000)}.`, `Bookmark this page. Data is deleted automatically on ${fmtTime(inv.expiresAt + 90*86400000)}.`)}</p>
  </section>
  <section class="recap-table">
    <div class="row" style="justify-content:space-between;margin-bottom:12px"><h2>${L("Peserta","Participants")}</h2>${n ? `<button class="btn" type="button" id="csv">${L("Unduh CSV","Download CSV")}</button>` : ""}</div>
    ${n > 1 ? `<div class="sort-mobile"><label for="sortSel">${L("Urutkan","Sort by")}</label><select id="sortSel">
      <option value="at">${L("Waktu mengisi","Time submitted")}</option><option value="name">${L("Nama","Name")}</option>
      ${DIMS.map(d=>`<option value="${d.key}">${L(`${d.name} tertinggi`, `Highest ${d.name}`)}</option>`).join("")}</select></div>` : ""}
    <div class="table-scroll" id="tableWrap"></div>
    <p class="note">${L("Skor 0-100 adalah persen dari skor maksimum (POMP), bukan persentil.","Scores 0-100 are percent of maximum possible score (POMP), not percentiles.")} ${levelBasisNote()} ${L("Gunakan sebagai bahan percakapan, bukan satu-satunya dasar keputusan; untuk keputusan seleksi, libatkan psikolog.","Use them to start a conversation, not as the only basis for decisions; involve a psychologist for selection decisions.")} <a href="/metode">${L("Metode dan rujukan","Method and references")}</a>.</p>
  </section>
  ${n ? `<section class="profile inv-avg">
    <div><h2 style="margin-bottom:12px">${L(`Rata-rata ${n} peserta`, `Average of ${n} ${pt(n)}`)}</h2>${radar(avg, L("Rata-rata peserta undangan","Invitation participants' average"))}</div>
    <div class="result-copy" style="align-self:center"><div class="stage">${characterSVG(avg, {title:L("Karakter rata-rata","Average character")})}</div><p class="lede" style="text-align:center">${persona(avg)}</p></div>
  </section>
  <section class="catalog" aria-labelledby="ipTitle">
    <div class="catalog-head">
      <h2 id="ipTitle">${L("Karakter peserta undangan ini","Characters in this invitation")}</h2>
      ${oceanLegend()}
    </div>
    <ul class="plist">${groupByPersona(rows).map(p=>personaCard(p,
      `<span class="pmeta"><b class="num">${p.n}</b> ${pt(p.n)}, ${Math.round(p.n/n*100)}%</span>${p.members.length ? `<span class="pmembers">${p.members.map(esc).join(", ")}</span>` : ""}`)).join("")}</ul>
  </section>` : ""}
  <section class="danger">
    <h2>${L("Hapus undangan","Delete invitation")}</h2>
    <p>${L("Menghapus kode, semua nama, dan hasil per peserta untuk undangan ini secara permanen. Skor anonim di rekap umum tidak ikut terhapus.","Permanently deletes the code, all names and per-participant results for this invitation. Anonymous scores in the public recap are kept.")}</p>
    <div id="delArea"><button class="btn danger-btn" type="button" id="delStart">${L("Hapus undangan ini","Delete this invitation")}</button></div>
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
  if ($("#cpP2")) copyBtn($("#cpP2"), pLink, L("Tersalin","Copied"));
  if ($("#csv")) $("#csv").onclick = ()=>{
    const head = [L("Nama","Name"), ...DIMS.map(d=>d.name), L("Karakter","Character"), L("Waktu","Time")];
    const lines = [head, ...rows.map(r=>[r.name ?? "", ...DIMS.map(d=>r.scores[d.key]), r.persona, new Date(r.at).toISOString()])].map(l=>l.map(csvCell).join(","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿"+lines.join("\r\n")], {type:"text/csv"})); a.download = L(`gangsal-rekap-${code}.csv`, `gangsal-recap-${code}.csv`);
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
  };
  $("#delStart").onclick = ()=>{
    $("#delArea").innerHTML = `<div class="field"><label for="delConfirm">${L(`Ketik kode <b>${code}</b> untuk menghapus undangan beserta ${n} hasil peserta`, `Type the code <b>${code}</b> to delete the invitation and ${n} participant results`)}</label>
      <div class="copyrow"><input id="delConfirm" autocomplete="off" autocapitalize="none"><button class="btn danger-btn" type="button" id="delGo" disabled>${L("Hapus permanen","Delete permanently")}</button></div>
      <button class="btn link" type="button" id="delCancel">${L("Batal","Cancel")}</button><p class="status warn" id="delSt" role="alert" hidden></p></div>`;
    $("#delConfirm").focus();
    $("#delConfirm").oninput = ()=>{ $("#delGo").disabled = $("#delConfirm").value.trim().toLowerCase() !== code; };
    $("#delCancel").onclick = ()=>viewInviteRecap(code);
    $("#delGo").onclick = async ()=>{
      try{
        const res = await fetch(`/api/invites/${code}`, { method:"DELETE", headers: { "X-Admin-Token": keys.adminToken } });
        if (!res.ok) throw new Error();
        clearInterval(recapTimer);
        forgetInvite(code);
        $("#view").innerHTML = `<section class="form-page"><h1>${L(`Undangan ${esc(code)} sudah dihapus`, `Invitation ${esc(code)} has been deleted`)}</h1><p class="lede">${L("Kode tidak bisa dipakai lagi dan semua nama serta hasil per peserta sudah dihapus.","The code no longer works, and all names and per-participant results have been deleted.")}</p><div class="row"><button class="btn primary" id="newInv" type="button">${L("Buat undangan baru","Create a new invitation")}</button></div></section>`;
        $("#newInv").onclick = ()=>nav("/undang");
      }catch(e){ const s = $("#delSt"); s.hidden = false; s.textContent = L("Undangan gagal dihapus. Periksa koneksi lalu coba lagi.","The invitation could not be deleted. Check your connection and try again."); }
    };
  };
}

/* ---------- metode dan rujukan ---------- */
const REFS = `
      <ol class="refs">
        <li>Akhtar, H., &amp; Azwar, S. (2018). Development and validation of a short scale for measuring Big Five personality traits: The IPIP-BFM-25 Indonesia. <i>Journal of Innovation in Psychology, Education and Didactics, 22</i>(2), 167–174.</li>
        <li>Akhtar, H., &amp; Azwar, S. (2019). Indonesian adaptation and psychometric properties evaluation of the Big Five Personality Inventory: IPIP-BFM-50. <i>Jurnal Psikologi, 46</i>(1), 32–44. <a href="https://doi.org/10.22146/jpsi.33571" rel="noopener" target="_blank">https://doi.org/10.22146/jpsi.33571</a></li>
        <li>Goldberg, L. R. (1992). The development of markers for the Big-Five factor structure. <i>Psychological Assessment, 4</i>(1), 26–42. <a href="https://doi.org/10.1037/1040-3590.4.1.26" rel="noopener" target="_blank">https://doi.org/10.1037/1040-3590.4.1.26</a></li>
        <li>Goldberg, L. R., Johnson, J. A., Eber, H. W., Hogan, R., Ashton, M. C., Cloninger, C. R., &amp; Gough, H. G. (2006). The International Personality Item Pool and the future of public-domain personality measures. <i>Journal of Research in Personality, 40</i>(1), 84–96. <a href="https://doi.org/10.1016/j.jrp.2005.08.007" rel="noopener" target="_blank">https://doi.org/10.1016/j.jrp.2005.08.007</a></li>
        <li>International Personality Item Pool. Administering IPIP measures; Converting IPIP item responses to scale scores; Interpreting individual IPIP scale scores. <a href="https://ipip.ori.org" rel="noopener" target="_blank">https://ipip.ori.org</a></li>
        <li>Himpunan Psikologi Indonesia. (2010). <i>Kode Etik Psikologi Indonesia</i>. Pengurus Pusat HIMPSI. <a href="https://himpsi.or.id/kode-etik" rel="noopener" target="_blank">https://himpsi.or.id/kode-etik</a></li>
        <li>International Test Commission. (2017). <i>The ITC Guidelines for Translating and Adapting Tests</i> (2nd ed.). <a href="https://www.intestcom.org" rel="noopener" target="_blank">https://www.intestcom.org</a></li>
        <li>McCrae, R. R., &amp; John, O. P. (1992). An introduction to the five-factor model and its applications. <i>Journal of Personality, 60</i>(2), 175–215. <a href="https://doi.org/10.1111/j.1467-6494.1992.tb00970.x" rel="noopener" target="_blank">https://doi.org/10.1111/j.1467-6494.1992.tb00970.x</a></li>
        <li>Cohen, P., Cohen, J., Aiken, L. S., &amp; West, S. G. (1999). The problem of units and the circumstance for POMP. <i>Multivariate Behavioral Research, 34</i>(3), 315–346. <a href="https://doi.org/10.1207/S15327906MBR3403_2" rel="noopener" target="_blank">https://doi.org/10.1207/S15327906MBR3403_2</a></li>
        <li>Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi. Lembaran Negara Tahun 2022 Nomor 196. <a href="https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022" rel="noopener" target="_blank">https://peraturan.bpk.go.id/Details/229798/uu-no-27-tahun-2022</a></li>
      </ol>`;
function viewMethod(){
  setNav(""); setTitle(L("Metode dan rujukan","Method and references")); quizActive = false;
  const n = NORMS ? NORMS.n : null;
  $("#view").innerHTML = lang === "en" ? methodEN(n) : `
  <article class="method">
    <header class="stack" style="display:flex;flex-direction:column;gap:12px">
      <h1>Metode dan rujukan</h1>
      <p class="lede">Bagaimana Gangsal mengukur kepribadian, menghitung skor, dan menangani data, beserta sumbernya. Rujukan bertanda angka dalam kurung siku ada di bagian akhir.</p>
    </header>

    <section id="model">
      <h2>Yang diukur: lima faktor kepribadian</h2>
      <p>Gangsal memakai model lima faktor (Big Five): Ekstraversi, Keramahan, Kehati-hatian, Stabilitas Emosi, dan Intelek/Imajinasi. Model ini lahir dari pendekatan leksikal, yaitu analisis kata sifat yang dipakai orang untuk menggambarkan kepribadian <span class="cite">[3]</span>, dan merupakan model kepribadian yang paling banyak dipakai dalam penelitian <span class="cite">[8]</span>.</p>
    </section>

    <section id="butir">
      <h2>Pernyataan tes dan terjemahannya</h2>
      <p>Tes berisi 50 pernyataan dari <b>IPIP Big-Five Factor Markers</b> <span class="cite">[3][4]</span>. Butir IPIP berstatus public domain sehingga boleh dipakai dan diterjemahkan bebas <span class="cite">[5]</span>.</p>
      <p>Teks bahasa Indonesianya memakai <b>IPIP-BFM-50 Indonesia</b> hasil adaptasi Akhtar dan Azwar <span class="cite">[2]</span>, yang disusun mengikuti pedoman International Test Commission <span class="cite">[7]</span>. Pada 502 responden, reliabilitas (alpha) tiap skala: Ekstraversi 0,836; Keramahan 0,762; Kehati-hatian 0,811; Stabilitas Emosi 0,862; Intelek 0,768 <span class="cite">[2]</span>. Teks butir dipakai di bawah lisensi CC BY-SA 4.0. Satu perubahan kecil: butir I35 ditulis "Cepat dalam memahami sesuatu" mengikuti versi 2018 <span class="cite">[1]</span>, karena di artikel 2019 kalimatnya tampak terpotong.</p>
      <p>Batasan: sampel validasi berusia rata-rata sekitar 20,65 tahun <span class="cite">[1]</span>. Kode Etik Psikologi Indonesia meminta alat dipakai sesuai populasi saat validasi diuji, dan bila belum diuji, kekuatan serta kelemahannya dijelaskan <span class="cite">[6, Pasal 63 ayat 1]</span>. Untuk peserta yang jauh lebih tua, perlakukan hasil dengan lebih hati-hati.</p>
    </section>

    <section id="skor">
      <h2>Cara menghitung skor</h2>
      <ol>
        <li>Setiap jawaban diberi nilai 1 (Sangat tidak sesuai) sampai 5 (Sangat sesuai). Untuk pernyataan berkunci negatif, nilainya dibalik (1 jadi 5, dan seterusnya), lalu nilai 10 pernyataan tiap skala dijumlahkan, sesuai pedoman skoring IPIP <span class="cite">[5]</span>.</li>
        <li>Jumlah itu diubah ke skala 0 sampai 100 sebagai <b>persen dari skor maksimum yang mungkin (POMP)</b> <span class="cite">[9]</span>: 0 berarti selalu memilih ujung rendah, 100 selalu ujung tinggi. POMP bukan persentil; angka 70 tidak berarti "lebih tinggi dari 70% orang".</li>
      </ol>
    </section>

    <section id="tingkat">
      <h2>Label rendah, sedang, tinggi</h2>
      <p>IPIP menyarankan menghitung rata-rata dan simpangan baku dari sampel sendiri, lalu menganggap skor dalam setengah simpangan baku dari rata-rata sebagai "rata-rata" dan di luar itu sebagai rendah atau tinggi <span class="cite">[5]</span>. Gangsal memakai cara ini setelah peserta mencapai ${NORM_MIN_N} orang. Sebelum itu label memakai batas sementara 35 dan 65 dan selalu ditandai "sementara".</p>
      <p>Status saat ini: ${n === null ? "memuat data peserta..." : normsReady(NORMS) ? `norma aktif dari ${n} peserta.` : `${n} peserta, norma belum aktif.`}</p>
    </section>

    <section id="ocean">
      <h2>OCEAN</h2>
      <p>Daftar karakter menampilkan skor dalam urutan OCEAN. O memakai skala Intelek/Imajinasi dari IPIP, padanan terdekat Keterbukaan (Openness) pada model lima faktor <span class="cite">[3][8]</span>; keduanya tidak identik. N (Neurotisisme) adalah kutub kebalikan Stabilitas Emosi, sehingga dihitung 100 dikurangi skor Stabilitas Emosi.</p>
    </section>

    <section id="karakter">
      <h2>Karakter adalah ilustrasi, bukan tipe</h2>
      <p>Lima sifat Big Five adalah rentang, bukan kotak. IPIP secara tegas tidak menganjurkan memilah orang ke dalam kategori atau tipe berdasarkan skor <span class="cite">[5]</span>. Nama dan gambar karakter di Gangsal hanya ilustrasi supaya hasil mudah diingat: nama diambil dari satu atau dua sifat yang paling jauh dari titik tengah. Skor lengkap kelima dimensi selalu ditampilkan, dan skor itulah yang dipakai untuk memahami hasil.</p>
    </section>

    <section id="organisasi">
      <h2>Pemakaian oleh perusahaan dan HR</h2>
      <p>Gangsal adalah tes laporan diri (self-report), bukan pemeriksaan psikologis. Kode Etik Psikologi Indonesia menyatakan laporan hasil pemeriksaan psikologis beserta saran dan rekomendasinya hanya dapat dibuat oleh Psikolog <span class="cite">[6, Pasal 62 ayat 2]</span>, dan asesmen perlu dilakukan oleh pihak yang berkualifikasi <span class="cite">[6, Pasal 63 ayat 5]</span>. Karena itu:</p>
      <ul>
        <li>jangan jadikan hasil Gangsal satu-satunya dasar keputusan penerimaan, promosi, atau penilaian kerja;</li>
        <li>untuk keputusan seleksi, libatkan psikolog yang menafsirkan hasil bersama informasi lain;</li>
        <li>pertimbangkan bahasa, budaya, dan keadaan peserta saat menafsirkan hasil <span class="cite">[6, Pasal 65]</span>;</li>
        <li>peserta diminta persetujuannya sebelum mengerjakan tes <span class="cite">[6, Pasal 64]</span>.</li>
      </ul>
    </section>

    <section id="data">
      <h2>Data pribadi</h2>
      <p>Tes umum tidak meminta nama atau email; yang disimpan hanya jawaban anonim. Pada undangan, nama peserta adalah data pribadi menurut UU Nomor 27 Tahun 2022 <span class="cite">[10]</span>. Pembuat undangan menentukan tujuan pemakaian data, jadi ia bertanggung jawab sebagai pengendali data terhadap pesertanya.</p>
      <div class="tbl-scroll"><table>
        <thead><tr><th scope="col">Ketentuan UU PDP</th><th scope="col">Yang dilakukan Gangsal</th></tr></thead>
        <tbody>
          <tr><td>Pasal 22: persetujuan tertulis atau terekam</td><td>Peserta menyetujui teks persetujuan sebelum mulai; versi teks itu disimpan bersama hasilnya.</td></tr>
          <tr><td>Pasal 16 dan 27: pemrosesan terbatas, spesifik, dan transparan</td><td>Teks persetujuan menyebut data yang dikirim, penerimanya, dan lama penyimpanan. Data hanya nama, jawaban, dan skor.</td></tr>
          <tr><td>Pasal 8 dan 43: hak menghapus, kewajiban menghapus atas permintaan</td><td>Pembuat undangan bisa menghapus data satu peserta atau seluruh undangan dari halaman rekap.</td></tr>
          <tr><td>Pasal 43: menghapus data yang tidak lagi diperlukan</td><td>Data per peserta dihapus otomatis 90 hari setelah batas waktu undangan.</td></tr>
          <tr><td>Pasal 16: melindungi keamanan data</td><td>Nama dienkripsi di perangkat peserta dan hanya bisa dibuka dengan link rekap pembuat; pengelola Gangsal tidak bisa membacanya.</td></tr>
          <tr><td>Pasal 40 dan 45: menghentikan pemrosesan saat persetujuan ditarik, memberi tahu penghapusan</td><td>Menjadi tanggung jawab pembuat undangan: hapus data peserta yang menarik persetujuan, lalu beri tahu peserta itu.</td></tr>
        </tbody>
      </table></div>
    </section>

    <section id="rujukan">
      <h2>Rujukan</h2>
      ${REFS}
    </section>
  </article>`;
  if (location.hash.length > 1){ const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  if (NORMS === null) loadNorms().then(()=>{ if (location.pathname === "/metode") viewMethod(); });
}

function methodEN(n){
  return `
  <article class="method">
    <header class="stack" style="display:flex;flex-direction:column;gap:12px">
      <h1>Method and references</h1>
      <p class="lede">How Gangsal measures personality, calculates scores and handles data, with sources. Numbers in square brackets point to the references at the end.</p>
    </header>

    <section id="model">
      <h2>What is measured: five personality factors</h2>
      <p>Gangsal uses the five-factor model (Big Five): Extraversion, Agreeableness, Conscientiousness, Emotional Stability and Intellect/Imagination. The model comes from the lexical approach, the analysis of adjectives people use to describe personality <span class="cite">[3]</span>, and is the most widely used personality model in research <span class="cite">[8]</span>.</p>
    </section>

    <section id="butir">
      <h2>Test statements and translation</h2>
      <p>The test has 50 statements from the <b>IPIP Big-Five Factor Markers</b> <span class="cite">[3][4]</span>. IPIP items are in the public domain, so they can be used and translated freely <span class="cite">[5]</span>. The English version of Gangsal shows the original IPIP wording.</p>
      <p>The Indonesian version uses <b>IPIP-BFM-50 Indonesia</b>, adapted by Akhtar and Azwar <span class="cite">[2]</span> following the International Test Commission guidelines <span class="cite">[7]</span>. In 502 respondents, scale reliabilities (alpha) were: Extraversion 0.836; Agreeableness 0.762; Conscientiousness 0.811; Emotional Stability 0.862; Intellect 0.768 <span class="cite">[2]</span>. The Indonesian item text is used under CC BY-SA 4.0. One small change: item I35 reads "Cepat dalam memahami sesuatu", following the 2018 version <span class="cite">[1]</span>, because the sentence in the 2019 article appears truncated.</p>
      <p>Limitations: the validation sample had a mean age of about 20.65 years <span class="cite">[1]</span>. The Indonesian Psychological Association code of ethics asks that tools be used with the population they were validated on, and where this has not been tested, that their strengths and weaknesses be explained <span class="cite">[6, Article 63(1)]</span>. Treat results from much older participants with more care. The reliability figures above apply to the Indonesian version; the English items carry the reliability reported by IPIP <span class="cite">[5]</span>.</p>
    </section>

    <section id="skor">
      <h2>How scores are calculated</h2>
      <ol>
        <li>Each answer is scored from 1 (Very inaccurate) to 5 (Very accurate). Negatively keyed statements are reversed (1 becomes 5, and so on), and the 10 statements of each scale are added up, following the IPIP scoring instructions <span class="cite">[5]</span>.</li>
        <li>The sum is converted to a 0 to 100 scale as <b>percent of maximum possible score (POMP)</b> <span class="cite">[9]</span>: 0 means always choosing the low end, 100 always the high end. POMP is not a percentile; 70 does not mean "higher than 70% of people".</li>
      </ol>
    </section>

    <section id="tingkat">
      <h2>Low, medium and high labels</h2>
      <p>IPIP suggests calculating the mean and standard deviation of your own sample, treating scores within half a standard deviation of the mean as "average" and scores outside that as low or high <span class="cite">[5]</span>. Gangsal uses this method once there are ${NORM_MIN_N} participants. Until then, labels use provisional cut-offs of 35 and 65 and are always marked "provisional".</p>
      <p>Current status: ${n === null ? "loading participant data..." : normsReady(NORMS) ? `norms active, based on ${n} participants.` : `${n} participants, norms not active yet.`}</p>
    </section>

    <section id="ocean">
      <h2>OCEAN</h2>
      <p>Character lists show scores in OCEAN order. O uses the IPIP Intellect/Imagination scale, the closest match to Openness in the five-factor model <span class="cite">[3][8]</span>; the two are not identical. N (Neuroticism) is the opposite pole of Emotional Stability, so it is calculated as 100 minus the Emotional Stability score.</p>
    </section>

    <section id="karakter">
      <h2>Characters are illustrations, not types</h2>
      <p>The Big Five traits are ranges, not boxes. IPIP explicitly advises against sorting people into categories or types based on their scores <span class="cite">[5]</span>. Gangsal's character names and pictures are only illustrations that make a result easier to remember: the name comes from the one or two traits furthest from the midpoint. The full five scores are always shown, and those scores are what you should use to understand a result.</p>
    </section>

    <section id="organisasi">
      <h2>Use by companies and HR</h2>
      <p>Gangsal is a self-report test, not a psychological examination. The Indonesian Psychological Association code of ethics states that a psychological examination report, with its advice and recommendations, can only be made by a psychologist <span class="cite">[6, Article 62(2)]</span>, and that assessment should be carried out by qualified people <span class="cite">[6, Article 63(5)]</span>. Therefore:</p>
      <ul>
        <li>do not use Gangsal results as the only basis for hiring, promotion or performance decisions;</li>
        <li>for selection decisions, involve a psychologist who interprets results alongside other information;</li>
        <li>take participants' language, culture and circumstances into account when interpreting results <span class="cite">[6, Article 65]</span>;</li>
        <li>participants are asked for consent before taking the test <span class="cite">[6, Article 64]</span>.</li>
      </ul>
    </section>

    <section id="data">
      <h2>Personal data</h2>
      <p>The public test does not ask for a name or email; only anonymous answers are stored. In invitations, the participant's name is personal data under Indonesian Law No. 27 of 2022 on Personal Data Protection (UU PDP) <span class="cite">[10]</span>. The organiser decides what the data is used for, so they are responsible as the data controller towards their participants.</p>
      <div class="tbl-scroll"><table>
        <thead><tr><th scope="col">UU PDP provision</th><th scope="col">What Gangsal does</th></tr></thead>
        <tbody>
          <tr><td>Article 22: written or recorded consent</td><td>Participants agree to a consent text before starting; the version of that text is stored with their result.</td></tr>
          <tr><td>Articles 16 and 27: limited, specific and transparent processing</td><td>The consent text names the data sent, who receives it and how long it is kept. The data is only name, answers and scores.</td></tr>
          <tr><td>Articles 8 and 43: right to erasure, duty to erase on request</td><td>The organiser can delete one participant's data or the whole invitation from the recap page.</td></tr>
          <tr><td>Article 43: erasing data that is no longer needed</td><td>Per-participant data is deleted automatically 90 days after the invitation closes.</td></tr>
          <tr><td>Article 16: protecting data security</td><td>Names are encrypted on the participant's device and can only be opened with the organiser's recap link; the Gangsal operator cannot read them.</td></tr>
          <tr><td>Articles 40 and 45: stopping processing when consent is withdrawn, giving notice of erasure</td><td>The organiser's responsibility: delete the data of a participant who withdraws consent, then tell that participant.</td></tr>
        </tbody>
      </table></div>
    </section>

    <section id="rujukan">
      <h2>References</h2>
      ${REFS}
    </section>
  </article>`;
}

/* ---------- donasi ---------- */
// Saweria sebagai pilihan utama (bisa QRIS, e-wallet, transfer), lalu email.
// Alamat email dirakit di sini agar tidak tertulis utuh di HTML untuk pemanen email.
const EMAIL = ["imam.fahrudin.work", "gmail.com"].join("@");
const SAWERIA = "https://saweria.co/ifahrudin";
const LINE = d => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d.map(p=>`<path d="${p}"/>`).join("")}</svg>`;
const DICON = {
  heart: ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"],
  mail: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"],
  copy: ["M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
  check: ["M20 6 9 17l-5-5"],
};
// mailto: hanya jalan bila perangkat punya aplikasi email bawaan; Gmail compose selalu terbuka di browser.
const gmailUrl = () => `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(EMAIL)}&su=${encodeURIComponent(L("Donasi Gangsal","Gangsal donation"))}`;
function renderDonate(copied = false){
  $("#donatePanel").innerHTML = `
    <p class="donate-note">${L("Gangsal gratis, tanpa iklan, dan tanpa akun. Kalau bermanfaat, kamu bisa membantu biaya server.","Gangsal is free, with no ads and no account. If it helps you, you can chip in for the server costs.")}</p>
    <a class="dpill primary" href="${SAWERIA}" target="_blank" rel="noopener noreferrer">${LINE(DICON.heart)}<span>${L("Dukung lewat Saweria","Support on Saweria")}</span></a>
    <div class="dpill-row">
      <a class="dpill" href="${gmailUrl()}" target="_blank" rel="noopener noreferrer">${LINE(DICON.mail)}<span>${L("Kirim email","Send email")}</span></a>
      <button class="dpill${copied ? " done" : ""}" type="button" id="copyEmail" aria-live="polite">${LINE(copied ? DICON.check : DICON.copy)}<span>${copied ? L("Tersalin","Copied") : L("Salin email","Copy email")}</span></button>
    </div>`;
  $("#copyEmail").onclick = async ()=>{
    try { await navigator.clipboard.writeText(EMAIL); }
    catch(e){
      const ta = document.createElement("textarea"); ta.value = EMAIL; ta.className = "sr-only"; ta.readOnly = true;
      document.body.append(ta); ta.select(); try { document.execCommand("copy"); } catch(_){} ta.remove();
    }
    renderDonate(true); $("#copyEmail").focus();
    setTimeout(()=>{ if (!$("#donatePanel").hidden) renderDonate(false); }, 2000);
  };
}
function setDonate(open){
  const panel = $("#donatePanel"), btn = $("#donateBtn");
  if (open) renderDonate();
  panel.hidden = !open;
  btn.setAttribute("aria-expanded", String(open));
  if (open) panel.querySelector("a")?.focus();
}
$("#donateBtn").onclick = ()=>setDonate($("#donatePanel").hidden);
document.addEventListener("click", e=>{ if (!$("#donatePanel").hidden && !e.target.closest("#donate")) setDonate(false); });
document.addEventListener("keydown", e=>{ if (e.key === "Escape" && !$("#donatePanel").hidden){ setDonate(false); $("#donateBtn").focus(); } });

/* ---------- tema ---------- */
const THEMES = ["system","light","dark"];
const themeTxt = () => L({system:"Sistem", light:"Terang", dark:"Gelap"}, {system:"System", light:"Light", dark:"Dark"});
const ICONS = {
  system:"M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-6v2h3v2H7v-2h3v-2H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v8h14V7H5Z",
  light:"M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0-5 1 3h-2l1-3Zm0 20-1-3h2l-1 3ZM2 12l3-1v2l-3-1Zm20 0-3 1v-2l3 1ZM4.9 4.9l2.8 1.4-1.4 1.4-1.4-2.8Zm14.2 14.2-2.8-1.4 1.4-1.4 1.4 2.8Zm0-14.2-1.4 2.8-1.4-1.4 2.8-1.4ZM4.9 19.1l1.4-2.8 1.4 1.4-2.8 1.4Z",
  dark:"M14.5 2.5a9.5 9.5 0 1 0 7 15.9A8 8 0 0 1 14.5 2.5Z"
};
const currentTheme = ()=>{ const t = lsGet("gangsal-theme"); return t==="light"||t==="dark" ? t : "system"; };
function applyTheme(t){
  if (t==="system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t);
  $("#themeLabel").textContent = themeTxt()[t];
  $("#themeIcon").setAttribute("d", ICONS[t]);
  $("#themeBtn").setAttribute("aria-label", L(`Tema: ${themeTxt()[t]}. Tekan untuk ganti.`, `Theme: ${themeTxt()[t]}. Press to change.`));
  const dark = t==="dark" || (t==="system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>m.setAttribute("content", dark?"#14161B":"#F1F3F6"));
}

/* ---------- bahasa: kerangka halaman (header, footer) ---------- */
const DISCLAIMER = {
  id: `<summary><span><b style="color:var(--ink)">Disclaimer.</b> Hasil untuk refleksi diri, bukan diagnosis dan bukan satu-satunya dasar keputusan.</span></summary>
    <ul>
      <li><b>Bukan diagnosis.</b> Hasil tes ini untuk refleksi diri dan bahan percakapan. Jangan dipakai untuk diagnosis psikologis.</li>
      <li><b>Untuk perusahaan.</b> Jangan jadikan hasil tes sebagai satu-satunya dasar keputusan penerimaan atau penilaian kerja. Peserta undangan selalu diminta persetujuan sebelum nama dan hasilnya dikirim ke pembuat undangan.</li>
      <li><b>Sumber soal.</b> IPIP Big-Five Factor Markers 50 item (Goldberg, 1992; public domain, ipip.ori.org), dengan terjemahan tervalidasi IPIP-BFM-50 Indonesia (Akhtar &amp; Azwar, 2019; CC BY-SA 4.0).</li>
      <li><b>Bukan pemeriksaan psikologis.</b> Laporan pemeriksaan psikologis beserta rekomendasinya hanya dapat dibuat oleh Psikolog (Kode Etik Psikologi Indonesia, Pasal 62). <a href="/metode">Metode, aturan, dan rujukan lengkap</a>.</li>
      <li><b>Data.</b> Rekap umum hanya menyimpan jawaban anonim, tanpa nama atau email. Nama peserta undangan dienkripsi di perangkat peserta dan hanya bisa dibuka lewat link rekap milik pembuat undangan; pengelola Gangsal tidak bisa membacanya. Data undangan dihapus otomatis 90 hari setelah batas waktunya habis.</li>
    </ul>`,
  en: `<summary><span><b style="color:var(--ink)">Disclaimer.</b> Results are for self-reflection, not a diagnosis and not the only basis for decisions.</span></summary>
    <ul>
      <li><b>Not a diagnosis.</b> These results are for self-reflection and conversation. Do not use them for psychological diagnosis.</li>
      <li><b>For companies.</b> Do not use results as the only basis for hiring or appraisal decisions. Invited participants are always asked for consent before their name and result are sent to the organiser.</li>
      <li><b>Item source.</b> IPIP Big-Five Factor Markers, 50 items (Goldberg, 1992; public domain, ipip.ori.org), with the validated Indonesian translation IPIP-BFM-50 Indonesia (Akhtar &amp; Azwar, 2019; CC BY-SA 4.0).</li>
      <li><b>Not a psychological examination.</b> Under the Indonesian Psychological Association code of ethics (Article 62), only a psychologist can write a psychological examination report with recommendations. <a href="/metode">Full method, rules and references</a>.</li>
      <li><b>Data.</b> The public recap stores only anonymous answers, with no name or email. Invited participants' names are encrypted on their device and can only be opened with the organiser's recap link; the Gangsal operator cannot read them. Invitation data is deleted automatically 90 days after the invitation closes.</li>
    </ul>`,
};
function applyChrome(){
  document.documentElement.lang = lang;
  $(".skip").textContent = L("Langsung ke isi","Skip to content");
  $("#brand").setAttribute("aria-label", L("Gangsal, ke beranda","Gangsal, go to home"));
  $(".links").setAttribute("aria-label", L("Navigasi utama","Main navigation"));
  $("#navTest").textContent = L("Tes","Test");
  $("#navInvite").textContent = L("Undang","Invite");
  $("#donateBtn span").textContent = L("Donasi","Donate");
  $("#donateBtn").title = L("Donasi","Donate");
  $("#donatePanel").setAttribute("aria-label", L("Donasi","Donate"));
  $("#langLabel").textContent = lang.toUpperCase();
  $("#langBtn").setAttribute("aria-label", L("Bahasa: Indonesia. Tekan untuk ganti ke English.", "Language: English. Press to switch to Bahasa Indonesia."));
  $("#langBtn").title = L("Ganti ke English","Ganti ke Bahasa Indonesia");
  const d = $("#disclaimer"), open = d.open;
  d.innerHTML = DISCLAIMER[lang]; d.open = open;
  if (!$("#donatePanel").hidden) renderDonate();
  applyTheme(currentTheme());
}
function setLang(l){
  lang = l === "en" ? "en" : "id";
  DIMS = dims(lang); TEXT = texts(lang); OCEAN = ocean(lang); ITEM_TXT = itemText(lang);
  applyChrome();
}
function initialLang(){
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "en" || q === "id") return q;
  return lsGet("gangsal-lang") === "en" ? "en" : "id";
}
$("#langBtn").onclick = ()=>{
  const y = scrollY;
  setLang(lang === "en" ? "id" : "en");
  lsSet("gangsal-lang", lang);
  // ?lang di URL hanya untuk kunjungan pertama; buang supaya tidak bertentangan dengan pilihan baru
  if (location.search) history.replaceState(null, "", location.pathname + location.hash);
  route(); scrollTo(0, y);
};

/* ---------- routing ---------- */
function route(){
  const p = location.pathname, h = location.hash.slice(1);
  document.body.classList.remove("in-quiz");
  if (!$("#donatePanel").hidden) setDonate(false);
  const im = /^\/([ir])\/([a-z0-9]{8})$/.exec(p);
  if (im) return im[1]==="i" ? viewInviteJoin(im[2]) : viewInviteRecap(im[2]);
  if (p === "/undang") return viewInviteCreate();
  if (p === "/metode") return viewMethod();
  if (mode) setMode(null);
  if (p.startsWith("/h/")){
    const code = decodeURIComponent(p.slice(3));
    const s = decode(code);
    if (s) return viewResult(s, code);
    history.replaceState(null, "", "/");
  }
  if (h==="tes") viewTest();
  else if (h==="rekap"){ viewIntro(); requestAnimationFrame(()=>{ $("#rekap").scrollIntoView(); $("#rekap").focus({preventScroll:true}); }); }
  else if (h==="disclaimer"){ viewIntro(); $("#disclaimer").open = true; $("#disclaimer").scrollIntoView(); }
  else viewIntro();
}
window.addEventListener("popstate", route);
window.addEventListener("hashchange", ()=>{ route(); if (location.hash!=="#disclaimer" && location.hash!=="#rekap") window.scrollTo(0,0); });
$("#brand").onclick = e=>{ e.preventDefault(); nav("/"); };
document.querySelector(".skip").onclick = e=>{ e.preventDefault(); $("#view").focus(); };
$("#navTest").onclick = ()=>nav("/#tes");
$("#navInvite").onclick = ()=>nav("/undang");
$("#themeBtn").onclick = ()=>{ const t = THEMES[(THEMES.indexOf(currentTheme())+1)%3]; if (t==="system") lsDel("gangsal-theme"); else lsSet("gangsal-theme", t); applyTheme(t); };
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", ()=>applyTheme(currentTheme()));
setLang(initialLang());
route();
loadNorms();
