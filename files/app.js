/* Primăria Galați v5 */
let homeMap, reportMap, detailMap, reportMarker = null;
let currentUser = null, token = localStorage.getItem('token'), allDepts = [];
const GL = [45.4353, 28.0080], ZM = 14;
const CAT = {drum:'Drum',iluminat:'Iluminat',salubritate:'Salubritate',spatii_verzi:'Spații Verzi',mobilier_urban:'Mobilier Urban',canalizare:'Canalizare',constructii:'Construcții',altele:'Altele'};
const STAT = {nou:'Nou',in_lucru:'În lucru',rezolvat:'Rezolvat',redirectionat:'Redirecționat'};

async function api(u,o={}){const h={...(o.headers||{})};if(token)h['x-auth-token']=token;if(o.body&&!(o.body instanceof FormData)){h['Content-Type']='application/json';o.body=JSON.stringify(o.body);}return fetch(u,{...o,headers:h});}
function esc(s){if(!s)return'';const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
function fmtD(d){return d?new Date(d).toLocaleDateString('ro-RO',{year:'numeric',month:'short',day:'numeric'}):'';}
function showMsg(el,m,t){el.className='msg '+t;el.textContent=m;el.style.display='block';setTimeout(()=>el.style.display='none',6000);}
window.toast=function(m,t){const c=document.getElementById('toasts'),d=document.createElement('div');d.className='toast toast-'+(t||'info');d.textContent=m;c.appendChild(d);setTimeout(()=>{d.style.opacity='0';d.style.transition='.3s';setTimeout(()=>d.remove(),300);},3500);};

document.addEventListener('DOMContentLoaded',()=>{
  checkAuth();initMaps();loadHome();
  fetch('/api/departments').then(r=>r.json()).then(d=>{allDepts=d}).catch(()=>{});
});

/* ═══ NAVIGATION ═══ */
window.go=function(pg,extra){
  document.getElementById('navMenu').classList.remove('open');
  if(pg==='report'&&!currentUser){go('login');return;}
  if(pg==='primar'&&(!currentUser||!['primar','admin'].includes(currentUser.role))){toast('Acces interzis','err');return;}
  if(pg==='dept'&&(!currentUser||currentUser.role!=='departament')){toast('Acces interzis','err');return;}
  if(pg==='admin'&&(!currentUser||currentUser.role!=='admin')){toast('Acces interzis','err');return;}
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('active'));
  const el=document.getElementById('pg-'+pg);
  if(el){el.classList.add('active');window.scrollTo({top:0,behavior:'smooth'});}
  if(pg==='home')setTimeout(()=>{homeMap&&homeMap.invalidateSize();loadHome()},200);
  if(pg==='news')loadAllNews();
  if(pg==='article')loadArticle(extra);
  if(pg==='report')setTimeout(()=>{reportMap&&reportMap.invalidateSize();loadMyReports()},200);
  if(pg==='primar')loadPrimar();
  if(pg==='dept')loadDept();
  if(pg==='admin')loadAdmin();
};

/* ═══ AUTH ═══ */
function checkAuth(){if(token)api('/api/auth/me').then(r=>r.ok?r.json():Promise.reject()).then(d=>setUser(d.user)).catch(clearUser);}
window.onAuthClick=function(){if(currentUser){api('/api/auth/logout',{method:'POST'}).catch(()=>{});clearUser();toast('Deconectat','info');go('home');}else go('login');};
window.switchTab=function(t,btn){document.querySelectorAll('#pg-login .tab').forEach(b=>b.classList.remove('active'));document.querySelectorAll('#pg-login .tab-body').forEach(p=>p.classList.remove('active'));btn.classList.add('active');document.getElementById('tab-'+t).classList.add('active');};
window.doLogin=async function(){const u=document.getElementById('liUser').value.trim(),p=document.getElementById('liPass').value,m=document.getElementById('loginMsg');if(!u||!p){showMsg(m,'Completați ambele câmpuri','err');return;}const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});const d=await r.json();if(!r.ok){showMsg(m,d.error,'err');return;}token=d.token;localStorage.setItem('token',token);setUser(d.user);toast('Bine ați venit!','ok');if(d.user.role==='primar')go('primar');else if(d.user.role==='departament')go('dept');else if(d.user.role==='admin')go('admin');else go('report');};
window.doRegister=async function(){const u=document.getElementById('ruUser').value.trim(),e=document.getElementById('ruEmail').value.trim(),p=document.getElementById('ruPass').value,n=document.getElementById('ruName').value.trim(),m=document.getElementById('regMsg');if(!u||!e||!p){showMsg(m,'Completați câmpurile','err');return;}const r=await fetch('/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,email:e,password:p,full_name:n})});const d=await r.json();if(!r.ok){showMsg(m,d.error,'err');return;}token=d.token;localStorage.setItem('token',token);setUser(d.user);toast('Cont creat!','ok');go('report');};

function setUser(u){currentUser=u;document.getElementById('authLabel').textContent=u.full_name||u.username;document.getElementById('navReport').style.display=['cetatean','admin'].includes(u.role)?'':'none';document.getElementById('navPrimar').style.display=['primar','admin'].includes(u.role)?'':'none';document.getElementById('navDept').style.display=u.role==='departament'?'':'none';document.getElementById('navAdmin').style.display=u.role==='admin'?'':'none';if(u.role==='departament'&&u.department)document.getElementById('deptTitle').textContent=u.department.name;}
function clearUser(){currentUser=null;token=null;localStorage.removeItem('token');document.getElementById('authLabel').textContent='Autentificare';['navReport','navPrimar','navDept','navAdmin'].forEach(id=>document.getElementById(id).style.display='none');}

/* ═══ MAPS ═══ */
function initMaps(){
  homeMap=L.map('homeMap').setView(GL,ZM);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(homeMap);loadMarkers(homeMap);
  reportMap=L.map('reportMap').setView(GL,ZM);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(reportMap);
  reportMap.on('click',function(e){if(reportMarker)reportMarker.setLatLng(e.latlng);else reportMarker=L.marker(e.latlng,{draggable:true}).addTo(reportMap);document.getElementById('rLat').value=e.latlng.lat;document.getElementById('rLng').value=e.latlng.lng;document.getElementById('rAddr').value=e.latlng.lat.toFixed(4)+', '+e.latlng.lng.toFixed(4);fetch('https://nominatim.openstreetmap.org/reverse?lat='+e.latlng.lat+'&lon='+e.latlng.lng+'&format=json&accept-language=ro').then(r=>r.json()).then(d=>{if(d.display_name)document.getElementById('rAddr').value=d.display_name.split(',').slice(0,3).join(',').trim()}).catch(()=>{});});
  loadMarkers(reportMap);
}
async function loadMarkers(map){try{const reps=await fetch('/api/reports').then(r=>r.json());reps.forEach(r=>{if(!r.latitude||!r.longitude)return;L.marker([r.latitude,r.longitude]).addTo(map).bindPopup('<b>'+esc(r.title)+'</b><br>'+(CAT[r.category]||r.category)+'<br><small>'+(STAT[r.status]||r.status)+'</small>');});}catch(e){}}

/* ═══ HOME & NEWS ═══ */
async function loadHome(){try{const s=await fetch('/api/reports/stats').then(r=>r.json());document.getElementById('sTotal').textContent=s.total;document.getElementById('sUrg').textContent=s.urgent;const gc=st=>(s.byStatus.find(x=>x.status===st)||{count:0}).count;document.getElementById('sRes').textContent=gc('rezolvat');document.getElementById('sProg').textContent=gc('in_lucru');const news=await fetch('/api/news').then(r=>r.json());document.getElementById('homeNews').innerHTML=news.slice(0,3).map(nc).join('');}catch(e){}}
function nc(n){return '<div class="nc" onclick="go(\'article\',\''+n.id+'\')">'+(n.image_url?'<div class="nc-img" style="background-image:url('+n.image_url+')"></div>':'')+'<div class="nc-body"><div class="nc-cat">'+esc(n.category)+'</div><h3>'+esc(n.title)+'</h3><p>'+esc(n.summary||n.content.substring(0,120)+'...')+'</p><div class="nc-date">'+fmtD(n.created_at)+'</div></div></div>';}
async function loadAllNews(){const n=await fetch('/api/news').then(r=>r.json());document.getElementById('allNews').innerHTML=n.map(nc).join('');}
async function loadArticle(id){const a=await fetch('/api/news/'+id).then(r=>r.json());document.getElementById('articleBody').innerHTML='<div class="nc-cat">'+esc(a.category)+'</div><h2>'+esc(a.title)+'</h2><p style="color:var(--light);font-size:.85rem;margin-bottom:1.5rem">'+fmtD(a.created_at)+'</p>'+(a.image_url?'<img src="'+a.image_url+'" style="width:100%;height:260px;object-fit:cover;border-radius:8px;margin-bottom:1.5rem">':'')+'<div style="line-height:1.9">'+a.content.split('\n').map(p=>p.trim()?'<p>'+esc(p)+'</p>':'').join('')+'</div>';}

/* ═══ REPORT ═══ */
window.submitReport=async function(){const t=document.getElementById('rTitle').value.trim(),d=document.getElementById('rDesc').value.trim(),c=document.getElementById('rCat').value,m=document.getElementById('reportMsg');if(!t||!d||!c){showMsg(m,'Completați titlul, categoria și descrierea','err');return;}const fd=new FormData();fd.append('type',document.getElementById('rType').value);fd.append('title',t);fd.append('description',d);fd.append('category',c);fd.append('priority',document.getElementById('rPri').value);if(document.getElementById('rLat').value)fd.append('latitude',document.getElementById('rLat').value);if(document.getElementById('rLng').value)fd.append('longitude',document.getElementById('rLng').value);if(document.getElementById('rAddr').value)fd.append('address',document.getElementById('rAddr').value);const ph=document.getElementById('rPhoto').files[0];if(ph)fd.append('photo',ph);const r=await api('/api/reports',{method:'POST',body:fd});const data=await r.json();if(r.ok){showMsg(m,'Sesizare trimisă! Nr: '+data.cerere_nr,'ok');toast('Nr: '+data.cerere_nr,'ok');['rTitle','rDesc','rAddr','rLat','rLng'].forEach(id=>document.getElementById(id).value='');document.getElementById('rCat').value='';document.getElementById('rPhoto').value='';if(reportMarker){reportMap.removeLayer(reportMarker);reportMarker=null;}loadMyReports();}else showMsg(m,data.error||'Eroare','err');};
async function loadMyReports(){const reps=await fetch('/api/reports').then(r=>r.json());const el=document.getElementById('myReports');el.innerHTML=reps.length?reps.map(r=>'<div class="ri" onclick="openDetail('+r.id+')"><div class="ri-t">'+esc(r.title)+'</div><div class="ri-m">'+(r.cerere_nr||'')+' · '+(STAT[r.status]||r.status)+' · '+fmtD(r.created_at)+'</div></div>').join(''):'<p style="padding:1rem;text-align:center;color:var(--light)">Nicio sesizare</p>';}
window.submitContact=async function(){const n=document.getElementById('cName').value.trim(),e=document.getElementById('cEmail').value.trim(),msg=document.getElementById('cMessage').value.trim(),m=document.getElementById('contactMsg');if(!n||!e||!msg){showMsg(m,'Completați câmpurile obligatorii','err');return;}const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,email:e,subject:document.getElementById('cSubject').value.trim(),message:msg})});if(r.ok){showMsg(m,'Mesaj trimis!','ok');toast('Trimis!','ok');['cName','cEmail','cSubject','cMessage'].forEach(id=>document.getElementById(id).value='');}else showMsg(m,'Eroare','err');};

/* ═══ DETAIL MODAL ═══ */
window.openDetail=async function(id){try{const r=await api('/api/reports/'+id).then(x=>x.json());const isP=currentUser&&['primar','admin'].includes(currentUser.role),isD=currentUser&&currentUser.role==='departament';let h='<h2>'+esc(r.title)+'</h2><p><span class="badge b-'+r.status+'">'+(STAT[r.status]||r.status)+'</span> · '+(r.priority==='urgent'?'🔴 Urgent':'Normal')+' · Nr: '+(r.cerere_nr||'—')+'</p><p style="color:var(--dim);font-size:.88rem">'+(CAT[r.category]||r.category)+' · '+fmtD(r.created_at)+(r.author_name?' · '+esc(r.author_name):'')+(r.address?' · 📍 '+esc(r.address):'')+'</p>';if(r.photo_path)h+='<img src="'+r.photo_path+'" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin:1rem 0">';h+='<p style="line-height:1.85;margin:1rem 0">'+esc(r.description)+'</p>';if(r.latitude&&r.longitude)h+='<div id="dMap" class="detail-map"></div>';if(r.dept_name)h+='<p style="font-size:.88rem"><strong>Departament:</strong> '+esc(r.dept_name)+'</p>';if(r.rezolutie)h+='<div class="detail-sec"><h4>Rezoluția primarului</h4><p>'+esc(r.rezolutie)+'</p></div>';if(r.department_notes)h+='<div class="detail-sec"><h4>Note departament</h4><p>'+esc(r.department_notes)+'</p></div>';
  if(isP){if(!allDepts.length)allDepts=await fetch('/api/departments').then(x=>x.json());h+='<div class="detail-sec"><h4>Redirecționare</h4><div class="dept-grid">'+allDepts.map(d=>'<label class="dept-opt"><input type="radio" name="asDept" value="'+d.id+'"'+(r.department_id===d.id?' checked':'')+'>'+esc(d.name)+'</label>').join('')+'</div><div class="f" style="margin-top:.5rem"><label>Rezoluție</label><textarea id="dRez" rows="2">'+esc(r.rezolutie||'')+'</textarea></div><div style="display:flex;gap:.5rem;margin-top:.5rem"><button class="btn gold" onclick="assignReport('+r.id+')">Redirecționează →</button><button class="danger" onclick="delReport('+r.id+')">Șterge</button></div></div>';}
  if(isD){h+='<div class="detail-sec"><h4>Actualizare</h4><div class="f"><label>Status</label><select id="dStat"><option value="in_lucru"'+(r.status==='in_lucru'?' selected':'')+'>În lucru</option><option value="rezolvat"'+(r.status==='rezolvat'?' selected':'')+'>Rezolvat</option></select></div><div class="f"><label>Note</label><textarea id="dNotes" rows="2">'+esc(r.department_notes||'')+'</textarea></div><button class="btn gold" onclick="updateDept('+r.id+')">Salvează</button></div>';}
  document.getElementById('modalBody').innerHTML=h;document.getElementById('modal').classList.add('open');if(r.latitude&&r.longitude)setTimeout(()=>{if(detailMap){detailMap.remove();detailMap=null;}detailMap=L.map('dMap').setView([r.latitude,r.longitude],16);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'©OSM'}).addTo(detailMap);L.marker([r.latitude,r.longitude]).addTo(detailMap);},300);}catch(e){toast('Eroare','err');}};
window.closeDetail=function(){document.getElementById('modal').classList.remove('open');if(detailMap){detailMap.remove();detailMap=null;}};
window.assignReport=async function(id){const d=document.querySelector('input[name="asDept"]:checked')?.value;if(!d){toast('Selectați departament','err');return;}await api('/api/reports/'+id+'/assign',{method:'PATCH',body:{department_id:parseInt(d),rezolutie:document.getElementById('dRez')?.value}});toast('Redirecționat!','ok');closeDetail();loadPrimar();};
window.updateDept=async function(id){await api('/api/reports/'+id+'/dept',{method:'PATCH',body:{status:document.getElementById('dStat').value,department_notes:document.getElementById('dNotes').value}});toast('Actualizat!','ok');closeDetail();loadDept();};
window.delReport=async function(id){if(!confirm('Sigur?'))return;await api('/api/reports/'+id,{method:'DELETE'});toast('Șters','info');closeDetail();loadPrimar();};

/* ═══ PRIMAR ═══ */
async function loadPrimar(){const s=await fetch('/api/reports/stats').then(r=>r.json());document.getElementById('psTotal').textContent=s.total;document.getElementById('psUnassigned').textContent=s.unassigned;document.getElementById('psUrg').textContent=s.urgent;loadPrimarReports();loadPrimarNews();}
window.loadPrimarReports=async function(){const st=document.getElementById('pfStatus').value;let u='/api/reports?';if(st)u+='status='+st;const reps=await fetch(u).then(r=>r.json());document.getElementById('pReportsBody').innerHTML=reps.map(r=>'<tr onclick="openDetail('+r.id+')"><td><strong>'+esc(r.cerere_nr||'—')+'</strong></td><td>'+esc(r.title)+'</td><td>'+(CAT[r.category]||r.category)+'</td><td><span class="badge b-'+r.status+'">'+(STAT[r.status]||r.status)+'</span></td><td>'+esc(r.dept_name||'—')+'</td><td>'+fmtD(r.created_at)+'</td></tr>').join('');};
async function loadPrimarNews(){const n=await fetch('/api/news').then(r=>r.json());document.getElementById('pNewsList').innerHTML=n.map(x=>'<div class="li"><span>'+esc(x.title)+'</span><button class="danger" onclick="event.stopPropagation();delNews('+x.id+')">Șterge</button></div>').join('');}
window.submitNews=async function(){const t=document.getElementById('nTitle').value.trim(),c=document.getElementById('nContent').value.trim();if(!t||!c){toast('Titlu+conținut','err');return;}await api('/api/news',{method:'POST',body:{title:t,content:c}});toast('Publicată!','ok');document.getElementById('nTitle').value='';document.getElementById('nContent').value='';loadPrimarNews();};
window.delNews=async function(id){if(!confirm('Sigur?'))return;await api('/api/news/'+id,{method:'DELETE'});toast('Șters','info');loadPrimarNews();};
window.showPanel=function(pid,btn,pageId){const pg=document.getElementById(pageId);pg.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));pg.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));document.getElementById(pid).classList.add('active');btn.classList.add('active');};

/* ═══ DEPT ═══ */
async function loadDept(){const reps=await api('/api/reports').then(r=>r.json());document.getElementById('dReportsBody').innerHTML=reps.map(r=>'<tr onclick="openDetail('+r.id+')"><td><strong>'+esc(r.cerere_nr||'—')+'</strong></td><td>'+esc(r.title)+'</td><td><span class="badge b-'+r.status+'">'+(STAT[r.status]||r.status)+'</span></td><td>'+esc(r.address||'—')+'</td><td>'+fmtD(r.created_at)+'</td></tr>').join('');}

/* ═══ ADMIN ═══ */
async function loadAdmin(){loadAdminDepts();loadAdminUsers();}
async function loadAdminDepts(){const ds=await fetch('/api/departments').then(r=>r.json());allDepts=ds;document.getElementById('aDeptsList').innerHTML=ds.map(d=>'<div class="li"><span>'+esc(d.name)+'</span><button class="danger" onclick="delDept('+d.id+')">Șterge</button></div>').join('');document.getElementById('auDept').innerHTML='<option value="">—</option>'+ds.map(d=>'<option value="'+d.id+'">'+esc(d.name)+'</option>').join('');}
async function loadAdminUsers(){const us=await api('/api/users').then(r=>r.json());document.getElementById('aUsersList').innerHTML=us.map(u=>'<div class="li"><span>'+esc(u.full_name||u.username)+' ('+u.role+(u.dept_name?' · '+u.dept_name:'')+')</span>'+(u.role!=='admin'?'<button class="danger" onclick="delUser('+u.id+')">Șterge</button>':'')+'</div>').join('');}
window.submitDept=async function(){const n=document.getElementById('adName').value.trim();if(!n){toast('Nume obligatoriu','err');return;}await api('/api/departments',{method:'POST',body:{name:n}});document.getElementById('adName').value='';toast('Adăugat!','ok');loadAdminDepts();};
window.submitUser=async function(){const u=document.getElementById('auUser').value.trim(),e=document.getElementById('auEmail').value.trim(),p=document.getElementById('auPass').value;if(!u||!e||!p){toast('Câmpuri obligatorii','err');return;}const r=await api('/api/users',{method:'POST',body:{username:u,email:e,password:p,role:document.getElementById('auRole').value,department_id:document.getElementById('auDept').value||null}});if(r.ok){toast('Adăugat!','ok');['auUser','auEmail','auPass'].forEach(id=>document.getElementById(id).value='');loadAdminUsers();}else{const d=await r.json();toast(d.error||'Eroare','err');}};
window.delDept=async function(id){if(!confirm('Sigur?'))return;await api('/api/departments/'+id,{method:'DELETE'});loadAdminDepts();};
window.delUser=async function(id){if(!confirm('Sigur?'))return;await api('/api/users/'+id,{method:'DELETE'});loadAdminUsers();};

/* ═══ AI CHAT (llama.cpp on port 8080) ═══ */
let chatHist=[];
window.toggleChat=function(){const p=document.getElementById('chatPanel');p.classList.toggle('open');if(p.classList.contains('open'))document.getElementById('chatInput').focus();};
window.sendChat=async function(){const inp=document.getElementById('chatInput'),m=inp.value.trim();if(!m)return;inp.value='';addMsg(m,'user');chatHist.push({role:'user',content:m});try{const r=await fetch('/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:m,history:chatHist.slice(-8)})});const d=await r.json();addMsg(d.reply,'bot');chatHist.push({role:'assistant',content:d.reply});}catch(e){addMsg('Eroare de conexiune.','bot');}};
function addMsg(t,w){const c=document.getElementById('chatMsgs'),d=document.createElement('div');d.className='cmsg '+w;d.innerHTML='<div class="cbbl">'+esc(t)+'</div>';c.appendChild(d);c.scrollTop=c.scrollHeight;}
