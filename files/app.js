/* ═══════════════════════════════════════
   Primăria Galați — Portal Digital v4
   ═══════════════════════════════════════ */

let homeMap, reportMap, detailMap, reportMarker = null;
let currentUser = null, token = localStorage.getItem('token');
let a11yActive = false, ttsOn = false, synth = window.speechSynthesis;
let allDepts = [];

const GL = [45.4353, 28.0080], ZM = 14;
const CAT = { drum:'Drum', iluminat:'Iluminat', salubritate:'Salubritate', spatii_verzi:'Spații Verzi', mobilier_urban:'Mobilier Urban', canalizare:'Canalizare', constructii:'Construcții', altele:'Altele' };
const STAT = { nou:'Nou', in_lucru:'În lucru', rezolvat:'Rezolvat', redirectionat:'Redirecționat' };

/* ── API Helper ────────────────── */
async function api(url, opts = {}) {
  const h = { ...(opts.headers || {}) };
  if (token) h['x-auth-token'] = token;
  if (opts.body && !(opts.body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  return fetch(url, { ...opts, headers: h });
}

/* ── Utilities ─────────────────── */
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function fmtD(d) { return d ? new Date(d).toLocaleDateString('ro-RO', { year: 'numeric', month: 'short', day: 'numeric' }) : ''; }

function showMsg(el, msg, type) {
  el.className = 'msg ' + type; el.textContent = msg; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 6000);
}

window.toast = function(msg, type) {
  const c = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.textContent = msg; c.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3500);
};

/* ═══════════════════════════════════════
   INIT
   ═══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  initA11y();
  checkAuth();
  initMaps();
  loadHome();
  fetch('/api/departments').then(r => r.json()).then(d => { allDepts = d; }).catch(() => {});
});

/* ═══════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════ */
window.go = function(page, extra) {
  // Close mobile menu
  document.getElementById('navMenu').classList.remove('open');

  // Protected pages
  if (page === 'report' && !currentUser) { go('login'); return; }
  if (page === 'primar' && (!currentUser || !['primar', 'admin'].includes(currentUser.role))) { toast('Acces interzis', 'err'); return; }
  if (page === 'dept' && (!currentUser || currentUser.role !== 'departament')) { toast('Acces interzis', 'err'); return; }
  if (page === 'admin' && (!currentUser || currentUser.role !== 'admin')) { toast('Acces interzis', 'err'); return; }

  // Switch page
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('pg-' + page);
  if (el) { el.classList.add('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  // Load data
  if (page === 'home') setTimeout(() => { if (homeMap) homeMap.invalidateSize(); loadHome(); }, 200);
  if (page === 'news') loadAllNews();
  if (page === 'article') loadArticle(extra);
  if (page === 'report') setTimeout(() => { if (reportMap) reportMap.invalidateSize(); loadMyReports(); }, 200);
  if (page === 'primar') loadPrimar();
  if (page === 'dept') loadDept();
  if (page === 'admin') loadAdmin();

  // A11y announce
  if (ttsOn) {
    const names = { home: 'Pagina principală', news: 'Știri și anunțuri', about: 'Despre Galați', contact: 'Contact', login: 'Pagina de autentificare', report: 'Pagina de raportare', primar: 'Biroul primarului', dept: 'Departament', admin: 'Administrare' };
    if (names[page]) setTimeout(() => speak(names[page]), 300);
  }
};

/* ═══════════════════════════════════════
   AUTH
   ═══════════════════════════════════════ */
function checkAuth() {
  if (token) {
    api('/api/auth/me').then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setUser(d.user))
      .catch(clearUser);
  }
}

window.onAuthClick = function() {
  if (currentUser) {
    api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearUser();
    toast('Deconectat', 'info');
    go('home');
  } else {
    go('login');
  }
};

window.switchLoginTab = function(tab, btn) {
  document.querySelectorAll('#pg-login .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#pg-login .tab-content').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
};

window.doLogin = async function() {
  const u = document.getElementById('liUser').value.trim();
  const p = document.getElementById('liPass').value;
  const m = document.getElementById('loginMsg');
  if (!u || !p) { showMsg(m, 'Completați ambele câmpuri', 'err'); return; }

  const r = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: p })
  });
  const d = await r.json();
  if (!r.ok) { showMsg(m, d.error, 'err'); if (ttsOn) speak(d.error); return; }

  token = d.token; localStorage.setItem('token', token);
  setUser(d.user);
  toast('Bine ați venit, ' + (d.user.full_name || d.user.username) + '!', 'ok');
  if (ttsOn) speak('Conectat cu succes');

  // Route by role
  if (d.user.role === 'primar') go('primar');
  else if (d.user.role === 'departament') go('dept');
  else if (d.user.role === 'admin') go('admin');
  else go('report');
};

window.doRegister = async function() {
  const u = document.getElementById('ruUser').value.trim();
  const e = document.getElementById('ruEmail').value.trim();
  const p = document.getElementById('ruPass').value;
  const n = document.getElementById('ruName').value.trim();
  const m = document.getElementById('regMsg');
  if (!u || !e || !p) { showMsg(m, 'Completați toate câmpurile', 'err'); return; }

  const r = await fetch('/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, email: e, password: p, full_name: n })
  });
  const d = await r.json();
  if (!r.ok) { showMsg(m, d.error, 'err'); return; }

  token = d.token; localStorage.setItem('token', token);
  setUser(d.user);
  toast('Cont creat!', 'ok');
  go('report');
};

function setUser(u) {
  currentUser = u;
  document.getElementById('authLabel').textContent = u.full_name || u.username;
  document.getElementById('navReport').style.display = ['cetatean', 'admin'].includes(u.role) ? '' : 'none';
  document.getElementById('navPrimar').style.display = ['primar', 'admin'].includes(u.role) ? '' : 'none';
  document.getElementById('navDept').style.display = u.role === 'departament' ? '' : 'none';
  document.getElementById('navAdmin').style.display = u.role === 'admin' ? '' : 'none';
  if (u.role === 'departament' && u.department) {
    document.getElementById('deptTitle').textContent = u.department.name;
  }
}

function clearUser() {
  currentUser = null; token = null; localStorage.removeItem('token');
  document.getElementById('authLabel').textContent = 'Autentificare';
  ['navReport', 'navPrimar', 'navDept', 'navAdmin'].forEach(id => document.getElementById(id).style.display = 'none');
}

/* ═══════════════════════════════════════
   MAPS
   ═══════════════════════════════════════ */
function initMaps() {
  homeMap = L.map('homeMap').setView(GL, ZM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(homeMap);
  loadMarkers(homeMap);

  reportMap = L.map('reportMap').setView(GL, ZM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(reportMap);
  reportMap.on('click', function(e) {
    const { lat, lng } = e.latlng;
    if (reportMarker) reportMarker.setLatLng(e.latlng);
    else reportMarker = L.marker(e.latlng, { draggable: true }).addTo(reportMap);
    document.getElementById('rLat').value = lat;
    document.getElementById('rLng').value = lng;
    document.getElementById('rAddr').value = lat.toFixed(4) + ', ' + lng.toFixed(4);
    // Reverse geocode
    fetch('https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lng + '&format=json&accept-language=ro')
      .then(r => r.json())
      .then(d => { if (d.display_name) document.getElementById('rAddr').value = d.display_name.split(',').slice(0, 3).join(',').trim(); })
      .catch(() => {});
    if (ttsOn) speak('Locație marcată pe hartă');
  });
  loadMarkers(reportMap);
}

async function loadMarkers(map) {
  try {
    const reps = await fetch('/api/reports').then(r => r.json());
    reps.forEach(r => {
      if (!r.latitude || !r.longitude) return;
      L.marker([r.latitude, r.longitude]).addTo(map)
        .bindPopup('<b>' + esc(r.title) + '</b><br>' + (CAT[r.category] || r.category) + '<br><small>' + (STAT[r.status] || r.status) + '</small>');
    });
  } catch (e) {}
}

/* ═══════════════════════════════════════
   HOME & NEWS
   ═══════════════════════════════════════ */
async function loadHome() {
  try {
    const s = await fetch('/api/reports/stats').then(r => r.json());
    document.getElementById('sTotal').textContent = s.total;
    document.getElementById('sUrg').textContent = s.urgent;
    const gc = st => (s.byStatus.find(x => x.status === st) || { count: 0 }).count;
    document.getElementById('sRes').textContent = gc('rezolvat');
    document.getElementById('sProg').textContent = gc('in_lucru');

    const news = await fetch('/api/news').then(r => r.json());
    document.getElementById('homeNews').innerHTML = news.slice(0, 3).map(newsCard).join('');
  } catch (e) {}
}

function newsCard(n) {
  return '<div class="news-card" onclick="go(\'article\',\'' + n.id + '\')">' +
    (n.image_url ? '<div class="news-card-img" style="background-image:url(' + n.image_url + ')"></div>' : '') +
    '<div class="news-card-body"><div class="news-card-cat">' + esc(n.category) + '</div>' +
    '<h3>' + esc(n.title) + '</h3>' +
    '<p>' + esc(n.summary || n.content.substring(0, 120) + '...') + '</p>' +
    '<div class="news-card-date">' + fmtD(n.created_at) + '</div></div></div>';
}

async function loadAllNews() {
  const n = await fetch('/api/news').then(r => r.json());
  document.getElementById('allNews').innerHTML = n.map(newsCard).join('');
}

async function loadArticle(id) {
  const a = await fetch('/api/news/' + id).then(r => r.json());
  document.getElementById('articleBody').innerHTML =
    '<div class="news-card-cat">' + esc(a.category) + '</div>' +
    '<h2>' + esc(a.title) + '</h2>' +
    '<p style="color:var(--text3);font-size:.85rem;margin-bottom:1.5rem">' + fmtD(a.created_at) + '</p>' +
    (a.image_url ? '<img src="' + a.image_url + '" style="width:100%;height:260px;object-fit:cover;border-radius:8px;margin-bottom:1.5rem">' : '') +
    '<div style="line-height:1.9">' + a.content.split('\n').map(p => p.trim() ? '<p>' + esc(p) + '</p>' : '').join('') + '</div>';
  if (ttsOn) speak('Articol: ' + a.title);
}

/* ═══════════════════════════════════════
   REPORT FORM
   ═══════════════════════════════════════ */
window.submitReport = async function() {
  const title = document.getElementById('rTitle').value.trim();
  const desc = document.getElementById('rDesc').value.trim();
  const cat = document.getElementById('rCat').value;
  const m = document.getElementById('reportMsg');

  if (!title || !desc || !cat) { showMsg(m, 'Completați titlul, categoria și descrierea', 'err'); return; }

  const fd = new FormData();
  fd.append('type', document.getElementById('rType').value);
  fd.append('title', title); fd.append('description', desc);
  fd.append('category', cat); fd.append('priority', document.getElementById('rPri').value);
  if (document.getElementById('rLat').value) fd.append('latitude', document.getElementById('rLat').value);
  if (document.getElementById('rLng').value) fd.append('longitude', document.getElementById('rLng').value);
  if (document.getElementById('rAddr').value) fd.append('address', document.getElementById('rAddr').value);
  const ph = document.getElementById('rPhoto').files[0]; if (ph) fd.append('photo', ph);

  const r = await api('/api/reports', { method: 'POST', body: fd });
  const d = await r.json();
  if (r.ok) {
    showMsg(m, 'Sesizare trimisă! Nr. cerere: ' + d.cerere_nr, 'ok');
    toast('Nr. cerere: ' + d.cerere_nr, 'ok');
    if (ttsOn) speak('Sesizare trimisă. Număr cerere: ' + d.cerere_nr);
    ['rTitle', 'rDesc', 'rAddr', 'rLat', 'rLng'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('rCat').value = ''; document.getElementById('rPhoto').value = '';
    if (reportMarker) { reportMap.removeLayer(reportMarker); reportMarker = null; }
    loadMyReports();
  } else { showMsg(m, d.error || 'Eroare', 'err'); }
};

async function loadMyReports() {
  const reps = await fetch('/api/reports').then(r => r.json());
  const el = document.getElementById('myReports');
  el.innerHTML = reps.length
    ? reps.map(r => '<div class="rp-item" onclick="openDetail(' + r.id + ')"><div class="rp-title">' + esc(r.title) + '</div><div class="rp-meta">' + (r.cerere_nr || '') + ' · ' + (STAT[r.status] || r.status) + ' · ' + fmtD(r.created_at) + '</div></div>').join('')
    : '<p style="padding:1rem;text-align:center;color:var(--text3)">Nicio sesizare încă</p>';
}

window.submitContact = async function() {
  const n = document.getElementById('cName').value.trim();
  const e = document.getElementById('cEmail').value.trim();
  const msg = document.getElementById('cMessage').value.trim();
  const m = document.getElementById('contactMsg');
  if (!n || !e || !msg) { showMsg(m, 'Completați câmpurile obligatorii', 'err'); return; }
  const r = await fetch('/api/contact', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: n, email: e, subject: document.getElementById('cSubject').value.trim(), message: msg })
  });
  if (r.ok) {
    showMsg(m, 'Mesaj trimis cu succes!', 'ok'); toast('Mesaj trimis!', 'ok');
    ['cName', 'cEmail', 'cSubject', 'cMessage'].forEach(id => document.getElementById(id).value = '');
  } else showMsg(m, 'Eroare', 'err');
};

/* ═══════════════════════════════════════
   DETAIL MODAL
   ═══════════════════════════════════════ */
window.openDetail = async function(id) {
  try {
    const r = await api('/api/reports/' + id).then(x => x.json());
    const isP = currentUser && ['primar', 'admin'].includes(currentUser.role);
    const isD = currentUser && currentUser.role === 'departament';

    let h = '<h2>' + esc(r.title) + '</h2>';
    h += '<p><span class="badge b-' + r.status + '">' + (STAT[r.status] || r.status) + '</span>';
    h += ' · ' + (r.priority === 'urgent' ? '🔴 Urgent' : 'Normal');
    h += ' · Nr: ' + (r.cerere_nr || '—') + '</p>';
    h += '<p style="color:var(--text2);font-size:.88rem">' + (CAT[r.category] || r.category) + ' · ' + fmtD(r.created_at);
    if (r.author_name) h += ' · ' + esc(r.author_name);
    if (r.address) h += ' · 📍 ' + esc(r.address);
    h += '</p>';
    if (r.photo_path) h += '<img src="' + r.photo_path + '" style="width:100%;max-height:300px;object-fit:cover;border-radius:8px;margin:1rem 0">';
    h += '<p style="line-height:1.85;margin:1rem 0">' + esc(r.description) + '</p>';
    if (r.latitude && r.longitude) h += '<div id="dMap" class="detail-map"></div>';
    if (r.dept_name) h += '<p style="font-size:.88rem"><strong>Departament:</strong> ' + esc(r.dept_name) + '</p>';
    if (r.rezolutie) h += '<div class="detail-section"><h4>📋 Rezoluția primarului</h4><p>' + esc(r.rezolutie) + '</p></div>';
    if (r.department_notes) h += '<div class="detail-section"><h4>📝 Note departament</h4><p>' + esc(r.department_notes) + '</p></div>';

    // Primar: assign
    if (isP) {
      if (!allDepts.length) allDepts = await fetch('/api/departments').then(x => x.json());
      h += '<div class="detail-section"><h4>Redirecționare către departament</h4>';
      h += '<div class="dept-grid">';
      allDepts.forEach(d => {
        h += '<label class="dept-opt"><input type="radio" name="asDept" value="' + d.id + '"' + (r.department_id === d.id ? ' checked' : '') + '> ' + esc(d.name) + '</label>';
      });
      h += '</div>';
      h += '<div class="f" style="margin-top:.5rem"><label>Rezoluție</label><textarea id="dRez" rows="2">' + esc(r.rezolutie || '') + '</textarea></div>';
      h += '<div style="display:flex;gap:.5rem;margin-top:.5rem">';
      h += '<button class="btn-primary" onclick="assignReport(' + r.id + ')">Redirecționează →</button>';
      h += '<button class="btn-danger" onclick="delReport(' + r.id + ')">Șterge</button>';
      h += '</div></div>';
    }

    // Dept: update
    if (isD) {
      h += '<div class="detail-section"><h4>Actualizare status</h4>';
      h += '<div class="f"><label>Status</label><select id="dStat"><option value="in_lucru"' + (r.status === 'in_lucru' ? ' selected' : '') + '>În lucru</option><option value="rezolvat"' + (r.status === 'rezolvat' ? ' selected' : '') + '>Rezolvat</option></select></div>';
      h += '<div class="f"><label>Note</label><textarea id="dNotes" rows="2">' + esc(r.department_notes || '') + '</textarea></div>';
      h += '<button class="btn-primary" onclick="updateDept(' + r.id + ')">Salvează</button>';
      h += '</div>';
    }

    document.getElementById('modalBody').innerHTML = h;
    document.getElementById('modal').classList.add('open');

    // Detail map
    if (r.latitude && r.longitude) {
      setTimeout(() => {
        if (detailMap) { detailMap.remove(); detailMap = null; }
        detailMap = L.map('dMap').setView([r.latitude, r.longitude], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(detailMap);
        L.marker([r.latitude, r.longitude]).addTo(detailMap);
      }, 300);
    }
    if (ttsOn) speak('Sesizare: ' + r.title + '. Status: ' + (STAT[r.status] || r.status));
  } catch (e) { toast('Eroare la încărcare', 'err'); }
};

window.closeDetail = function() {
  document.getElementById('modal').classList.remove('open');
  if (detailMap) { detailMap.remove(); detailMap = null; }
};

window.assignReport = async function(id) {
  const dept = document.querySelector('input[name="asDept"]:checked')?.value;
  if (!dept) { toast('Selectați un departament', 'err'); return; }
  await api('/api/reports/' + id + '/assign', { method: 'PATCH', body: { department_id: parseInt(dept), rezolutie: document.getElementById('dRez')?.value } });
  toast('Redirecționat!', 'ok'); closeDetail(); loadPrimar();
};

window.updateDept = async function(id) {
  await api('/api/reports/' + id + '/dept', { method: 'PATCH', body: { status: document.getElementById('dStat').value, department_notes: document.getElementById('dNotes').value } });
  toast('Actualizat!', 'ok'); closeDetail(); loadDept();
};

window.delReport = async function(id) {
  if (!confirm('Sigur doriți să ștergeți?')) return;
  await api('/api/reports/' + id, { method: 'DELETE' });
  toast('Șters', 'info'); closeDetail(); loadPrimar();
};

/* ═══════════════════════════════════════
   PRIMAR
   ═══════════════════════════════════════ */
async function loadPrimar() {
  const s = await fetch('/api/reports/stats').then(r => r.json());
  document.getElementById('psTotal').textContent = s.total;
  document.getElementById('psUnassigned').textContent = s.unassigned;
  document.getElementById('psUrg').textContent = s.urgent;
  loadPrimarReports();
  loadPrimarNews();
}

window.loadPrimarReports = async function() {
  const st = document.getElementById('pfStatus').value;
  let u = '/api/reports?'; if (st) u += 'status=' + st;
  const reps = await fetch(u).then(r => r.json());
  document.getElementById('pReportsBody').innerHTML = reps.map(r =>
    '<tr onclick="openDetail(' + r.id + ')"><td><strong>' + esc(r.cerere_nr || '—') + '</strong></td><td>' + esc(r.title) + '</td><td>' + (CAT[r.category] || r.category) + '</td><td><span class="badge b-' + r.status + '">' + (STAT[r.status] || r.status) + '</span></td><td>' + esc(r.dept_name || '—') + '</td><td>' + fmtD(r.created_at) + '</td></tr>'
  ).join('');
};

async function loadPrimarNews() {
  const n = await fetch('/api/news').then(r => r.json());
  document.getElementById('pNewsList').innerHTML = n.map(x =>
    '<div class="list-item"><span>' + esc(x.title) + '</span><button class="btn-danger" onclick="event.stopPropagation();delNews(' + x.id + ')">Șterge</button></div>'
  ).join('');
}

window.submitNews = async function() {
  const t = document.getElementById('nTitle').value.trim();
  const c = document.getElementById('nContent').value.trim();
  if (!t || !c) { toast('Titlu + conținut obligatorii', 'err'); return; }
  await api('/api/news', { method: 'POST', body: { title: t, content: c, category: document.getElementById('nCatSel')?.value || 'general' } });
  toast('Știre publicată!', 'ok');
  document.getElementById('nTitle').value = ''; document.getElementById('nContent').value = '';
  loadPrimarNews();
};

window.delNews = async function(id) {
  if (!confirm('Sigur?')) return;
  await api('/api/news/' + id, { method: 'DELETE' });
  toast('Șters', 'info'); loadPrimarNews();
};

window.showPanel = function(panelId, btn, pageId) {
  const page = document.getElementById(pageId);
  page.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  page.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(panelId).classList.add('active');
  btn.classList.add('active');
};

/* ═══════════════════════════════════════
   DEPARTMENT
   ═══════════════════════════════════════ */
async function loadDept() {
  const reps = await api('/api/reports').then(r => r.json());
  document.getElementById('dReportsBody').innerHTML = reps.map(r =>
    '<tr onclick="openDetail(' + r.id + ')"><td><strong>' + esc(r.cerere_nr || '—') + '</strong></td><td>' + esc(r.title) + '</td><td><span class="badge b-' + r.status + '">' + (STAT[r.status] || r.status) + '</span></td><td>' + esc(r.address || '—') + '</td><td>' + fmtD(r.created_at) + '</td></tr>'
  ).join('');
}

/* ═══════════════════════════════════════
   ADMIN
   ═══════════════════════════════════════ */
async function loadAdmin() { loadAdminDepts(); loadAdminUsers(); }

async function loadAdminDepts() {
  const ds = await fetch('/api/departments').then(r => r.json());
  allDepts = ds;
  document.getElementById('aDeptsList').innerHTML = ds.map(d =>
    '<div class="list-item"><span>' + esc(d.name) + '</span><button class="btn-danger" onclick="delDept(' + d.id + ')">Șterge</button></div>'
  ).join('');
  const sel = document.getElementById('auDept');
  sel.innerHTML = '<option value="">— Niciunul —</option>' + ds.map(d => '<option value="' + d.id + '">' + esc(d.name) + '</option>').join('');
}

async function loadAdminUsers() {
  const us = await api('/api/users').then(r => r.json());
  document.getElementById('aUsersList').innerHTML = us.map(u =>
    '<div class="list-item"><span>' + esc(u.full_name || u.username) + ' (' + u.role + (u.dept_name ? ' · ' + u.dept_name : '') + ')</span>' +
    (u.role !== 'admin' ? '<button class="btn-danger" onclick="delUser(' + u.id + ')">Șterge</button>' : '') + '</div>'
  ).join('');
}

window.submitDept = async function() {
  const n = document.getElementById('adName').value.trim();
  if (!n) { toast('Introduceți numele', 'err'); return; }
  await api('/api/departments', { method: 'POST', body: { name: n } });
  document.getElementById('adName').value = ''; toast('Adăugat!', 'ok'); loadAdminDepts();
};

window.submitUser = async function() {
  const u = document.getElementById('auUser').value.trim();
  const e = document.getElementById('auEmail').value.trim();
  const p = document.getElementById('auPass').value;
  if (!u || !e || !p) { toast('Câmpuri obligatorii', 'err'); return; }
  const r = await api('/api/users', { method: 'POST', body: { username: u, email: e, password: p, role: document.getElementById('auRole').value, department_id: document.getElementById('auDept').value || null } });
  if (r.ok) { toast('Adăugat!', 'ok'); ['auUser', 'auEmail', 'auPass'].forEach(id => document.getElementById(id).value = ''); loadAdminUsers(); }
  else { const d = await r.json(); toast(d.error || 'Eroare', 'err'); }
};

window.delDept = async function(id) { if (!confirm('Sigur?')) return; await api('/api/departments/' + id, { method: 'DELETE' }); loadAdminDepts(); };
window.delUser = async function(id) { if (!confirm('Sigur?')) return; await api('/api/users/' + id, { method: 'DELETE' }); loadAdminUsers(); };

/* ═══════════════════════════════════════
   AI CHAT
   ═══════════════════════════════════════ */
let chatHistory = [];

window.toggleChat = function() {
  const p = document.getElementById('chatPanel');
  p.classList.toggle('open');
  if (p.classList.contains('open')) document.getElementById('chatInput').focus();
};

window.sendChat = async function() {
  const inp = document.getElementById('chatInput');
  const msg = inp.value.trim();
  if (!msg) return;
  inp.value = '';

  addChatMsg(msg, 'user');
  chatHistory.push({ role: 'user', content: msg });

  try {
    const r = await fetch('/api/ai/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: chatHistory.slice(-8) })
    });
    const d = await r.json();
    addChatMsg(d.reply, 'bot');
    chatHistory.push({ role: 'assistant', content: d.reply });
    if (ttsOn) speak(d.reply);
  } catch (e) {
    addChatMsg('Eroare de conexiune. Încercați din nou.', 'bot');
  }
};

function addChatMsg(text, who) {
  const c = document.getElementById('chatMsgs');
  const d = document.createElement('div');
  d.className = 'chat-msg ' + who;
  d.innerHTML = '<div class="chat-text">' + esc(text) + '</div>';
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

/* ═══════════════════════════════════════
   ACCESSIBILITY — Voice First
   ═══════════════════════════════════════ */
function initA11y() {
  const overlay = document.getElementById('a11yOverlay');
  if (synth) { synth.getVoices(); synth.onvoiceschanged = () => synth.getVoices(); }

  // Already chose before
  const saved = localStorage.getItem('a11y');
  if (saved === 'true') { overlay.classList.add('hidden'); enableA11y(); return; }
  if (saved === 'false') { overlay.classList.add('hidden'); return; }

  // First visit: speak the message
  setTimeout(() => {
    speakRaw('Bine ați venit pe portalul Primăriei Municipiului Galați. Dacă aveți probleme de vedere, apăsați orice tastă. Altfel, faceți click oriunde.');
  }, 800);

  // Any keypress = enable a11y
  function onKey(e) {
    if (overlay.classList.contains('hidden')) return;
    e.preventDefault();
    if (synth) synth.cancel();
    overlay.classList.add('hidden');
    localStorage.setItem('a11y', 'true');
    enableA11y();
    setTimeout(() => speak('Modul accesibil este activat. Voi citi tot ce selectați. Folosiți Tab pentru a naviga și Enter pentru a selecta.'), 300);
    document.removeEventListener('keydown', onKey);
  }
  document.addEventListener('keydown', onKey);

  // Click = normal mode
  overlay.addEventListener('click', () => {
    if (synth) synth.cancel();
    overlay.classList.add('hidden');
    localStorage.setItem('a11y', 'false');
    document.removeEventListener('keydown', onKey);
  });
}

function enableA11y() {
  a11yActive = true; ttsOn = true;
  document.body.classList.add('a11y');
  document.getElementById('a11yBtn').classList.add('active');
  document.getElementById('a11yBar').classList.add('active');

  // Make things tabbable
  document.querySelectorAll('.nav-a, .btn-primary, .btn-ghost, .btn-danger, .news-card, .inst, .rp-item, .tbl tr, .list-item').forEach(el => {
    if (!el.getAttribute('tabindex')) el.setAttribute('tabindex', '0');
  });

  // Read focused element
  document.addEventListener('focusin', onA11yFocus);
}

function disableA11y() {
  a11yActive = false; ttsOn = false;
  if (synth) synth.cancel();
  document.body.classList.remove('a11y');
  document.getElementById('a11yBtn').classList.remove('active');
  document.getElementById('a11yBar').classList.remove('active');
  document.removeEventListener('focusin', onA11yFocus);
  localStorage.setItem('a11y', 'false');
}

window.toggleA11y = function() {
  if (a11yActive) { disableA11y(); speakRaw('Mod accesibil dezactivat'); setTimeout(() => { if (synth) synth.cancel(); }, 2000); }
  else { enableA11y(); speak('Mod accesibil activat. Folosiți Tab pentru navigare.'); }
};

function onA11yFocus(e) {
  if (!ttsOn) return;
  const el = e.target; let text = '';

  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const label = el.closest('.f')?.querySelector('label')?.textContent || '';
    text = 'Câmp: ' + label + '. ' + (el.value || el.placeholder || '');
  } else if (el.tagName === 'SELECT') {
    const label = el.closest('.f')?.querySelector('label')?.textContent || '';
    text = 'Selector: ' + label + '. ' + (el.options[el.selectedIndex]?.textContent || '');
  } else if (el.tagName === 'BUTTON' || el.classList.contains('btn-primary') || el.classList.contains('btn-ghost')) {
    text = 'Buton: ' + el.textContent.trim();
  } else if (el.classList.contains('nav-a')) {
    text = 'Meniu: ' + el.textContent.trim();
  } else if (el.classList.contains('news-card')) {
    text = 'Știre: ' + (el.querySelector('h3')?.textContent || '');
  } else if (el.classList.contains('rp-item')) {
    text = 'Sesizare: ' + (el.querySelector('.rp-title')?.textContent || '');
  } else if (el.tagName === 'TR') {
    text = Array.from(el.querySelectorAll('td')).map(td => td.textContent.trim()).join('. ');
  } else {
    text = el.textContent?.trim()?.substring(0, 100) || '';
  }

  if (text) {
    speak(text);
    document.getElementById('a11yBarText').textContent = text;
  }
}

function speak(text) { if (ttsOn && synth) speakRaw(text); }

function speakRaw(text) {
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ro-RO'; u.rate = 0.9;
  const v = synth.getVoices().find(v => v.lang.startsWith('ro'));
  if (v) u.voice = v;
  synth.speak(u);
}
