import { DIMS, ITEMS, SCALE, TEXT, score, level, encode, decode, persona } from "/core.js";
import { characterSVG } from "/character.js";

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
const DRAFT_KEY = "gangsal-draft2";
let answers = new Array(TOTAL).fill(null);
let qi = 0;
let recap = null, recapErr = null;
let saveState = { state:"idle", msg:"" };
let advanceTimer = null;
try { const d = JSON.parse(lsGet(DRAFT_KEY)||"null"); if (d && Array.isArray(d.a) && d.a.length===TOTAL){ answers = d.a; qi = Math.min(Math.max(d.q|0,0), TOTAL-1); } } catch(e){}
const saveDraft = ()=>lsSet(DRAFT_KEY, JSON.stringify({a:answers,q:qi}));
const clearDraft = ()=>lsDel(DRAFT_KEY);
const answeredCount = ()=>answers.filter(v=>v!==null).length;
const resetTest = ()=>{ answers = new Array(TOTAL).fill(null); qi = 0; clearDraft(); };

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const reduceMotion = ()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
function setTitle(t){ document.title = t ? `${t} | Gangsal` : "Gangsal: Tes Kepribadian Big Five"; }
function setNav(which){
  $("#navTest").setAttribute("aria-current", which==="test"?"page":"false");
  $("#navRecap").setAttribute("aria-current", which==="recap"?"page":"false");
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
        ${n ? `<button class="btn" id="restart" type="button">Mulai dari awal</button>` : ""}
      </div>
      <p class="fineprint">Gangsal artinya lima dalam bahasa Jawa. Tanpa daftar akun. Jawabanmu tersimpan di perangkat ini, jadi bisa dilanjutkan nanti. Hasil untuk refleksi diri, bukan diagnosis. <a href="#disclaimer">Baca disclaimer</a>.</p>
    </div>
    <div class="home-art">${pentaFrame(SAMPLE)}</div>
  </section>
  <section class="dims" aria-label="Lima dimensi yang diukur">
    ${DIMS.map(d=>`<div><i style="background:var(--d-${DK[d.key]})"></i><b>${d.name}</b><span>${d.about}</span></div>`).join("")}
  </section>`;
  $("#start").onclick = ()=>{ if (!n) qi = 0; nav("/#tes"); };
  if ($("#restart")) $("#restart").onclick = ()=>{ resetTest(); nav("/#tes"); };
}

/* ---------- tes: satu pernyataan per layar ---------- */
function viewTest(){
  setNav("test"); setTitle(`Pernyataan ${qi+1} dari ${TOTAL}`);
  clearTimeout(advanceTimer);
  const [text] = ITEMS[qi];
  const done = answeredCount();
  const cur = answers[qi];
  $("#view").innerHTML = `
  <section class="quiz">
    <div class="quiz-top">
      <div class="quiz-meta"><span>Pernyataan <b class="num">${qi+1}</b> dari ${TOTAL}</span><span class="saved num">${done} terjawab</span></div>
      <div class="track" role="progressbar" aria-label="Kemajuan tes" aria-valuemin="0" aria-valuemax="${TOTAL}" aria-valuenow="${done}"><i style="width:${done/TOTAL*100}%"></i></div>
    </div>
    <div>
      <p class="ask">${qi===0 ? "Gambarkan dirimu seperti biasanya sekarang, bukan seperti yang kamu inginkan. Seberapa sesuai pernyataan ini?" : "Seberapa sesuai pernyataan ini dengan dirimu?"}</p>
      <p class="statement" id="statement" tabindex="-1">${esc(text)}</p>
    </div>
    <div class="answers" role="radiogroup" aria-labelledby="statement">
      ${SCALE.map((_,j)=>`<button type="button" class="ans" role="radio" aria-checked="${cur===j+1}" data-v="${j+1}">
        <span class="key" aria-hidden="true">${j+1}</span><span>${ANSWER_TXT[j]}</span><span class="mark" aria-hidden="true"></span></button>`).join("")}
    </div>
    <div class="quiz-nav">
      <button class="btn" type="button" id="prev">${qi===0 ? "Kembali ke beranda" : "Sebelumnya"}</button>
      <span class="keys-hint">Bisa juga tekan angka 1 sampai 5</span>
      ${cur!==null && qi<TOTAL-1 ? `<button class="btn primary" type="button" id="next">Berikutnya</button>` : ""}
      ${cur!==null && qi===TOTAL-1 ? `<button class="btn primary" type="button" id="finish">Lihat hasil</button>` : ""}
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
  if (qi===0) return nav("/");
  qi--; saveDraft(); viewTest(); $("#statement")?.focus({preventScroll:true});
}
function finish(){
  const miss = answers.findIndex(v=>v===null);
  if (miss !== -1){ qi = miss; saveDraft(); viewTest(); return; }
  const s = score(answers);
  const sent = answers.slice();
  resetTest();
  lsSet("gangsal-last", encode(s));
  ssSet("gangsal-mine", encode(s));
  saveResult(sent);
  nav("/h/"+encode(s));
}
document.addEventListener("keydown", e=>{
  if (location.hash!=="#tes" || location.pathname!=="/" || e.ctrlKey || e.metaKey || e.altKey) return;
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
      </section>`;
  }
  $("#view").innerHTML = `
    ${recap && recap.total ? "" : `<h1 style="margin-bottom:24px">Rekap peserta</h1>`}
    ${body}
    <div class="row" style="margin-top:32px"><button class="btn primary" id="toTest" type="button">Ikut tes</button>${recap?`<button class="btn link" id="refresh" type="button">Muat ulang rekap</button>`:""}</div>`;
  $("#toTest").onclick = ()=>nav("/#tes");
  if ($("#refresh")) $("#refresh").onclick = ()=>{ recap = null; viewRecap(); };
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
$("#themeBtn").onclick = ()=>{ const t = THEMES[(THEMES.indexOf(currentTheme())+1)%3]; if (t==="system") lsDel("gangsal-theme"); else lsSet("gangsal-theme", t); applyTheme(t); };
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", ()=>applyTheme(currentTheme()));
applyTheme(currentTheme());
route();
