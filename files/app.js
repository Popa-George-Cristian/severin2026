/* ═══════════════════════════════════════════════════════════════
   PRIMĂRIA DIGITALĂ GALAȚI v2 — Frontend
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initAuth();
  initNav();
  initMaps();
  initForms();
  loadHome();
});

// ── State ───────────────────────────────────────────────────────
let homeMap, reportMap, detailMap;
let reportMarker = null;
let currentUser = null;
let token = localStorage.getItem('token');

// Galați center
const GALATI = [45.4353, 28.0080];
const ZOOM = 14;

const CAT = { drum:'🛣️ Drum', iluminat:'💡 Iluminat', salubritate:'🗑️ Salubritate', spatii_verzi:'🌳 Spații Verzi', mobilier_urban:'🪑 Mobilier', canalizare:'🔧 Canalizare', constructii:'🏗️ Construcții', altele:'📋 Altele' };
const STAT = { nou:'Nou', in_lucru:'În lucru', rezolvat:'Rezolvat' };
const STATC = { nou:'#9e7d1a', in_lucru:'#c66b18', rezolvat:'#27864a' };

// ── API Helper ──────────────────────────────────────────────────
async function api(url, opts = {}) {
  const h = { ...(opts.headers || {}) };
  if (token) h['x-auth-token'] = token;
  if (opts.body && !(opts.body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { ...opts, headers: h });
  return res;
}

// ══════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════

function initAuth() {
  // Login tabs
  document.querySelectorAll('.ltab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.ltab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.ltab-panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('ltab-' + t.dataset.ltab).classList.add('active');
    });
  });

  document.getElementById('btnLogin').addEventListener('click', doLogin);
  document.getElementById('btnRegister').addEventListener('click', doRegister);
  document.getElementById('liPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('ruPass').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });

  document.getElementById('navAuth').addEventListener('click', e => {
    e.preventDefault();
    if (currentUser) {
      doLogout();
    } else {
      go('login');
    }
  });

  // Hero report button — if not logged in, go to login
  document.getElementById('heroReportBtn').addEventListener('click', e => {
    if (!currentUser) {
      e.preventDefault();
      e.stopPropagation();
      go('login');
    }
  });

  // Check existing session
  if (token) {
    api('/api/auth/me').then(r => r.ok ? r.json() : Promise.reject()).then(d => setUser(d.user)).catch(clearUser);
  }
}

async function doLogin() {
  const u = document.getElementById('liUser').value.trim();
  const p = document.getElementById('liPass').value;
  const m = document.getElementById('loginMsg');
  if (!u || !p) return showMsg(m, 'Completați ambele câmpuri', 'err');
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    const d = await r.json();
    if (!r.ok) return showMsg(m, d.error, 'err');
    token = d.token;
    localStorage.setItem('token', token);
    setUser(d.user);
    toast(`Bine ai venit, ${d.user.username}!`, 'ok');
    go('report');
  } catch (e) { showMsg(m, 'Eroare de conexiune', 'err'); }
}

async function doRegister() {
  const u = document.getElementById('ruUser').value.trim();
  const e = document.getElementById('ruEmail').value.trim();
  const p = document.getElementById('ruPass').value;
  const m = document.getElementById('regMsg');
  if (!u || !e || !p) return showMsg(m, 'Toate câmpurile sunt obligatorii', 'err');
  try {
    const r = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, email: e, password: p }) });
    const d = await r.json();
    if (!r.ok) return showMsg(m, d.error, 'err');
    token = d.token;
    localStorage.setItem('token', token);
    setUser(d.user);
    toast(`Cont creat! Bine ai venit, ${d.user.username}!`, 'ok');
    go('report');
  } catch (err) { showMsg(m, 'Eroare de conexiune', 'err'); }
}

async function doLogout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  clearUser();
  toast('V-ați deconectat', 'info');
  go('home');
}

function setUser(u) {
  currentUser = u;
  document.getElementById('navAuthLabel').textContent = u.username;
  document.getElementById('navReport').style.display = '';
  document.getElementById('navAdmin').style.display = u.role === 'admin' ? '' : 'none';
  lucide.createIcons();
}

function clearUser() {
  currentUser = null;
  token = null;
  localStorage.removeItem('token');
  document.getElementById('navAuthLabel').textContent = 'Autentificare';
  document.getElementById('navReport').style.display = 'none';
  document.getElementById('navAdmin').style.display = 'none';
  lucide.createIcons();
}

// ══════════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════════

function initNav() {
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-page]');
    if (t) {
      e.preventDefault();
      const p = t.dataset.page;
      // Protected pages
      if ((p === 'report') && !currentUser) { go('login'); return; }
      if ((p === 'admin') && (!currentUser || currentUser.role !== 'admin')) { toast('Acces interzis', 'err'); return; }
      go(p);
    }
    // News article click
    const nc = e.target.closest('[data-nid]');
    if (nc) { e.preventDefault(); go('article', nc.dataset.nid); }
    // Report detail click
    const rc = e.target.closest('[data-rid]');
    if (rc) { e.preventDefault(); openDetail(rc.dataset.rid); }
  });

  document.getElementById('hamburger').addEventListener('click', () => document.getElementById('navMenu').classList.toggle('open'));
  window.addEventListener('scroll', () => document.getElementById('navbar').classList.toggle('scrolled', scrollY > 30));

  // Admin tabs
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById(t.dataset.tab).classList.add('active');
    });
  });

  // Detail modal
  document.getElementById('detailClose').addEventListener('click', closeDetail);
  document.getElementById('detailOverlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeDetail(); });

  // Admin filters
  document.getElementById('afStatus').addEventListener('change', loadAdminReports);
  document.getElementById('afCategory').addEventListener('change', loadAdminReports);
}

function go(page, extra) {
  document.getElementById('navMenu').classList.remove('open');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link[data-page]').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  const el = document.getElementById('page-' + page);
  if (el) { el.classList.add('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  if (page === 'home') setTimeout(() => { homeMap?.invalidateSize(); loadHome(); }, 150);
  if (page === 'news') loadAllNews();
  if (page === 'article') loadArticle(extra);
  if (page === 'report') setTimeout(() => { reportMap?.invalidateSize(); loadMyReports(); }, 150);
  if (page === 'admin') loadAdmin();
  lucide.createIcons();
}

// ══════════════════════════════════════════════════════════════════
// MAPS
// ══════════════════════════════════════════════════════════════════

function initMaps() {
  homeMap = L.map('homeMap').setView(GALATI, ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(homeMap);
  loadMarkers(homeMap);

  reportMap = L.map('reportMap').setView(GALATI, ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(reportMap);
  reportMap.on('click', e => {
    if (reportMarker) reportMarker.setLatLng(e.latlng);
    else {
      reportMarker = L.marker(e.latlng, { draggable: true, icon: mkIcon('red') }).addTo(reportMap);
      reportMarker.on('dragend', () => { const p = reportMarker.getLatLng(); setLoc(p.lat, p.lng); });
    }
    setLoc(e.latlng.lat, e.latlng.lng);
  });
  loadMarkers(reportMap);
}

function mkIcon(color) {
  const c = { red:'#c0392b', amber:'#9e7d1a', orange:'#c66b18', green:'#27864a', blue:'#2563a8' }[color] || '#2563a8';
  return L.divIcon({ className:'_', html:`<div style="width:26px;height:26px;background:${c};border:3px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.3)"></div>`, iconSize:[26,26], iconAnchor:[13,13], popupAnchor:[0,-15] });
}

async function loadMarkers(map) {
  try {
    const reps = await fetch('/api/reports').then(r => r.json());
    reps.forEach(r => {
      if (!r.latitude || !r.longitude) return;
      const sc = r.status === 'rezolvat' ? 'green' : r.status === 'in_lucru' ? 'orange' : 'amber';
      L.marker([r.latitude, r.longitude], { icon: mkIcon(r.priority === 'urgent' ? 'red' : sc) })
        .addTo(map)
        .bindPopup(`<div style="min-width:190px"><strong>${esc(r.title)}</strong><div style="font-size:.82rem;color:#5e6e82;margin:.3rem 0">${CAT[r.category]||r.category}</div><p style="font-size:.82rem">${esc(r.description).substring(0,90)}...</p>${r.photo_path?`<img src="${r.photo_path}" style="width:100%;border-radius:6px;margin:.4rem 0">`:''}
          <div style="display:flex;justify-content:space-between;margin-top:.5rem;padding-top:.4rem;border-top:1px solid #eee"><span style="padding:2px 6px;border-radius:20px;font-size:.7rem;font-weight:600;background:${r.status==='rezolvat'?'#eef8f1':r.status==='in_lucru'?'#fef5eb':'#fdf7e8'};color:${STATC[r.status]}">${STAT[r.status]}</span><span style="font-size:.75rem;color:#94a3b8">${fmtDate(r.created_at)}</span></div></div>`);
    });
  } catch (e) { console.error(e); }
}

function setLoc(lat, lng) {
  document.getElementById('rLat').value = lat;
  document.getElementById('rLng').value = lng;
  document.getElementById('rAddress').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ro`)
    .then(r => r.json())
    .then(d => { if (d.display_name) document.getElementById('rAddress').value = d.display_name.split(',').slice(0, 3).join(',').trim(); })
    .catch(() => {});
}

// ══════════════════════════════════════════════════════════════════
// HOME
// ══════════════════════════════════════════════════════════════════

async function loadHome() {
  try {
    const s = await fetch('/api/reports/stats').then(r => r.json());
    document.getElementById('sTotal').textContent = s.total;
    document.getElementById('sUrgent').textContent = s.urgent;
    const gc = st => (s.byStatus.find(x => x.status === st) || { count: 0 }).count;
    document.getElementById('sResolved').textContent = gc('rezolvat');
    document.getElementById('sProgress').textContent = gc('in_lucru');

    const news = await fetch('/api/news').then(r => r.json());
    document.getElementById('homeNews').innerHTML = news.slice(0, 3).map(newsCard).join('');
  } catch (e) { console.error(e); }
}

function newsCard(n) {
  return `<div class="ncard" data-nid="${n.id}">
    ${n.image_url ? `<div class="ncard-img" style="background-image:url(${n.image_url})"></div>` : ''}
    <div class="ncard-body"><div class="ncard-cat">${esc(n.category)}</div><h3>${esc(n.title)}</h3><p>${esc(n.summary || n.content.substring(0, 140) + '...')}</p><div class="ncard-date">${fmtDate(n.created_at)}</div></div>
  </div>`;
}

async function loadAllNews() {
  const news = await fetch('/api/news').then(r => r.json());
  document.getElementById('allNews').innerHTML = news.map(newsCard).join('');
}

async function loadArticle(id) {
  const a = await fetch(`/api/news/${id}`).then(r => r.json());
  const body = a.content.split('\n').map(p => p.trim() ? `<p>${esc(p)}</p>` : '').join('');
  document.getElementById('articleBody').innerHTML = `
    <div class="ncard-cat">${esc(a.category)}</div>
    <h1>${esc(a.title)}</h1>
    <div class="ameta">${fmtDate(a.created_at)}</div>
    ${a.image_url ? `<img class="aimg" src="${a.image_url}">` : ''}
    <div class="abody">${body}</div>`;
}

// ══════════════════════════════════════════════════════════════════
// REPORT FORM
// ══════════════════════════════════════════════════════════════════

function initForms() {
  // Photo upload
  const zone = document.getElementById('uploadZone');
  const inp = document.getElementById('rPhoto');
  zone.addEventListener('click', () => inp.click());
  inp.addEventListener('change', e => {
    if (e.target.files[0]) {
      const r = new FileReader();
      r.onload = ev => { const p = document.getElementById('rPreview'); p.src = ev.target.result; p.style.display = 'block'; };
      r.readAsDataURL(e.target.files[0]);
    }
  });

  document.getElementById('btnSubmitReport').addEventListener('click', submitReport);
  document.getElementById('btnContact').addEventListener('click', submitContact);
  document.getElementById('btnAddNews').addEventListener('click', submitNews);
}

async function submitReport() {
  const title = document.getElementById('rTitle').value.trim();
  const desc = document.getElementById('rDesc').value.trim();
  const cat = document.getElementById('rCategory').value;
  const m = document.getElementById('reportMsg');
  if (!title || !desc || !cat) return showMsg(m, 'Completați titlul, categoria și descrierea', 'err');

  const fd = new FormData();
  fd.append('type', document.getElementById('rType').value);
  fd.append('title', title);
  fd.append('description', desc);
  fd.append('category', cat);
  fd.append('priority', document.getElementById('rPriority').value);
  const lat = document.getElementById('rLat').value;
  const lng = document.getElementById('rLng').value;
  if (lat) fd.append('latitude', lat);
  if (lng) fd.append('longitude', lng);
  const addr = document.getElementById('rAddress').value;
  if (addr) fd.append('address', addr);
  const photo = document.getElementById('rPhoto').files[0];
  if (photo) fd.append('photo', photo);

  try {
    const r = await api('/api/reports', { method: 'POST', body: fd });
    if (r.ok) {
      showMsg(m, 'Raport trimis cu succes!', 'ok');
      toast('Raport trimis!', 'ok');
      ['rTitle', 'rDesc', 'rAddress', 'rLat', 'rLng'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('rCategory').value = '';
      document.getElementById('rPriority').value = 'normal';
      document.getElementById('rType').value = 'problema';
      document.getElementById('rPhoto').value = '';
      document.getElementById('rPreview').style.display = 'none';
      if (reportMarker) { reportMap.removeLayer(reportMarker); reportMarker = null; }
      loadMyReports();
      // Refresh map markers
      reportMap.eachLayer(l => { if (l instanceof L.Marker) reportMap.removeLayer(l); });
      loadMarkers(reportMap);
    } else {
      const d = await r.json();
      showMsg(m, d.error || 'Eroare', 'err');
    }
  } catch (e) { showMsg(m, 'Eroare de conexiune', 'err'); }
}

async function loadMyReports() {
  const reps = await fetch('/api/reports').then(r => r.json());
  const el = document.getElementById('myReports');
  if (!reps.length) { el.innerHTML = '<p style="padding:1rem;text-align:center;color:var(--muted)">Niciun raport încă</p>'; return; }
  el.innerHTML = reps.map(r => `
    <div class="rp-item" data-rid="${r.id}">
      <div class="rp-dot dot-${r.status}"></div>
      <div><div class="rp-title">${esc(r.title)}</div><div class="rp-meta">${CAT[r.category]||r.category} · ${STAT[r.status]} · ${fmtDate(r.created_at)}</div></div>
    </div>`).join('');
}

async function submitContact() {
  const n = document.getElementById('cName').value.trim();
  const e = document.getElementById('cEmail').value.trim();
  const s = document.getElementById('cSubject').value.trim();
  const msg = document.getElementById('cMessage').value.trim();
  const m = document.getElementById('contactMsg');
  if (!n || !e || !msg) return showMsg(m, 'Completați câmpurile obligatorii', 'err');
  const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, email: e, subject: s, message: msg }) });
  if (r.ok) { showMsg(m, 'Mesaj trimis cu succes!', 'ok'); toast('Mesaj trimis!', 'ok'); ['cName', 'cEmail', 'cSubject', 'cMessage'].forEach(id => document.getElementById(id).value = ''); }
  else showMsg(m, 'Eroare', 'err');
}

// ══════════════════════════════════════════════════════════════════
// REPORT DETAIL MODAL
// ══════════════════════════════════════════════════════════════════

async function openDetail(id) {
  try {
    const r = await api(`/api/reports/${id}`).then(x => x.json());
    const isAdmin = currentUser && currentUser.role === 'admin';
    let h = `<div class="detail">
      <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.4rem">
        <span class="badge b-${r.status}">${STAT[r.status]}</span>
        <span class="badge ${r.priority==='urgent'?'b-urgent':'b-normal'}">${r.priority==='urgent'?'🔴 Urgent':'Normal'}</span>
        <span style="font-size:.8rem;color:var(--light)">#${r.id} · ${r.type==='serviciu'?'Cerere serviciu':'Problemă urbană'}</span>
      </div>
      <h2>${esc(r.title)}</h2>
      <div class="detail-meta">
        <span>${CAT[r.category]||r.category}</span>
        <span>📅 ${fmtDate(r.created_at)}</span>
        ${r.author?`<span>👤 ${esc(r.author)}</span>`:''}
        ${r.address?`<span>📍 ${esc(r.address)}</span>`:''}
      </div>`;
    if (r.photo_path) h += `<img src="${r.photo_path}" class="detail-photo">`;
    h += `<div class="detail-desc">${esc(r.description)}</div>`;
    if (r.latitude && r.longitude) h += `<div id="dMap" class="detail-map"></div>`;
    if (r.admin_notes) h += `<div class="detail-admin"><h4>📝 Note administrator</h4><p style="color:var(--text)">${esc(r.admin_notes)}</p></div>`;
    if (isAdmin) {
      h += `<div class="detail-admin" style="margin-top:1rem">
        <h4>⚙️ Acțiuni administrator</h4>
        <div class="form-stack">
          <div class="form-2col">
            <div class="field"><label>Status</label><select id="dStatus"><option value="nou" ${r.status==='nou'?'selected':''}>Nou</option><option value="in_lucru" ${r.status==='in_lucru'?'selected':''}>În lucru</option><option value="rezolvat" ${r.status==='rezolvat'?'selected':''}>Rezolvat</option></select></div>
            <div class="field"><label>Prioritate</label><select id="dPri"><option value="normal" ${r.priority==='normal'?'selected':''}>Normal</option><option value="urgent" ${r.priority==='urgent'?'selected':''}>Urgent</option></select></div>
          </div>
          <div class="field"><label>Note</label><textarea id="dNotes" rows="3">${esc(r.admin_notes||'')}</textarea></div>
          <div style="display:flex;gap:.75rem">
            <button class="btn btn-gold" onclick="saveDetail(${r.id})"><i data-lucide="save" style="width:16px;height:16px"></i> Salvează</button>
            <button class="btn btn-danger btn-sm" onclick="delReport(${r.id})"><i data-lucide="trash-2" style="width:16px;height:16px"></i> Șterge</button>
          </div>
        </div>
      </div>`;
    }
    h += `</div>`;
    document.getElementById('detailBody').innerHTML = h;
    document.getElementById('detailOverlay').classList.add('open');
    lucide.createIcons();
    if (r.latitude && r.longitude) {
      setTimeout(() => {
        if (detailMap) { detailMap.remove(); detailMap = null; }
        detailMap = L.map('dMap').setView([r.latitude, r.longitude], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(detailMap);
        L.marker([r.latitude, r.longitude], { icon: mkIcon(r.priority === 'urgent' ? 'red' : 'blue') }).addTo(detailMap);
      }, 200);
    }
  } catch (e) { toast('Eroare la încărcare', 'err'); console.error(e); }
}

function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  if (detailMap) { detailMap.remove(); detailMap = null; }
}

window.saveDetail = async function(id) {
  await api(`/api/reports/${id}`, { method: 'PATCH', body: { status: document.getElementById('dStatus').value, priority: document.getElementById('dPri').value, admin_notes: document.getElementById('dNotes').value } });
  toast('Raport actualizat', 'ok');
  closeDetail();
  loadAdmin();
};

window.delReport = async function(id) {
  if (!confirm('Sigur doriți să ștergeți?')) return;
  await api(`/api/reports/${id}`, { method: 'DELETE' });
  toast('Raport șters', 'info');
  closeDetail();
  loadAdmin();
};

// ══════════════════════════════════════════════════════════════════
// ADMIN
// ══════════════════════════════════════════════════════════════════

async function loadAdmin() {
  await Promise.all([loadAdminStats(), loadAdminReports(), loadAdminNews(), loadAdminMsgs()]);
}

async function loadAdminStats() {
  const s = await fetch('/api/reports/stats').then(r => r.json());
  document.getElementById('asTotal').textContent = s.total;
  document.getElementById('asUrg').textContent = s.urgent;
  const gc = st => (s.byStatus.find(x => x.status === st) || { count: 0 }).count;
  document.getElementById('asNew').textContent = gc('nou');
  document.getElementById('asProg').textContent = gc('in_lucru');
  document.getElementById('asDone').textContent = gc('rezolvat');
}

async function loadAdminReports() {
  const st = document.getElementById('afStatus').value;
  const ca = document.getElementById('afCategory').value;
  let url = '/api/reports?';
  if (st) url += `status=${st}&`;
  if (ca) url += `category=${ca}&`;
  const reps = await fetch(url).then(r => r.json());
  document.getElementById('aReportsBody').innerHTML = reps.map(r => `
    <tr data-rid="${r.id}">
      <td><strong>#${r.id}</strong></td>
      <td><div style="font-weight:600">${esc(r.title)}</div><div style="font-size:.78rem;color:var(--light)">${esc(r.address||'—')}</div></td>
      <td style="font-size:.8rem">${r.type==='serviciu'?'🔧':'🚨'}</td>
      <td>${CAT[r.category]||r.category}</td>
      <td><span class="badge ${r.priority==='urgent'?'b-urgent':'b-normal'}">${r.priority==='urgent'?'Urgent':'Normal'}</span></td>
      <td><span class="badge b-${r.status}">${STAT[r.status]}</span></td>
      <td style="font-size:.82rem">${esc(r.author||'—')}</td>
      <td style="font-size:.82rem">${fmtDate(r.created_at)}</td>
    </tr>`).join('');
  lucide.createIcons();
}

async function loadAdminNews() {
  const news = await fetch('/api/news').then(r => r.json());
  document.getElementById('aNewsList').innerHTML = news.map(n => `
    <div class="acard"><div><h4>${esc(n.title)}</h4><p>${esc(n.summary||n.content.substring(0,100)+'...')}</p><div class="meta">${n.category} · ${fmtDate(n.created_at)}</div></div>
    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation();delNews(${n.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button></div>`).join('');
  lucide.createIcons();
}

async function loadAdminMsgs() {
  const msgs = await api('/api/contact').then(r => r.json());
  document.getElementById('aMsgsList').innerHTML = !msgs.length
    ? '<p style="text-align:center;color:var(--muted);padding:2rem">Niciun mesaj</p>'
    : msgs.map(m => `<div class="acard"><div><h4>${esc(m.subject||'Fără subiect')}</h4><p>${esc(m.message)}</p><div class="meta">De la: ${esc(m.name)} (${esc(m.email)}) · ${fmtDate(m.created_at)}</div></div></div>`).join('');
}

async function submitNews() {
  const t = document.getElementById('nTitle').value.trim();
  const c = document.getElementById('nContent').value.trim();
  if (!t || !c) return toast('Titlu și conținut obligatorii', 'err');
  const r = await api('/api/news', { method: 'POST', body: { title: t, summary: document.getElementById('nSummary').value.trim(), content: c, category: document.getElementById('nCat').value, image_url: document.getElementById('nImg').value.trim() } });
  if (r.ok) { toast('Știre publicată!', 'ok'); ['nTitle', 'nSummary', 'nContent', 'nImg'].forEach(id => document.getElementById(id).value = ''); loadAdminNews(); }
}

window.delNews = async function(id) {
  if (!confirm('Sigur?')) return;
  await api(`/api/news/${id}`, { method: 'DELETE' });
  toast('Știre ștearsă', 'info');
  loadAdminNews();
};

// ══════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' }) : ''; }
function showMsg(el, msg, type) { el.className = 'msg ' + type; el.textContent = msg; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 5000); }
function toast(msg, type = 'info') {
  const c = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(80px)'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, 3500);
}
