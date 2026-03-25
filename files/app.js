document.addEventListener('DOMContentLoaded',()=>{lucide.createIcons();initA11y();initAuth();initNav();initMaps();initForms();initChat();loadHome()});

let homeMap,reportMap,detailMap,reportMarker=null,currentUser=null,token=localStorage.getItem('token');
const GL=[45.4353,28.0080],ZM=14;
const CAT={drum:'🛣️ Drum',iluminat:'💡 Iluminat',salubritate:'🗑️ Salubritate',spatii_verzi:'🌳 Spații Verzi',mobilier_urban:'🪑 Mobilier',canalizare:'🔧 Canalizare',constructii:'🏗️ Construcții',altele:'📋 Altele'};
const STAT={nou:'Nou',in_lucru:'În lucru',rezolvat:'Rezolvat','redirecționat':'Redirecționat'};
const STATC={nou:'#9e7d1a',in_lucru:'#c66b18',rezolvat:'#27864a','redirecționat':'#2563a8'};
let allDepts=[];

async function api(u,o={}){const h={...(o.headers||{})};if(token)h['x-auth-token']=token;if(o.body&&!(o.body instanceof FormData)){h['Content-Type']='application/json';o.body=JSON.stringify(o.body)}return fetch(u,{...o,headers:h})}

// ── AUTH ────────────────────────────────────────────────────────
function initAuth(){
  document.querySelectorAll('.ltab').forEach(t=>t.addEventListener('click',()=>{document.querySelectorAll('.ltab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.lt-panel').forEach(x=>x.classList.remove('active'));t.classList.add('active');document.getElementById('lt-'+t.dataset.lt).classList.add('active')}));
  document.getElementById('btnLogin').addEventListener('click',doLogin);
  document.getElementById('btnReg').addEventListener('click',doReg);
  document.getElementById('liPass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
  document.getElementById('ruPass').addEventListener('keydown',e=>{if(e.key==='Enter')doReg()});
  document.getElementById('navAuth').addEventListener('click',e=>{e.preventDefault();currentUser?doLogout():go('login')});
  document.getElementById('heroReport').addEventListener('click',e=>{if(!currentUser){e.preventDefault();e.stopPropagation();go('login')}});
  if(token)api('/api/auth/me').then(r=>r.ok?r.json():Promise.reject()).then(d=>setUser(d.user)).catch(clearUser);
  // Load departments
  fetch('/api/departments').then(r=>r.json()).then(d=>{allDepts=d}).catch(()=>{});
}

async function doLogin(){
  const u=document.getElementById('liUser').value.trim(),p=document.getElementById('liPass').value,m=document.getElementById('loginMsg');
  if(!u||!p)return showMsg(m,'Completați ambele câmpuri','err');
  const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
  const d=await r.json();if(!r.ok)return showMsg(m,d.error,'err');
  token=d.token;localStorage.setItem('token',token);setUser(d.user);toast('Bine ați venit!','ok');
  // Redirect based on role
  if(d.user.role==='primar')go('primar');else if(d.user.role==='departament')go('dept');else if(d.user.role==='admin')go('admin');else go('report');
}

async function doReg(){
  const u=document.getElementById('ruUser').value.trim(),e=document.getElementById('ruEmail').value.trim(),p=document.getElementById('ruPass').value,n=document.getElementById('ruName').value.trim(),m=document.getElementById('regMsg');
  if(!u||!e||!p)return showMsg(m,'Câmpuri obligatorii','err');
  const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,email:e,password:p,full_name:n})});
  const d=await r.json();if(!r.ok)return showMsg(m,d.error,'err');
  token=d.token;localStorage.setItem('token',token);setUser(d.user);toast('Cont creat!','ok');go('report');
}

async function doLogout(){await api('/api/auth/logout',{method:'POST'}).catch(()=>{});clearUser();toast('Deconectat','info');go('home')}

function setUser(u){
  currentUser=u;document.getElementById('navAuthLabel').textContent=u.full_name||u.username;
  const show=(id,v)=>document.getElementById(id).style.display=v?'':'none';
  show('navReport',['cetatean','admin'].includes(u.role));
  show('navPrimar',['primar','admin'].includes(u.role));
  show('navDept',u.role==='departament');
  show('navAdmin',u.role==='admin');
  if(u.role==='departament'&&u.department){
    document.getElementById('deptTitle').textContent=u.department.name;
    document.getElementById('deptTag').textContent=u.department.name;
  }
  lucide.createIcons();
}

function clearUser(){currentUser=null;token=null;localStorage.removeItem('token');document.getElementById('navAuthLabel').textContent='Autentificare';['navReport','navPrimar','navDept','navAdmin'].forEach(id=>document.getElementById(id).style.display='none');lucide.createIcons()}

// ── NAV ─────────────────────────────────────────────────────────
function initNav(){
  document.addEventListener('click',e=>{
    const t=e.target.closest('[data-page]');
    if(t){e.preventDefault();const p=t.dataset.page;if(['report'].includes(p)&&!currentUser){go('login');return}if(['primar'].includes(p)&&(!currentUser||!['primar','admin'].includes(currentUser.role))){toast('Acces interzis','err');return}if(['dept'].includes(p)&&(!currentUser||currentUser.role!=='departament')){toast('Acces interzis','err');return}if(['admin'].includes(p)&&(!currentUser||currentUser.role!=='admin')){toast('Acces interzis','err');return}go(p)}
    const nc=e.target.closest('[data-nid]');if(nc){e.preventDefault();go('article',nc.dataset.nid)}
    const rc=e.target.closest('[data-rid]');if(rc){e.preventDefault();openDetail(rc.dataset.rid)}
  });
  document.getElementById('hamburger').addEventListener('click',()=>document.getElementById('navMenu').classList.toggle('open'));
  window.addEventListener('scroll',()=>document.getElementById('navbar').classList.toggle('scrolled',scrollY>30));
  document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));t.classList.add('active');document.getElementById(t.dataset.tab).classList.add('active')}));
  document.getElementById('detailClose').addEventListener('click',closeDetail);
  document.getElementById('detailOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeDetail()});
  ['pfStatus','pfCat'].forEach(id=>document.getElementById(id).addEventListener('change',loadPrimarReports));
}

function go(page,extra){
  document.getElementById('navMenu').classList.remove('open');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-link[data-page]').forEach(a=>a.classList.toggle('active',a.dataset.page===page));
  const el=document.getElementById('page-'+page);if(el){el.classList.add('active');window.scrollTo({top:0,behavior:'smooth'})}
  if(page==='home')setTimeout(()=>{homeMap?.invalidateSize();loadHome()},150);
  if(page==='news')loadAllNews();
  if(page==='article')loadArticle(extra);
  if(page==='report')setTimeout(()=>{reportMap?.invalidateSize();loadMyReports()},150);
  if(page==='primar')loadPrimar();
  if(page==='dept')loadDept();
  if(page==='admin')loadAdmin();
  lucide.createIcons();
  if(ttsEnabled){const ann={'page-home':'Pagina principală','page-news':'Știri','page-login':'Autentificare','page-report':'Raportare','page-primar':'Biroul primarului','page-dept':'Departament','page-admin':'Administrare','page-contact':'Contact','page-about':'Despre Galați'};const a=ann['page-'+page];if(a)setTimeout(()=>speak(a),300)}
}

// ── MAPS ────────────────────────────────────────────────────────
function initMaps(){
  homeMap=L.map('homeMap').setView(GL,ZM);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(homeMap);loadMarkers(homeMap);
  reportMap=L.map('reportMap').setView(GL,ZM);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OSM'}).addTo(reportMap);
  reportMap.on('click',e=>{if(reportMarker)reportMarker.setLatLng(e.latlng);else{reportMarker=L.marker(e.latlng,{draggable:true,icon:mkI('red')}).addTo(reportMap);reportMarker.on('dragend',()=>{const p=reportMarker.getLatLng();setLoc(p.lat,p.lng)})}setLoc(e.latlng.lat,e.latlng.lng)});
  loadMarkers(reportMap);
}
function mkI(c){const cs={red:'#c0392b',amber:'#9e7d1a',orange:'#c66b18',green:'#27864a',blue:'#2563a8'}[c]||'#2563a8';return L.divIcon({className:'_',html:`<div style="width:24px;height:24px;background:${cs};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`,iconSize:[24,24],iconAnchor:[12,12],popupAnchor:[0,-14]})}
async function loadMarkers(map){try{const reps=await fetch('/api/reports').then(r=>r.json());reps.forEach(r=>{if(!r.latitude||!r.longitude)return;const sc=r.status==='rezolvat'?'green':r.status==='in_lucru'?'orange':'amber';L.marker([r.latitude,r.longitude],{icon:mkI(r.priority==='urgent'?'red':sc)}).addTo(map).bindPopup(`<div style="min-width:180px"><strong>${esc(r.title)}</strong><div style="font-size:.8rem;color:#5e6e82;margin:.25rem 0">${CAT[r.category]||r.category}</div><div style="font-size:.78rem;color:#94a3b8">${STAT[r.status]}${r.cerere_nr?' · Nr. '+r.cerere_nr:''}</div></div>`)})}catch(e){}}
function setLoc(lat,lng){document.getElementById('rLat').value=lat;document.getElementById('rLng').value=lng;document.getElementById('rAddr').value=`${lat.toFixed(5)}, ${lng.toFixed(5)}`;fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ro`).then(r=>r.json()).then(d=>{if(d.display_name)document.getElementById('rAddr').value=d.display_name.split(',').slice(0,3).join(',').trim()}).catch(()=>{})}

// ── HOME ────────────────────────────────────────────────────────
async function loadHome(){
  try{const s=await fetch('/api/reports/stats').then(r=>r.json());document.getElementById('sTotal').textContent=s.total;document.getElementById('sUrg').textContent=s.urgent;const gc=st=>(s.byStatus.find(x=>x.status===st)||{count:0}).count;document.getElementById('sRes').textContent=gc('rezolvat');document.getElementById('sProg').textContent=gc('in_lucru');
  const news=await fetch('/api/news').then(r=>r.json());document.getElementById('homeNews').innerHTML=news.slice(0,4).map(newsCard).join('')}catch(e){}}

function newsCard(n){return `<div class="ncard" data-nid="${n.id}">${n.image_url?`<div class="ncard-img" style="background-image:url(${n.image_url})"></div>`:''}<div class="ncard-body"><div class="ncard-cat">${esc(n.category)}</div><h3>${esc(n.title)}</h3><p>${esc(n.summary||n.content.substring(0,130)+'...')}</p><div class="ncard-date">${fmtD(n.created_at)}</div></div></div>`}
async function loadAllNews(){const n=await fetch('/api/news').then(r=>r.json());document.getElementById('allNews').innerHTML=n.map(newsCard).join('')}
async function loadArticle(id){const a=await fetch(`/api/news/${id}`).then(r=>r.json());document.getElementById('articleBody').innerHTML=`<div class="ncard-cat">${esc(a.category)}</div><h1>${esc(a.title)}</h1><div class="ameta">${fmtD(a.created_at)}</div>${a.image_url?`<img class="aimg" src="${a.image_url}">`:''}<div class="abody">${a.content.split('\n').map(p=>p.trim()?`<p>${esc(p)}</p>`:'').join('')}</div>`}

// ── FORMS ───────────────────────────────────────────────────────
function initForms(){
  const z=document.getElementById('uploadZone'),i=document.getElementById('rPhoto');z.addEventListener('click',()=>i.click());i.addEventListener('change',e=>{if(e.target.files[0]){const r=new FileReader();r.onload=ev=>{const p=document.getElementById('rPreview');p.src=ev.target.result;p.style.display='block'};r.readAsDataURL(e.target.files[0])}});
  document.getElementById('btnSubmitR').addEventListener('click',submitReport);
  document.getElementById('btnContact').addEventListener('click',submitContact);
  document.getElementById('btnAddNews').addEventListener('click',submitNews);
  document.getElementById('btnAddDept').addEventListener('click',submitDept);
  document.getElementById('btnAddUser').addEventListener('click',submitUser);
}

async function submitReport(){
  const t=document.getElementById('rTitle').value.trim(),d=document.getElementById('rDesc').value.trim(),c=document.getElementById('rCat').value,m=document.getElementById('reportMsg');
  if(!t||!d||!c)return showMsg(m,'Completați titlul, categoria și descrierea','err');
  const fd=new FormData();fd.append('type',document.getElementById('rType').value);fd.append('title',t);fd.append('description',d);fd.append('category',c);fd.append('priority',document.getElementById('rPri').value);
  ['rLat','rLng','rAddr'].forEach(id=>{const v=document.getElementById(id).value;if(v)fd.append(id==='rLat'?'latitude':id==='rLng'?'longitude':'address',v)});
  const ph=document.getElementById('rPhoto').files[0];if(ph)fd.append('photo',ph);
  const r=await api('/api/reports',{method:'POST',body:fd});const data=await r.json();
  if(r.ok){showMsg(m,`Sesizare trimisă! Nr. cerere: ${data.cerere_nr}`,'ok');toast(`Nr. cerere: ${data.cerere_nr}`,'ok');['rTitle','rDesc','rAddr','rLat','rLng'].forEach(id=>document.getElementById(id).value='');document.getElementById('rCat').value='';document.getElementById('rPri').value='normal';document.getElementById('rPhoto').value='';document.getElementById('rPreview').style.display='none';if(reportMarker){reportMap.removeLayer(reportMarker);reportMarker=null}loadMyReports();reportMap.eachLayer(l=>{if(l instanceof L.Marker)reportMap.removeLayer(l)});loadMarkers(reportMap)}
  else showMsg(m,data.error||'Eroare','err');
}

async function loadMyReports(){const reps=await fetch('/api/reports').then(r=>r.json());const el=document.getElementById('myReports');el.innerHTML=reps.length?reps.map(r=>`<div class="rp-item" data-rid="${r.id}"><div class="rp-dot dot-${r.status}"></div><div><div class="rp-title">${esc(r.title)}</div><div class="rp-meta">${r.cerere_nr||''} · ${STAT[r.status]||r.status} · ${fmtD(r.created_at)}</div></div></div>`).join(''):'<p style="padding:.85rem;text-align:center;color:var(--muted)">Nicio sesizare</p>'}

async function submitContact(){const n=document.getElementById('cName').value.trim(),e=document.getElementById('cEmail').value.trim(),s=document.getElementById('cSubject').value.trim(),msg=document.getElementById('cMessage').value.trim(),m=document.getElementById('contactMsg');if(!n||!e||!msg)return showMsg(m,'Câmpuri obligatorii','err');const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,subject:s,message:msg})});r.ok?(showMsg(m,'Trimis!','ok'),toast('Mesaj trimis!','ok'),['cName','cEmail','cSubject','cMessage'].forEach(id=>document.getElementById(id).value='')):showMsg(m,'Eroare','err')}

// ── DETAIL MODAL ────────────────────────────────────────────────
async function openDetail(id){
  try{
    const r=await api(`/api/reports/${id}`).then(x=>x.json());
    const isPrimar=currentUser&&['primar','admin'].includes(currentUser.role);
    const isDept=currentUser&&currentUser.role==='departament';
    let h=`<div class="detail">`;
    h+=`<div class="cerere-box"><strong>Nr. Cerere: ${esc(r.cerere_nr||'—')}</strong> <span style="color:var(--muted);font-size:.85rem">din ${fmtD(r.cerere_date||r.created_at)}</span></div>`;
    h+=`<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.35rem"><span class="badge b-${r.status}">${STAT[r.status]||r.status}</span><span class="badge ${r.priority==='urgent'?'b-urgent':'b-normal'}">${r.priority==='urgent'?'🔴 Urgent':'Normal'}</span><span style="font-size:.78rem;color:var(--light)">${r.type==='serviciu'?'Cerere serviciu':'Sesizare'}</span></div>`;
    h+=`<h2>${esc(r.title)}</h2><div class="detail-meta"><span>${CAT[r.category]||r.category}</span><span>📅 ${fmtD(r.created_at)}</span>${r.author_name?`<span>👤 ${esc(r.author_name)}</span>`:''}${r.address?`<span>📍 ${esc(r.address)}</span>`:''}${r.dept_name?`<span>🏢 ${esc(r.dept_name)}</span>`:''}</div>`;
    if(r.photo_path)h+=`<img src="${r.photo_path}" class="detail-photo">`;
    h+=`<div class="detail-desc">${esc(r.description)}</div>`;
    if(r.latitude&&r.longitude)h+=`<div id="dMap" class="detail-map"></div>`;
    if(r.rezolutie)h+=`<div class="detail-section"><h4>📋 Rezoluția Primarului</h4><p style="color:var(--text)">${esc(r.rezolutie)}</p></div>`;
    if(r.department_notes)h+=`<div class="detail-section"><h4>📝 Note departament</h4><p style="color:var(--text)">${esc(r.department_notes)}</p></div>`;
    // Primar: assign to department
    if(isPrimar){
      if(!allDepts.length)allDepts=await fetch('/api/departments').then(r=>r.json());
      h+=`<div class="detail-section" style="margin-top:1rem"><h4>⚙️ Redirecționare către departament</h4><div class="form-stack">`;
      h+=`<div class="dept-checks" id="deptChecks">`;
      allDepts.forEach(d=>{h+=`<label class="dept-check ${r.department_id===d.id?'selected':''}"><input type="radio" name="assignDept" value="${d.id}" ${r.department_id===d.id?'checked':''}> ${esc(d.name)}</label>`});
      h+=`</div>`;
      h+=`<div class="field"><label>Rezoluție primar</label><textarea id="dRezolutie" rows="2">${esc(r.rezolutie||'')}</textarea></div>`;
      h+=`<div class="form-2col"><div class="field"><label>Prioritate</label><select id="dPri"><option value="normal" ${r.priority==='normal'?'selected':''}>Normal</option><option value="urgent" ${r.priority==='urgent'?'selected':''}>Urgent</option></select></div><div></div></div>`;
      h+=`<div style="display:flex;gap:.6rem"><button class="btn btn-gold" onclick="assignReport(${r.id})"><i data-lucide="send" style="width:16px;height:16px"></i> Redirecționează</button><button class="btn btn-danger btn-sm" onclick="delReport(${r.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></div></div></div>`;
    }
    // Dept: update status
    if(isDept){
      h+=`<div class="detail-section" style="margin-top:1rem"><h4>⚙️ Actualizare status</h4><div class="form-stack">`;
      h+=`<div class="form-2col"><div class="field"><label>Status</label><select id="dStatus"><option value="in_lucru" ${r.status==='in_lucru'?'selected':''}>În lucru</option><option value="rezolvat" ${r.status==='rezolvat'?'selected':''}>Rezolvat</option></select></div><div></div></div>`;
      h+=`<div class="field"><label>Note departament</label><textarea id="dNotes" rows="2">${esc(r.department_notes||'')}</textarea></div>`;
      h+=`<button class="btn btn-gold" onclick="updateDept(${r.id})"><i data-lucide="save" style="width:16px;height:16px"></i> Salvează</button></div></div>`;
    }
    h+=`</div>`;
    document.getElementById('detailBody').innerHTML=h;document.getElementById('detailOverlay').classList.add('open');lucide.createIcons();
    // Dept check highlight
    document.querySelectorAll('.dept-check input[type="radio"]').forEach(inp=>inp.addEventListener('change',()=>{document.querySelectorAll('.dept-check').forEach(c=>c.classList.remove('selected'));inp.closest('.dept-check').classList.add('selected')}));
    if(r.latitude&&r.longitude)setTimeout(()=>{if(detailMap){detailMap.remove();detailMap=null}detailMap=L.map('dMap').setView([r.latitude,r.longitude],16);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'©OSM'}).addTo(detailMap);L.marker([r.latitude,r.longitude],{icon:mkI(r.priority==='urgent'?'red':'blue')}).addTo(detailMap)},200);
  }catch(e){toast('Eroare','err');console.error(e)}
}
function closeDetail(){document.getElementById('detailOverlay').classList.remove('open');if(detailMap){detailMap.remove();detailMap=null}}
window.assignReport=async function(id){const dept=document.querySelector('input[name="assignDept"]:checked')?.value;const rez=document.getElementById('dRezolutie')?.value;const pri=document.getElementById('dPri')?.value;if(!dept)return toast('Selectați un departament','err');await api(`/api/reports/${id}/assign`,{method:'PATCH',body:{department_id:parseInt(dept),rezolutie:rez,priority:pri}});toast('Redirecționat!','ok');closeDetail();loadPrimar()};
window.updateDept=async function(id){await api(`/api/reports/${id}/dept`,{method:'PATCH',body:{status:document.getElementById('dStatus').value,department_notes:document.getElementById('dNotes').value}});toast('Actualizat!','ok');closeDetail();loadDept()};
window.delReport=async function(id){if(!confirm('Sigur?'))return;await api(`/api/reports/${id}`,{method:'DELETE'});toast('Șters','info');closeDetail();if(currentUser?.role==='primar')loadPrimar()};

// ── PRIMAR ──────────────────────────────────────────────────────
async function loadPrimar(){await Promise.all([loadPrimarStats(),loadPrimarReports(),loadPrimarNews(),loadPrimarMsgs()])}
async function loadPrimarStats(){const s=await fetch('/api/reports/stats').then(r=>r.json());document.getElementById('psTotal').textContent=s.total;document.getElementById('psUnassigned').textContent=s.unassigned;document.getElementById('psUrg').textContent=s.urgent;const gc=st=>(s.byStatus.find(x=>x.status===st)||{count:0}).count;document.getElementById('psProg').textContent=gc('in_lucru');document.getElementById('psDone').textContent=gc('rezolvat')}
async function loadPrimarReports(){
  const st=document.getElementById('pfStatus').value,ca=document.getElementById('pfCat').value;
  let u='/api/reports?';if(st)u+=`status=${st}&`;if(ca)u+=`category=${ca}&`;
  const reps=await fetch(u).then(r=>r.json());
  document.getElementById('pReportsBody').innerHTML=reps.map(r=>`<tr data-rid="${r.id}"><td><strong>${esc(r.cerere_nr||'—')}</strong></td><td><div style="font-weight:600">${esc(r.title)}</div><div style="font-size:.72rem;color:var(--light)">${esc(r.address||'')}</div></td><td style="font-size:.78rem">${r.type==='serviciu'?'🔧':'🚨'}</td><td>${CAT[r.category]||r.category}</td><td><span class="badge ${r.priority==='urgent'?'b-urgent':'b-normal'}">${r.priority==='urgent'?'Urgent':'—'}</span></td><td><span class="badge b-${r.status}">${STAT[r.status]||r.status}</span></td><td style="font-size:.78rem">${esc(r.dept_name||'<em>Neasignat</em>')}</td><td style="font-size:.78rem">${fmtD(r.created_at)}</td></tr>`).join('');lucide.createIcons()}
async function loadPrimarNews(){const n=await fetch('/api/news').then(r=>r.json());document.getElementById('pNewsList').innerHTML=n.map(x=>`<div class="acard"><div><h4>${esc(x.title)}</h4><div class="meta">${x.category} · ${fmtD(x.created_at)}</div></div><button class="btn btn-danger btn-sm" onclick="event.stopPropagation();delNews(${x.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></div>`).join('');lucide.createIcons()}
async function loadPrimarMsgs(){const ms=await api('/api/contact').then(r=>r.json());document.getElementById('pMsgsList').innerHTML=ms.length?ms.map(m=>`<div class="acard"><div><h4>${esc(m.subject||'Fără subiect')}</h4><p>${esc(m.message)}</p><div class="meta">${esc(m.name)} · ${fmtD(m.created_at)}</div></div></div>`).join(''):'<p style="text-align:center;color:var(--muted);padding:1.5rem">Niciun mesaj</p>'}
async function submitNews(){const t=document.getElementById('nTitle').value.trim(),c=document.getElementById('nContent').value.trim();if(!t||!c)return toast('Titlu+conținut','err');const r=await api('/api/news',{method:'POST',body:{title:t,summary:document.getElementById('nSummary').value.trim(),content:c,category:document.getElementById('nCat').value,image_url:document.getElementById('nImg').value.trim()}});if(r.ok){toast('Publicată!','ok');['nTitle','nSummary','nContent','nImg'].forEach(id=>document.getElementById(id).value='');loadPrimarNews()}}
window.delNews=async function(id){if(!confirm('Sigur?'))return;await api(`/api/news/${id}`,{method:'DELETE'});toast('Șters','info');loadPrimarNews()};

// ── DEPARTMENT ──────────────────────────────────────────────────
async function loadDept(){
  const s=await api('/api/reports/stats').then(r=>r.json());document.getElementById('dsTotal').textContent=s.total;document.getElementById('dsUrg').textContent=s.urgent;const gc=st=>(s.byStatus.find(x=>x.status===st)||{count:0}).count;document.getElementById('dsProg').textContent=gc('in_lucru');document.getElementById('dsDone').textContent=gc('rezolvat');
  const reps=await api('/api/reports').then(r=>r.json());
  document.getElementById('dReportsBody').innerHTML=reps.map(r=>`<tr data-rid="${r.id}"><td><strong>${esc(r.cerere_nr||'—')}</strong></td><td><div style="font-weight:600">${esc(r.title)}</div></td><td><span class="badge ${r.priority==='urgent'?'b-urgent':'b-normal'}">${r.priority==='urgent'?'Urgent':'—'}</span></td><td><span class="badge b-${r.status}">${STAT[r.status]||r.status}</span></td><td style="font-size:.78rem">${esc(r.address||'—')}</td><td style="font-size:.78rem">${fmtD(r.created_at)}</td></tr>`).join('');lucide.createIcons()}

// ── ADMIN ───────────────────────────────────────────────────────
async function loadAdmin(){await Promise.all([loadAdminDepts(),loadAdminUsers()])}
async function loadAdminDepts(){const ds=await fetch('/api/departments').then(r=>r.json());allDepts=ds;document.getElementById('aDeptsList').innerHTML=ds.map(d=>`<div class="acard"><div><h4>${esc(d.name)}</h4><p>${esc(d.description||'')}</p></div><button class="btn btn-danger btn-sm" onclick="event.stopPropagation();delDept(${d.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></div>`).join('');
  // Update dept select in user form
  const sel=document.getElementById('auDept');sel.innerHTML='<option value="">— Niciunul —</option>'+ds.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');lucide.createIcons()}
async function loadAdminUsers(){const us=await api('/api/users').then(r=>r.json());document.getElementById('aUsersList').innerHTML=us.map(u=>`<div class="acard"><div><h4>${esc(u.full_name||u.username)}</h4><p>${u.role}${u.dept_name?' · '+u.dept_name:''} · ${u.email}</p></div>${u.role!=='admin'?`<button class="btn btn-danger btn-sm" onclick="event.stopPropagation();delUser(${u.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>`:''}</div>`).join('');lucide.createIcons()}
async function submitDept(){const n=document.getElementById('adName').value.trim();if(!n)return toast('Nume obligatoriu','err');await api('/api/departments',{method:'POST',body:{name:n,description:document.getElementById('adDesc').value.trim()}});toast('Adăugat!','ok');document.getElementById('adName').value='';document.getElementById('adDesc').value='';loadAdminDepts()}
async function submitUser(){const u=document.getElementById('auUser').value.trim(),e=document.getElementById('auEmail').value.trim(),p=document.getElementById('auPass').value;if(!u||!e||!p)return toast('Câmpuri obligatorii','err');const r=await api('/api/users',{method:'POST',body:{username:u,email:e,password:p,full_name:document.getElementById('auName').value.trim(),role:document.getElementById('auRole').value,department_id:document.getElementById('auDept').value||null}});if(r.ok){toast('Adăugat!','ok');['auUser','auEmail','auPass','auName'].forEach(id=>document.getElementById(id).value='');loadAdminUsers()}else{const d=await r.json();toast(d.error||'Eroare','err')}}
window.delDept=async function(id){if(!confirm('Sigur?'))return;await api(`/api/departments/${id}`,{method:'DELETE'});toast('Șters','info');loadAdminDepts()};
window.delUser=async function(id){if(!confirm('Sigur?'))return;await api(`/api/users/${id}`,{method:'DELETE'});toast('Șters','info');loadAdminUsers()};

// ── CHAT ────────────────────────────────────────────────────────
let chatHist=[],chatOpen=false;
function initChat(){
  document.getElementById('chatFab').addEventListener('click',()=>{chatOpen=!chatOpen;document.getElementById('chatPanel').classList.toggle('open',chatOpen);if(chatOpen)document.getElementById('chatInput').focus()});
  document.getElementById('chatClose').addEventListener('click',()=>{chatOpen=false;document.getElementById('chatPanel').classList.remove('open')});
  document.getElementById('chatSend').addEventListener('click',sendChat);document.getElementById('chatInput').addEventListener('keydown',e=>{if(e.key==='Enter')sendChat()});
}
async function sendChat(){const inp=document.getElementById('chatInput'),m=inp.value.trim();if(!m)return;inp.value='';addChat(m,'user');chatHist.push({role:'user',content:m});
  const ty=document.createElement('div');ty.className='chat-msg chat-bot';ty.innerHTML='<div class="chat-typing"><span></span><span></span><span></span></div>';document.getElementById('chatMsgs').appendChild(ty);scrollChat();
  try{const r=await fetch('/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m,history:chatHist.slice(-8)})});const d=await r.json();ty.remove();addChat(d.reply,'bot');chatHist.push({role:'assistant',content:d.reply});if(ttsEnabled)speak(d.reply)}catch(e){ty.remove();addChat('Eroare conexiune.','bot')}}
function addChat(t,w){const c=document.getElementById('chatMsgs'),d=document.createElement('div');d.className=`chat-msg chat-${w}`;d.innerHTML=`<div class="chat-bbl">${esc(t)}</div>`;c.appendChild(d);scrollChat()}
function scrollChat(){const c=document.getElementById('chatMsgs');c.scrollTop=c.scrollHeight}

// ── A11Y ────────────────────────────────────────────────────────
let a11yMode=false,ttsEnabled=false,synth=window.speechSynthesis;
function initA11y(){
  const ov=document.getElementById('a11yOverlay'),tg=document.getElementById('a11yToggle');
  const saved=localStorage.getItem('a11y');
  if(saved==='true'){ov.classList.add('hidden');enableA11y()}else if(saved==='false')ov.classList.add('hidden');
  document.addEventListener('keydown',e=>{if(!ov.classList.contains('hidden')){if(e.code==='Space'){e.preventDefault();ov.classList.add('hidden');localStorage.setItem('a11y','true');enableA11y();speak('Mod accesibil activat. Folosiți Tab pentru navigare.')}else if(e.code==='KeyX'){e.preventDefault();ov.classList.add('hidden');localStorage.setItem('a11y','false')}}});
  document.getElementById('optA11y').addEventListener('click',()=>{ov.classList.add('hidden');localStorage.setItem('a11y','true');enableA11y();speak('Mod accesibil activat.')});
  document.getElementById('optStd').addEventListener('click',()=>{ov.classList.add('hidden');localStorage.setItem('a11y','false')});
  tg.addEventListener('click',()=>{if(a11yMode){disableA11y();speak('Dezactivat.');setTimeout(()=>{synth.cancel();ttsEnabled=false},1500)}else{enableA11y();speak('Mod accesibil activat.')}});
  if(synth){synth.getVoices();synth.onvoiceschanged=()=>synth.getVoices()}
}
function enableA11y(){a11yMode=true;ttsEnabled=true;document.body.classList.add('a11y-mode');document.getElementById('a11yToggle').classList.add('active');document.getElementById('voiceInd').classList.add('active');document.addEventListener('focusin',a11yFocus)}
function disableA11y(){a11yMode=false;ttsEnabled=false;synth.cancel();document.body.classList.remove('a11y-mode');document.getElementById('a11yToggle').classList.remove('active');document.getElementById('voiceInd').classList.remove('active');document.removeEventListener('focusin',a11yFocus);localStorage.setItem('a11y','false')}
function a11yFocus(e){if(!ttsEnabled)return;const el=e.target;let t='';const al=el.getAttribute('aria-label');
  if(al)t=al;else if(el.tagName==='INPUT'||el.tagName==='TEXTAREA'){const l=el.closest('.field')?.querySelector('label')?.textContent||'';t=`Câmp: ${l}. ${el.value?'Valoare: '+el.value:el.placeholder||''}`}
  else if(el.tagName==='SELECT'){const l=el.closest('.field')?.querySelector('label')?.textContent||'';t=`Selector: ${l}. Selectat: ${el.options[el.selectedIndex]?.textContent||''}`}
  else if(el.tagName==='BUTTON'||el.classList.contains('btn'))t=`Buton: ${el.textContent.trim()}`;
  else if(el.classList.contains('nav-link'))t=`Link: ${el.textContent.trim()}`;
  else if(el.classList.contains('ncard')){t=`Știre: ${el.querySelector('h3')?.textContent||''}`}
  else t=el.textContent?.trim()?.substring(0,120)||'';
  if(t)speak(t)}
function speak(t){if(!ttsEnabled||!synth)return;synth.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='ro-RO';u.rate=.95;const v=synth.getVoices().find(v=>v.lang.startsWith('ro'));if(v)u.voice=v;synth.speak(u)}

// ── UTILS ───────────────────────────────────────────────────────
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML}
function fmtD(d){return d?new Date(d).toLocaleDateString('ro-RO',{year:'numeric',month:'short',day:'numeric'}):''}
function showMsg(el,m,t){el.className='msg '+t;el.textContent=m;el.style.display='block';setTimeout(()=>el.style.display='none',6000)}
function toast(m,t='info'){const c=document.getElementById('toasts'),d=document.createElement('div');d.className=`toast toast-${t}`;d.textContent=m;c.appendChild(d);setTimeout(()=>{d.style.opacity='0';d.style.transform='translateX(80px)';d.style.transition='.3s';setTimeout(()=>d.remove(),300)},3500)}
