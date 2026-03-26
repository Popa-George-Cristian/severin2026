/* Primăria Galați v3.1 */

let homeMap, reportMap, detailMap, reportMarker=null, currentUser=null, token=localStorage.getItem('token');
let a11yMode=false, ttsOn=false, synth=window.speechSynthesis, allDepts=[];
const GL=[45.4353,28.0080], ZM=14;
const CAT={drum:'Drum',iluminat:'Iluminat',salubritate:'Salubritate',spatii_verzi:'Spații Verzi',mobilier_urban:'Mobilier',canalizare:'Canalizare',constructii:'Construcții',altele:'Altele'};
const STAT={nou:'Nou',in_lucru:'În lucru',rezolvat:'Rezolvat',redirectionat:'Redirecționat'};

// ── API helper ──────────────────────────────────────────────────
async function api(u,o={}){
  const h={...(o.headers||{})};
  if(token) h['x-auth-token']=token;
  if(o.body && !(o.body instanceof FormData)){h['Content-Type']='application/json';o.body=JSON.stringify(o.body);}
  return fetch(u,{...o,headers:h});
}

// ── INIT ────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded',()=>{
  initA11y();
  checkAuth();
  initMaps();
  loadHome();
  document.getElementById('hamburger').addEventListener('click',()=>document.getElementById('navMenu').classList.toggle('open'));
  window.addEventListener('scroll',()=>document.getElementById('navbar').classList.toggle('scrolled',scrollY>20));
  fetch('/api/departments').then(r=>r.json()).then(d=>{allDepts=d}).catch(()=>{});
});

// ══════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════
window.go = function(page, extra) {
  document.getElementById('navMenu').classList.remove('open');
  // Protected
  if(page==='report' && !currentUser){go('login');return;}
  if(page==='primar' && (!currentUser||!['primar','admin'].includes(currentUser.role))){toast('Acces interzis','err');return;}
  if(page==='dept' && (!currentUser||currentUser.role!=='departament')){toast('Acces interzis','err');return;}
  if(page==='admin' && (!currentUser||currentUser.role!=='admin')){toast('Acces interzis','err');return;}

  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const el=document.getElementById('page-'+page);
  if(el){el.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});}

  // Load data
  if(page==='home') setTimeout(()=>{homeMap&&homeMap.invalidateSize();loadHome()},200);
  if(page==='news') loadAllNews();
  if(page==='article') loadArticle(extra);
  if(page==='report') setTimeout(()=>{reportMap&&reportMap.invalidateSize();loadMyReports()},200);
  if(page==='primar') loadPrimar();
  if(page==='dept') loadDept();
  if(page==='admin') loadAdmin();

  // A11y announce
  if(ttsOn){
    const names={home:'Pagina principală',news:'Știri',about:'Despre Galați',contact:'Contact',login:'Autentificare',report:'Raportare',primar:'Biroul primarului',dept:'Departament',admin:'Administrare'};
    if(names[page]) setTimeout(()=>speak(names[page]),300);
  }
};

// ══════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════
function checkAuth(){
  if(token) api('/api/auth/me').then(r=>r.ok?r.json():Promise.reject()).then(d=>setUser(d.user)).catch(clearUser);
}

window.onAuthClick = function(){
  if(currentUser) doLogout();
  else go('login');
};

window.showTab = function(tab){
  document.querySelectorAll('.ltab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.ltab-panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  // Highlight correct tab button
  const btns = document.querySelectorAll('.login-tabs .ltab');
  btns.forEach(b=>b.classList.toggle('active', b.textContent.includes(tab==='signin'?'Conectare':'Cont')));
};

window.doLogin = async function(){
  const u=document.getElementById('liUser').value.trim(), p=document.getElementById('liPass').value, m=document.getElementById('loginMsg');
  if(!u||!p){showMsg(m,'Completați ambele câmpuri','err');return;}
  const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  const d=await r.json();
  if(!r.ok){showMsg(m,d.error,'err');if(ttsOn)speak(d.error);return;}
  token=d.token;localStorage.setItem('token',token);setUser(d.user);
  toast('Bine ați venit!','ok');if(ttsOn)speak('Conectat cu succes');
  if(d.user.role==='primar')go('primar');else if(d.user.role==='departament')go('dept');else if(d.user.role==='admin')go('admin');else go('report');
};

window.doRegister = async function(){
  const u=document.getElementById('ruUser').value.trim(),e=document.getElementById('ruEmail').value.trim(),p=document.getElementById('ruPass').value,n=document.getElementById('ruName').value.trim(),m=document.getElementById('regMsg');
  if(!u||!e||!p){showMsg(m,'Câmpuri obligatorii','err');return;}
  const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,email:e,password:p,full_name:n})});
  const d=await r.json();if(!r.ok){showMsg(m,d.error,'err');return;}
  token=d.token;localStorage.setItem('token',token);setUser(d.user);toast('Cont creat!','ok');go('report');
};

async function doLogout(){
  await api('/api/auth/logout',{method:'POST'}).catch(()=>{});
  clearUser();toast('Deconectat','info');go('home');
}

function setUser(u){
  currentUser=u;
  document.getElementById('authLabel').textContent=u.full_name||u.username;
  document.getElementById('navReport').style.display=['cetatean','admin'].includes(u.role)?'':'none';
  document.getElementById('navPrimar').style.display=['primar','admin'].includes(u.role)?'':'none';
  document.getElementById('navDept').style.display=u.role==='departament'?'':'none';
  document.getElementById('navAdmin').style.display=u.role==='admin'?'':'none';
  if(u.role==='departament'&&u.department) document.getElementById('deptTitle').textContent=u.department.name;
}

function clearUser(){
  currentUser=null;token=null;localStorage.removeItem('token');
  document.getElementById('authLabel').textContent='Autentificare';
  ['navReport','navPrimar','navDept','navAdmin'].forEach(id=>document.getElementById(id).style.display='none');
}

// ══════════════════════════════════════════════════════════════════
// MAPS
// ══════════════════════════════════════════════════════════════════
function initMaps(){
  homeMap=L.map('homeMap').setView(GL,ZM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(homeMap);
  loadMarkers(homeMap);

  reportMap=L.map('reportMap').setView(GL,ZM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(reportMap);
  reportMap.on('click',e=>{
    if(reportMarker)reportMarker.setLatLng(e.latlng);
    else reportMarker=L.marker(e.latlng,{draggable:true}).addTo(reportMap);
    document.getElementById('rLat').value=e.latlng.lat;
    document.getElementById('rLng').value=e.latlng.lng;
    document.getElementById('rAddr').value=e.latlng.lat.toFixed(4)+', '+e.latlng.lng.toFixed(4);
    // Reverse geocode
    fetch(`https://nominatim.openstreetmap.org/reverse?lat=${e.latlng.lat}&lon=${e.latlng.lng}&format=json&accept-language=ro`)
      .then(r=>r.json()).then(d=>{if(d.display_name)document.getElementById('rAddr').value=d.display_name.split(',').slice(0,3).join(',').trim()}).catch(()=>{});
    if(ttsOn)speak('Locație marcată');
  });
  loadMarkers(reportMap);
}

async function loadMarkers(map){
  try{
    const reps=await fetch('/api/reports').then(r=>r.json());
    reps.forEach(r=>{
      if(!r.latitude||!r.longitude)return;
      L.marker([r.latitude,r.longitude]).addTo(map)
        .bindPopup(`<b>${esc(r.title)}</b><br>${CAT[r.category]||r.category}<br><small>${STAT[r.status]||r.status}</small>`);
    });
  }catch(e){}
}

// ══════════════════════════════════════════════════════════════════
// HOME & NEWS
// ══════════════════════════════════════════════════════════════════
async function loadHome(){
  try{
    const s=await fetch('/api/reports/stats').then(r=>r.json());
    document.getElementById('sTotal').textContent=s.total;
    document.getElementById('sUrg').textContent=s.urgent;
    const gc=st=>(s.byStatus.find(x=>x.status===st)||{count:0}).count;
    document.getElementById('sRes').textContent=gc('rezolvat');
    document.getElementById('sProg').textContent=gc('in_lucru');
    const news=await fetch('/api/news').then(r=>r.json());
    document.getElementById('homeNews').innerHTML=news.slice(0,3).map(newsCard).join('');
  }catch(e){}
}

function newsCard(n){
  return `<div class="ncard" onclick="go('article','${n.id}')">
    ${n.image_url?`<div class="ncard-img" style="background-image:url(${n.image_url})"></div>`:''}
    <div class="ncard-body"><div class="ncard-cat">${esc(n.category)}</div><h3>${esc(n.title)}</h3>
    <p>${esc(n.summary||n.content.substring(0,120)+'...')}</p><div class="ncard-date">${fmtD(n.created_at)}</div></div></div>`;
}

async function loadAllNews(){
  const n=await fetch('/api/news').then(r=>r.json());
  document.getElementById('allNews').innerHTML=n.map(newsCard).join('');
}

async function loadArticle(id){
  const a=await fetch(`/api/news/${id}`).then(r=>r.json());
  document.getElementById('articleBody').innerHTML=`
    <div class="ncard-cat">${esc(a.category)}</div><h2>${esc(a.title)}</h2>
    <p style="color:var(--light);font-size:.82rem;margin-bottom:1rem">${fmtD(a.created_at)}</p>
    ${a.image_url?`<img src="${a.image_url}" style="width:100%;height:250px;object-fit:cover;border-radius:8px;margin-bottom:1rem">`:''}
    <div style="line-height:1.9">${a.content.split('\n').map(p=>p.trim()?'<p>'+esc(p)+'</p>':'').join('')}</div>`;
}

// ══════════════════════════════════════════════════════════════════
// REPORT
// ══════════════════════════════════════════════════════════════════
window.submitReport = async function(){
  const t=document.getElementById('rTitle').value.trim(),d=document.getElementById('rDesc').value.trim(),c=document.getElementById('rCat').value,m=document.getElementById('reportMsg');
  if(!t||!d||!c){showMsg(m,'Completați titlul, categoria și descrierea','err');return;}
  const fd=new FormData();
  fd.append('type',document.getElementById('rType').value);fd.append('title',t);fd.append('description',d);
  fd.append('category',c);fd.append('priority',document.getElementById('rPri').value);
  if(document.getElementById('rLat').value)fd.append('latitude',document.getElementById('rLat').value);
  if(document.getElementById('rLng').value)fd.append('longitude',document.getElementById('rLng').value);
  if(document.getElementById('rAddr').value)fd.append('address',document.getElementById('rAddr').value);
  const ph=document.getElementById('rPhoto').files[0];if(ph)fd.append('photo',ph);
  const r=await api('/api/reports',{method:'POST',body:fd});const data=await r.json();
  if(r.ok){showMsg(m,'Sesizare trimisă! Nr: '+data.cerere_nr,'ok');toast('Nr: '+data.cerere_nr,'ok');
    ['rTitle','rDesc','rAddr','rLat','rLng'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('rCat').value='';document.getElementById('rPhoto').value='';
    if(reportMarker){reportMap.removeLayer(reportMarker);reportMarker=null;}loadMyReports();
  } else showMsg(m,data.error||'Eroare','err');
};

async function loadMyReports(){
  const reps=await fetch('/api/reports').then(r=>r.json());
  const el=document.getElementById('myReports');
  el.innerHTML=reps.length?reps.map(r=>`<div class="rp-item" onclick="openDetail(${r.id})"><div class="rp-title">${esc(r.title)}</div><div class="rp-meta">${r.cerere_nr||''} · ${STAT[r.status]||r.status} · ${fmtD(r.created_at)}</div></div>`).join(''):'<p style="padding:.75rem;text-align:center;color:var(--muted)">Nicio sesizare</p>';
}

window.submitContact = async function(){
  const n=document.getElementById('cName').value.trim(),e=document.getElementById('cEmail').value.trim(),msg=document.getElementById('cMessage').value.trim(),m=document.getElementById('contactMsg');
  if(!n||!e||!msg){showMsg(m,'Câmpuri obligatorii','err');return;}
  const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,subject:document.getElementById('cSubject').value.trim(),message:msg})});
  if(r.ok){showMsg(m,'Trimis!','ok');toast('Mesaj trimis!','ok');['cName','cEmail','cSubject','cMessage'].forEach(id=>document.getElementById(id).value='');}
  else showMsg(m,'Eroare','err');
};

// ══════════════════════════════════════════════════════════════════
// DETAIL MODAL
// ══════════════════════════════════════════════════════════════════
window.openDetail = async function(id){
  try{
    const r=await api(`/api/reports/${id}`).then(x=>x.json());
    const isP=currentUser&&['primar','admin'].includes(currentUser.role);
    const isD=currentUser&&currentUser.role==='departament';
    let h=`<h2>${esc(r.title)}</h2>
      <p><span class="badge b-${r.status}">${STAT[r.status]||r.status}</span> · ${r.priority==='urgent'?'🔴 Urgent':'Normal'} · Nr: ${r.cerere_nr||'—'}</p>
      <p style="color:var(--muted);font-size:.85rem">${CAT[r.category]||r.category} · ${fmtD(r.created_at)}${r.author_name?' · '+esc(r.author_name):''}${r.address?' · '+esc(r.address):''}</p>
      ${r.photo_path?`<img src="${r.photo_path}" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin:.75rem 0">`:''}
      <p style="margin:.75rem 0;line-height:1.8">${esc(r.description)}</p>`;
    if(r.latitude&&r.longitude) h+=`<div id="dMap" class="detail-map"></div>`;
    if(r.rezolutie) h+=`<div class="detail-section"><h4>Rezoluție primar</h4><p>${esc(r.rezolutie)}</p></div>`;
    if(r.department_notes) h+=`<div class="detail-section"><h4>Note departament</h4><p>${esc(r.department_notes)}</p></div>`;
    if(r.dept_name) h+=`<p style="margin-top:.5rem;font-size:.85rem"><strong>Departament:</strong> ${esc(r.dept_name)}</p>`;
    // Primar controls
    if(isP){
      if(!allDepts.length) allDepts=await fetch('/api/departments').then(x=>x.json());
      h+=`<div class="detail-section"><h4>Redirecționare</h4>
        <div class="dept-checks">${allDepts.map(d=>`<label class="dept-check"><input type="radio" name="asDept" value="${d.id}" ${r.department_id===d.id?'checked':''}> ${esc(d.name)}</label>`).join('')}</div>
        <div class="field"><label>Rezoluție</label><textarea id="dRez" rows="2">${esc(r.rezolutie||'')}</textarea></div>
        <button class="btn btn-gold" onclick="assignReport(${r.id})">Redirecționează</button>
        <button class="btn btn-danger" style="margin-left:.5rem" onclick="delReport(${r.id})">Șterge</button>
      </div>`;
    }
    // Dept controls
    if(isD){
      h+=`<div class="detail-section"><h4>Actualizare</h4>
        <div class="field"><label>Status</label><select id="dStat"><option value="in_lucru" ${r.status==='in_lucru'?'selected':''}>În lucru</option><option value="rezolvat" ${r.status==='rezolvat'?'selected':''}>Rezolvat</option></select></div>
        <div class="field"><label>Note</label><textarea id="dNotes" rows="2">${esc(r.department_notes||'')}</textarea></div>
        <button class="btn btn-gold" onclick="updateDept(${r.id})">Salvează</button>
      </div>`;
    }
    document.getElementById('detailBody').innerHTML=h;
    document.getElementById('detailOverlay').classList.add('open');
    if(r.latitude&&r.longitude) setTimeout(()=>{
      if(detailMap){detailMap.remove();detailMap=null;}
      detailMap=L.map('dMap').setView([r.latitude,r.longitude],16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'©OSM'}).addTo(detailMap);
      L.marker([r.latitude,r.longitude]).addTo(detailMap);
    },200);
    if(ttsOn) speak('Sesizare: '+r.title);
  }catch(e){toast('Eroare','err');}
};

window.closeDetail = function(){document.getElementById('detailOverlay').classList.remove('open');if(detailMap){detailMap.remove();detailMap=null;}};
window.assignReport = async function(id){
  const dept=document.querySelector('input[name="asDept"]:checked')?.value;
  if(!dept){toast('Selectați departament','err');return;}
  await api(`/api/reports/${id}/assign`,{method:'PATCH',body:{department_id:parseInt(dept),rezolutie:document.getElementById('dRez')?.value}});
  toast('Redirecționat!','ok');closeDetail();loadPrimar();
};
window.updateDept = async function(id){
  await api(`/api/reports/${id}/dept`,{method:'PATCH',body:{status:document.getElementById('dStat').value,department_notes:document.getElementById('dNotes').value}});
  toast('Actualizat!','ok');closeDetail();loadDept();
};
window.delReport = async function(id){if(!confirm('Sigur?'))return;await api(`/api/reports/${id}`,{method:'DELETE'});toast('Șters','info');closeDetail();loadPrimar();};

// ══════════════════════════════════════════════════════════════════
// PRIMAR
// ══════════════════════════════════════════════════════════════════
async function loadPrimar(){
  const s=await fetch('/api/reports/stats').then(r=>r.json());
  document.getElementById('psTotal').textContent=s.total;
  document.getElementById('psUnassigned').textContent=s.unassigned;
  document.getElementById('psUrg').textContent=s.urgent;
  loadPrimarReports();loadPrimarNews();
}

window.loadPrimarReports = async function(){
  const st=document.getElementById('pfStatus').value;
  let u='/api/reports?';if(st)u+=`status=${st}&`;
  const reps=await fetch(u).then(r=>r.json());
  document.getElementById('pReportsBody').innerHTML=reps.map(r=>`<tr onclick="openDetail(${r.id})">
    <td><strong>${esc(r.cerere_nr||'—')}</strong></td><td>${esc(r.title)}</td><td>${CAT[r.category]||r.category}</td>
    <td><span class="badge b-${r.status}">${STAT[r.status]||r.status}</span></td><td>${esc(r.dept_name||'—')}</td><td>${fmtD(r.created_at)}</td></tr>`).join('');
};

async function loadPrimarNews(){
  const n=await fetch('/api/news').then(r=>r.json());
  document.getElementById('pNewsList').innerHTML=n.map(x=>`<div class="acard"><span>${esc(x.title)}</span><button class="btn btn-danger" onclick="delNews(${x.id})">Șterge</button></div>`).join('');
}

window.submitNews = async function(){
  const t=document.getElementById('nTitle').value.trim(),c=document.getElementById('nContent').value.trim();
  if(!t||!c){toast('Titlu+conținut','err');return;}
  await api('/api/news',{method:'POST',body:{title:t,content:c,category:document.getElementById('nCatSel').value}});
  toast('Publicată!','ok');document.getElementById('nTitle').value='';document.getElementById('nContent').value='';loadPrimarNews();
};
window.delNews = async function(id){if(!confirm('Sigur?'))return;await api(`/api/news/${id}`,{method:'DELETE'});toast('Șters','info');loadPrimarNews();};

window.showPTab = function(id){document.querySelectorAll('#page-primar .tpanel').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('#page-primar .tab').forEach((t,i)=>t.classList.toggle('active',t.textContent.includes(id==='pReports'?'Sesizări':'Știri')));};

// ══════════════════════════════════════════════════════════════════
// DEPT
// ══════════════════════════════════════════════════════════════════
async function loadDept(){
  const reps=await api('/api/reports').then(r=>r.json());
  document.getElementById('dReportsBody').innerHTML=reps.map(r=>`<tr onclick="openDetail(${r.id})">
    <td><strong>${esc(r.cerere_nr||'—')}</strong></td><td>${esc(r.title)}</td>
    <td><span class="badge b-${r.status}">${STAT[r.status]||r.status}</span></td><td>${esc(r.address||'—')}</td><td>${fmtD(r.created_at)}</td></tr>`).join('');
}

// ══════════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════════
async function loadAdmin(){loadAdminDepts();loadAdminUsers();}
async function loadAdminDepts(){
  const ds=await fetch('/api/departments').then(r=>r.json());allDepts=ds;
  document.getElementById('aDeptsList').innerHTML=ds.map(d=>`<div class="acard"><span>${esc(d.name)}</span><button class="btn btn-danger" onclick="delDept(${d.id})">Șterge</button></div>`).join('');
  document.getElementById('auDept').innerHTML='<option value="">—</option>'+ds.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');
}
async function loadAdminUsers(){
  const us=await api('/api/users').then(r=>r.json());
  document.getElementById('aUsersList').innerHTML=us.map(u=>`<div class="acard"><span>${esc(u.full_name||u.username)} (${u.role}${u.dept_name?' · '+u.dept_name:''})</span>${u.role!=='admin'?`<button class="btn btn-danger" onclick="delUser(${u.id})">Șterge</button>`:''}</div>`).join('');
}
window.submitDept = async function(){const n=document.getElementById('adName').value.trim();if(!n)return;await api('/api/departments',{method:'POST',body:{name:n}});document.getElementById('adName').value='';loadAdminDepts();toast('Adăugat!','ok');};
window.submitUser = async function(){
  const u=document.getElementById('auUser').value.trim(),e=document.getElementById('auEmail').value.trim(),p=document.getElementById('auPass').value;
  if(!u||!e||!p){toast('Câmpuri obligatorii','err');return;}
  const r=await api('/api/users',{method:'POST',body:{username:u,email:e,password:p,role:document.getElementById('auRole').value,department_id:document.getElementById('auDept').value||null}});
  if(r.ok){toast('Adăugat!','ok');['auUser','auEmail','auPass'].forEach(id=>document.getElementById(id).value='');loadAdminUsers();}
  else{const d=await r.json();toast(d.error||'Eroare','err');}
};
window.delDept = async function(id){if(!confirm('Sigur?'))return;await api(`/api/departments/${id}`,{method:'DELETE'});loadAdminDepts();};
window.delUser = async function(id){if(!confirm('Sigur?'))return;await api(`/api/users/${id}`,{method:'DELETE'});loadAdminUsers();};
window.showATab = function(id){document.querySelectorAll('#page-admin .tpanel').forEach(p=>p.classList.remove('active'));document.getElementById(id).classList.add('active');document.querySelectorAll('#page-admin .tab').forEach((t,i)=>t.classList.toggle('active',t.textContent.includes(id==='aDepts'?'Departamente':'Utilizatori')));};

// ══════════════════════════════════════════════════════════════════
// CHAT
// ══════════════════════════════════════════════════════════════════
let chatHist=[];
window.toggleChat = function(){
  const p=document.getElementById('chatPanel');
  p.classList.toggle('open');
  if(p.classList.contains('open')) document.getElementById('chatInput').focus();
};

window.sendChat = async function(){
  const inp=document.getElementById('chatInput'),m=inp.value.trim();if(!m)return;inp.value='';
  addChat(m,'user');chatHist.push({role:'user',content:m});
  try{
    const r=await fetch('/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m,history:chatHist.slice(-8)})});
    const d=await r.json();
    addChat(d.reply,'bot');chatHist.push({role:'assistant',content:d.reply});
    if(ttsOn) speak(d.reply);
  }catch(e){addChat('Eroare conexiune.','bot');}
};

function addChat(t,w){
  const c=document.getElementById('chatMsgs'),d=document.createElement('div');
  d.className='chat-msg chat-'+w;d.innerHTML=`<div class="chat-bbl">${esc(t)}</div>`;
  c.appendChild(d);c.scrollTop=c.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════
// ACCESSIBILITY
// ══════════════════════════════════════════════════════════════════
function initA11y(){
  const ov=document.getElementById('a11yOverlay');
  if(synth){synth.getVoices();synth.onvoiceschanged=()=>synth.getVoices();}

  const saved=localStorage.getItem('a11y');
  if(saved==='true'){ov.classList.add('hidden');enableA11y();return;}
  if(saved==='false'){ov.classList.add('hidden');return;}

  // First visit — speak
  setTimeout(()=>speakRaw('Bine ați venit pe portalul Primăriei Galați. Dacă aveți o dizabilitate vizuală, apăsați Space. Pentru navigare normală, apăsați X.'),800);

  document.addEventListener('keydown',function handler(e){
    if(ov.classList.contains('hidden'))return;
    if(e.code==='Space'){e.preventDefault();synth&&synth.cancel();ov.classList.add('hidden');localStorage.setItem('a11y','true');enableA11y();speak('Mod accesibil activat. Folosiți Tab pentru navigare, Enter pentru selectare.');}
    if(e.code==='KeyX'){e.preventDefault();synth&&synth.cancel();ov.classList.add('hidden');localStorage.setItem('a11y','false');}
  });
}

function enableA11y(){
  a11yMode=true;ttsOn=true;
  document.body.classList.add('a11y-mode');
  document.getElementById('a11yToggle').classList.add('active');
  document.getElementById('a11yBar').classList.add('active');
  document.addEventListener('focusin',onFocus);
  document.addEventListener('keydown',onA11yKey);
}

function disableA11y(){
  a11yMode=false;ttsOn=false;synth&&synth.cancel();
  document.body.classList.remove('a11y-mode');
  document.getElementById('a11yToggle').classList.remove('active');
  document.getElementById('a11yBar').classList.remove('active');
  document.removeEventListener('focusin',onFocus);
  document.removeEventListener('keydown',onA11yKey);
  localStorage.setItem('a11y','false');
}

window.toggleA11y = function(){
  if(a11yMode){disableA11y();speak('Dezactivat');setTimeout(()=>{synth&&synth.cancel();ttsOn=false;},1500);}
  else{enableA11y();speak('Mod accesibil activat.');}
};

function onFocus(e){
  if(!ttsOn)return;
  const el=e.target;let t='';
  if(el.tagName==='INPUT'||el.tagName==='TEXTAREA'){const l=el.closest('.field')?.querySelector('label')?.textContent||'';t=`Câmp: ${l}. ${el.value||el.placeholder||''}`;}
  else if(el.tagName==='SELECT'){const l=el.closest('.field')?.querySelector('label')?.textContent||'';t=`Selector: ${l}. ${el.options[el.selectedIndex]?.textContent||''}`;}
  else if(el.tagName==='BUTTON'||el.classList.contains('btn'))t=`Buton: ${el.textContent.trim()}`;
  else if(el.classList.contains('nl'))t=`Meniu: ${el.textContent.trim()}`;
  else t=el.textContent?.trim()?.substring(0,100)||'';
  if(t){speak(t);document.getElementById('a11yBarText').textContent=t;}
}

function onA11yKey(e){
  if(e.key==='Escape'){if(document.getElementById('detailOverlay').classList.contains('open'))closeDetail();
  else if(document.getElementById('chatPanel').classList.contains('open'))toggleChat();}
}

function speak(t){if(!ttsOn||!synth)return;speakRaw(t);}
function speakRaw(t){
  if(!synth)return;synth.cancel();
  const u=new SpeechSynthesisUtterance(t);u.lang='ro-RO';u.rate=0.9;
  const v=synth.getVoices().find(v=>v.lang.startsWith('ro'));if(v)u.voice=v;
  synth.speak(u);
}

// ══════════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════════
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function fmtD(d){return d?new Date(d).toLocaleDateString('ro-RO',{year:'numeric',month:'short',day:'numeric'}):''}
function showMsg(el,m,t){el.className='msg '+t;el.textContent=m;el.style.display='block';setTimeout(()=>el.style.display='none',6000);}
function toast(m,t='info'){const c=document.getElementById('toasts'),d=document.createElement('div');d.className='toast toast-'+t;d.textContent=m;c.appendChild(d);setTimeout(()=>{d.style.opacity='0';d.style.transition='.3s';setTimeout(()=>d.remove(),300);},3000);}
