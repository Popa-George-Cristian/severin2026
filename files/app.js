/* ═══════════════════════════════════════════════════════════════
   PRIMĂRIA DIGITALĂ GALAȚI — Frontend Application
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initAuth();
  initNavigation();
  initMaps();
  loadHomeData();
});

// ── State ───────────────────────────────────────────────────────
let homeMap, reportMap, detailMap;
let reportMarker = null;
let currentUser = null;
let authToken = localStorage.getItem('authToken');

// Galați center
const DEFAULT_CENTER = [45.4353, 28.0080];
const DEFAULT_ZOOM = 14;

const CATEGORY_LABELS = {
  drum: '🛣️ Drum', iluminat: '💡 Iluminat', salubritate: '🗑️ Salubritate',
  spatii_verzi: '🌳 Spații Verzi', mobilier_urban: '🪑 Mobilier Urban',
  constructii: '🏗️ Construcții', altele: '📋 Altele'
};
const STATUS_LABELS = { nou: 'Nou', in_lucru: 'În lucru', rezolvat: 'Rezolvat' };
const STATUS_COLORS = { nou: '#b7791f', in_lucru: '#c05621', rezolvat: '#2f855a' };

// ── API Helper ──────────────────────────────────────────────────
function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (authToken) headers['x-auth-token'] = authToken;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  return fetch(url, { ...options, headers });
}

// ══════════════════════════════════════════════════════════════════
// ── AUTH SYSTEM ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function initAuth() {
  // Auth modal tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('authPanel-' + tab.dataset.authTab).classList.add('active');
    });
  });

  // Close modal
  document.getElementById('authModalClose').addEventListener('click', closeAuthModal);
  document.getElementById('authModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAuthModal();
  });

  // Login
  document.getElementById('loginBtn').addEventListener('click', handleLogin);
  document.getElementById('loginPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });

  // Register
  document.getElementById('registerBtn').addEventListener('click', handleRegister);
  document.getElementById('regPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRegister(); });

  // Nav auth button
  document.getElementById('navAuthBtn').addEventListener('click', (e) => {
    e.preventDefault();
    if (currentUser) {
      handleLogout();
    } else {
      openAuthModal();
    }
  });

  // Report page login button
  document.getElementById('reportLoginBtn').addEventListener('click', () => openAuthModal());

  // Check existing session
  if (authToken) {
    api('/api/auth/me').then(r => r.json()).then(data => {
      if (data.user) {
        setUser(data.user);
      } else {
        clearAuth();
      }
    }).catch(() => clearAuth());
  }
}

function openAuthModal() {
  document.getElementById('authModal').classList.add('open');
  document.getElementById('loginUser').focus();
  lucide.createIcons();
}

function closeAuthModal() {
  document.getElementById('authModal').classList.remove('open');
  clearAuthForms();
}

function clearAuthForms() {
  ['loginUser', 'loginPass', 'regUser', 'regEmail', 'regPass'].forEach(id => {
    document.getElementById(id).value = '';
  });
  ['loginMsg', 'regMsg'].forEach(id => {
    document.getElementById(id).style.display = 'none';
  });
}

async function handleLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  const msgEl = document.getElementById('loginMsg');

  if (!username || !password) { showMessage(msgEl, 'Completați ambele câmpuri', 'error'); return; }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      setUser(data.user);
      closeAuthModal();
      showToast(`Bine ai venit, ${data.user.username}!`, 'success');
    } else {
      showMessage(msgEl, data.error, 'error');
    }
  } catch (err) {
    showMessage(msgEl, 'Eroare de conexiune', 'error');
  }
}

async function handleRegister() {
  const username = document.getElementById('regUser').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPass').value;
  const msgEl = document.getElementById('regMsg');

  if (!username || !email || !password) { showMessage(msgEl, 'Completați toate câmpurile', 'error'); return; }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (res.ok) {
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      setUser(data.user);
      closeAuthModal();
      showToast(`Cont creat! Bine ai venit, ${data.user.username}!`, 'success');
    } else {
      showMessage(msgEl, data.error, 'error');
    }
  } catch (err) {
    showMessage(msgEl, 'Eroare de conexiune', 'error');
  }
}

async function handleLogout() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  clearAuth();
  showToast('V-ați deconectat', 'info');
  navigateTo('home');
}

function setUser(user) {
  currentUser = user;
  const authText = document.getElementById('navAuthText');
  authText.textContent = user.username;

  // Show admin link if admin
  document.getElementById('navAdminLi').style.display = user.role === 'admin' ? '' : 'none';

  // Update report page visibility
  updateReportPageAuth();
}

function clearAuth() {
  currentUser = null;
  authToken = null;
  localStorage.removeItem('authToken');
  document.getElementById('navAuthText').textContent = 'Conectare';
  document.getElementById('navAdminLi').style.display = 'none';
  updateReportPageAuth();
}

function updateReportPageAuth() {
  const notice = document.getElementById('reportAuthNotice');
  const content = document.getElementById('reportContent');
  if (currentUser) {
    notice.style.display = 'none';
    content.style.display = '';
  } else {
    notice.style.display = '';
    content.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════════════
// ── NAVIGATION ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function initNavigation() {
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-page]');
    if (trigger) {
      e.preventDefault();
      navigateTo(trigger.dataset.page);
    }
    // News article click
    const card = e.target.closest('[data-article-id]');
    if (card) {
      e.preventDefault();
      navigateTo('article', { articleId: card.dataset.articleId });
    }
  });

  document.getElementById('navToggle').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('open');
  });

  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 30);
  });

  // Admin tabs
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.adminTab).classList.add('active');
    });
  });

  // Forms
  document.getElementById('submitReport').addEventListener('click', submitReport);
  document.getElementById('submitContact').addEventListener('click', submitContact);
  document.getElementById('submitNews').addEventListener('click', submitAddNews);

  // Photo upload
  const fileArea = document.getElementById('fileUploadArea');
  const fileInput = document.getElementById('rPhoto');
  fileArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.getElementById('photoPreview');
        preview.src = ev.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  });

  // Admin filters
  document.getElementById('adminFilterStatus').addEventListener('change', loadAdminReports);
  document.getElementById('adminFilterCategory').addEventListener('change', loadAdminReports);
}

function navigateTo(page, data) {
  document.getElementById('navLinks').classList.remove('open');

  // Check permissions
  if (page === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
    showToast('Acces interzis — doar pentru administratori', 'error');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) {
    pageEl.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (page === 'report') {
    updateReportPageAuth();
    setTimeout(() => { if (reportMap) reportMap.invalidateSize(); loadReportsList(); }, 100);
  } else if (page === 'news') {
    loadNewsPage();
  } else if (page === 'article' && data) {
    loadArticle(data.articleId);
  } else if (page === 'admin') {
    loadAdminData();
  } else if (page === 'home') {
    setTimeout(() => { if (homeMap) homeMap.invalidateSize(); loadHomeData(); }, 100);
  }

  lucide.createIcons();
}

// ══════════════════════════════════════════════════════════════════
// ── MAPS ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

function initMaps() {
  homeMap = L.map('homeMap').setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(homeMap);
  loadMapMarkers(homeMap);

  reportMap = L.map('reportMap').setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(reportMap);
  reportMap.on('click', (e) => {
    const { lat, lng } = e.latlng;
    if (reportMarker) { reportMarker.setLatLng(e.latlng); }
    else {
      reportMarker = L.marker(e.latlng, { draggable: true, icon: createMarkerIcon('red') }).addTo(reportMap);
      reportMarker.on('dragend', () => { const p = reportMarker.getLatLng(); updateLocationFields(p.lat, p.lng); });
    }
    updateLocationFields(lat, lng);
  });
  loadMapMarkers(reportMap);
}

function createMarkerIcon(color) {
  const colors = { red: '#c53030', yellow: '#b7791f', orange: '#c05621', green: '#2f855a', blue: '#2b6cb0' };
  const c = colors[color] || colors.blue;
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="width:28px;height:28px;background:${c};border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
    iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -16]
  });
}

async function loadMapMarkers(map) {
  try {
    const reports = await fetch('/api/reports').then(r => r.json());
    reports.forEach(r => {
      if (r.latitude && r.longitude) {
        const statusColor = r.status === 'rezolvat' ? 'green' : r.status === 'in_lucru' ? 'orange' : 'yellow';
        L.marker([r.latitude, r.longitude], {
          icon: createMarkerIcon(r.priority === 'urgent' ? 'red' : statusColor)
        }).addTo(map).bindPopup(`
          <div style="min-width:200px">
            <strong>${esc(r.title)}</strong>
            <div style="margin:0.4rem 0;font-size:0.85rem;color:#5a6478">${CATEGORY_LABELS[r.category] || r.category}</div>
            <p style="font-size:0.85rem;margin:0.4rem 0">${esc(r.description).substring(0, 100)}...</p>
            ${r.photo_path ? `<img src="${r.photo_path}" style="width:100%;border-radius:6px;margin:0.5rem 0">` : ''}
            <div style="display:flex;justify-content:space-between;margin-top:0.5rem;padding-top:0.5rem;border-top:1px solid #eee">
              <span style="padding:2px 8px;border-radius:20px;font-size:0.72rem;font-weight:600;background:${r.status==='rezolvat'?'#f0fff4':r.status==='in_lucru'?'#fffaf0':'#fefcbf'};color:${STATUS_COLORS[r.status]}">${STATUS_LABELS[r.status]}</span>
              <span style="font-size:0.78rem;color:#8a95a8">${formatDate(r.created_at)}</span>
            </div>
          </div>
        `);
      }
    });
  } catch (err) { console.error('Map markers error:', err); }
}

function updateLocationFields(lat, lng) {
  document.getElementById('rLat').value = lat;
  document.getElementById('rLng').value = lng;
  document.getElementById('rAddress').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ro`)
    .then(r => r.json())
    .then(data => { if (data.display_name) document.getElementById('rAddress').value = data.display_name.split(',').slice(0, 3).join(','); })
    .catch(() => {});
}

// ══════════════════════════════════════════════════════════════════
// ── REPORT DETAIL MODAL ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

async function openReportDetail(id) {
  try {
    const r = await api(`/api/reports/${id}`).then(res => res.json());
    const isAdmin = currentUser && currentUser.role === 'admin';

    let html = `<div class="report-detail">
      <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;margin-bottom:0.5rem">
        <span class="status-badge sb-${r.status}">${STATUS_LABELS[r.status]}</span>
        <span class="priority-badge pb-${r.priority}">${r.priority === 'urgent' ? '🔴 Urgent' : 'Normal'}</span>
        <span style="font-size:0.82rem;color:var(--text-light)">#${r.id}</span>
      </div>
      <h2>${esc(r.title)}</h2>
      <div class="report-detail-meta">
        <span>${CATEGORY_LABELS[r.category] || r.category}</span>
        <span>📅 ${formatDate(r.created_at)}</span>
        ${r.author ? `<span>👤 ${esc(r.author)}</span>` : ''}
        ${r.address ? `<span>📍 ${esc(r.address)}</span>` : ''}
        ${r.updated_at !== r.created_at ? `<span>🔄 Actualizat: ${formatDate(r.updated_at)}</span>` : ''}
      </div>`;

    if (r.photo_path) {
      html += `<img src="${r.photo_path}" class="report-detail-photo" alt="Fotografie raport">`;
    }

    html += `<div class="report-detail-desc">${esc(r.description)}</div>`;

    if (r.latitude && r.longitude) {
      html += `<h4 style="margin-bottom:0.5rem">📍 Locație pe hartă</h4>
        <div id="detailMapContainer" class="report-detail-map"></div>`;
    }

    if (r.admin_notes) {
      html += `<div class="report-detail-admin">
        <h4>📝 Note administrator</h4>
        <p>${esc(r.admin_notes)}</p>
      </div>`;
    }

    // Admin controls
    if (isAdmin) {
      html += `<div class="report-detail-admin" style="margin-top:1.5rem">
        <h4>⚙️ Acțiuni admin</h4>
        <div class="form-body">
          <div class="form-row">
            <div class="form-group">
              <label>Status</label>
              <select id="detailStatus">
                <option value="nou" ${r.status==='nou'?'selected':''}>Nou</option>
                <option value="in_lucru" ${r.status==='in_lucru'?'selected':''}>În lucru</option>
                <option value="rezolvat" ${r.status==='rezolvat'?'selected':''}>Rezolvat</option>
              </select>
            </div>
            <div class="form-group">
              <label>Prioritate</label>
              <select id="detailPriority">
                <option value="normal" ${r.priority==='normal'?'selected':''}>Normal</option>
                <option value="urgent" ${r.priority==='urgent'?'selected':''}>Urgent</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label>Note administrator</label>
            <textarea id="detailNotes" rows="3" placeholder="Adăugați note interne...">${esc(r.admin_notes || '')}</textarea>
          </div>
          <div style="display:flex;gap:0.75rem">
            <button class="btn btn-primary" onclick="saveReportDetail(${r.id})">
              <i data-lucide="save" style="width:16px;height:16px"></i> Salvează
            </button>
            <button class="btn btn-danger" onclick="if(confirm('Sigur?')){deleteReport(${r.id});closeReportDetail();}">
              <i data-lucide="trash-2" style="width:16px;height:16px"></i> Șterge
            </button>
          </div>
        </div>
      </div>`;
    }

    html += `</div>`;

    document.getElementById('reportDetailContent').innerHTML = html;
    document.getElementById('reportDetailModal').classList.add('open');
    lucide.createIcons();

    // Init detail map
    if (r.latitude && r.longitude) {
      setTimeout(() => {
        if (detailMap) { detailMap.remove(); detailMap = null; }
        detailMap = L.map('detailMapContainer').setView([r.latitude, r.longitude], 16);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(detailMap);
        L.marker([r.latitude, r.longitude], { icon: createMarkerIcon(r.priority === 'urgent' ? 'red' : 'blue') }).addTo(detailMap);
      }, 200);
    }
  } catch (err) {
    showToast('Eroare la încărcarea raportului', 'error');
    console.error(err);
  }
}

window.closeReportDetail = function() {
  document.getElementById('reportDetailModal').classList.remove('open');
  if (detailMap) { detailMap.remove(); detailMap = null; }
};

// Close detail modal on overlay click
document.getElementById('reportDetailModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeReportDetail();
});

window.saveReportDetail = async function(id) {
  const status = document.getElementById('detailStatus').value;
  const priority = document.getElementById('detailPriority').value;
  const admin_notes = document.getElementById('detailNotes').value;

  try {
    await api(`/api/reports/${id}`, {
      method: 'PATCH',
      body: { status, priority, admin_notes }
    });
    showToast('Raport actualizat', 'success');
    closeReportDetail();
    loadAdminData();
  } catch (err) {
    showToast('Eroare la salvare', 'error');
  }
};

// ══════════════════════════════════════════════════════════════════
// ── DATA LOADING ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

async function loadHomeData() {
  try {
    const stats = await fetch('/api/reports/stats').then(r => r.json());
    document.getElementById('statTotal').textContent = stats.total;
    const resolved = stats.byStatus.find(s => s.status === 'rezolvat');
    const inProgress = stats.byStatus.find(s => s.status === 'in_lucru');
    document.getElementById('statResolved').textContent = resolved ? resolved.count : 0;
    document.getElementById('statProgress').textContent = inProgress ? inProgress.count : 0;

    const news = await fetch('/api/news').then(r => r.json());
    document.getElementById('homeNewsGrid').innerHTML = news.slice(0, 3).map(createNewsCard).join('');
  } catch (err) { console.error(err); }
}

function createNewsCard(n) {
  return `<div class="news-card" data-article-id="${n.id}">
    ${n.image_url ? `<div class="news-card-img" style="background-image:url(${n.image_url})"></div>` : ''}
    <div class="news-card-body">
      <div class="news-card-cat">${esc(n.category)}</div>
      <h3>${esc(n.title)}</h3>
      <p>${esc(n.summary || n.content.substring(0, 150) + '...')}</p>
      <div class="news-card-date">${formatDate(n.created_at)}</div>
    </div>
  </div>`;
}

async function loadNewsPage() {
  const news = await fetch('/api/news').then(r => r.json());
  document.getElementById('newsFullGrid').innerHTML = news.map(createNewsCard).join('');
}

async function loadArticle(id) {
  const a = await fetch(`/api/news/${id}`).then(r => r.json());
  const body = a.content.split('\n').map(p => p.trim() ? `<p>${esc(p)}</p>` : '').join('');
  document.getElementById('articleContent').innerHTML = `
    <div class="news-card-cat" style="margin-bottom:0.5rem">${esc(a.category)}</div>
    <h1>${esc(a.title)}</h1>
    <div class="article-meta">${formatDate(a.created_at)}</div>
    ${a.image_url ? `<img class="article-img" src="${a.image_url}" alt="">` : ''}
    <div class="article-body">${body}</div>
  `;
}

async function loadReportsList() {
  const reports = await fetch('/api/reports').then(r => r.json());
  const list = document.getElementById('reportList');
  if (!reports.length) { list.innerHTML = '<p style="padding:1rem;color:var(--text-muted);text-align:center">Nicio problemă raportată</p>'; return; }
  list.innerHTML = reports.map(r => `
    <div class="report-item" style="cursor:pointer" onclick="openReportDetail(${r.id})">
      <div class="report-dot dot-${r.status}"></div>
      <div>
        <div class="report-item-title">${esc(r.title)}</div>
        <div class="report-item-meta">${CATEGORY_LABELS[r.category] || r.category} · ${STATUS_LABELS[r.status]} · ${formatDate(r.created_at)}</div>
      </div>
    </div>
  `).join('');
}

// ── Report Submit ───────────────────────────────────────────────
async function submitReport() {
  const title = document.getElementById('rTitle').value.trim();
  const description = document.getElementById('rDesc').value.trim();
  const category = document.getElementById('rCategory').value;
  const priority = document.getElementById('rPriority').value;
  const lat = document.getElementById('rLat').value;
  const lng = document.getElementById('rLng').value;
  const address = document.getElementById('rAddress').value;
  const photo = document.getElementById('rPhoto').files[0];
  const msgEl = document.getElementById('reportMessage');

  if (!title || !description || !category) { showMessage(msgEl, 'Completați titlul, categoria și descrierea', 'error'); return; }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', description);
  formData.append('category', category);
  formData.append('priority', priority);
  if (lat) formData.append('latitude', lat);
  if (lng) formData.append('longitude', lng);
  if (address) formData.append('address', address);
  if (photo) formData.append('photo', photo);

  try {
    const res = await api('/api/reports', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok) {
      showMessage(msgEl, 'Raportul a fost trimis cu succes!', 'success');
      showToast('Raport trimis!', 'success');
      ['rTitle', 'rDesc', 'rAddress', 'rLat', 'rLng'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('rCategory').value = '';
      document.getElementById('rPriority').value = 'normal';
      document.getElementById('rPhoto').value = '';
      document.getElementById('photoPreview').style.display = 'none';
      if (reportMarker) { reportMap.removeLayer(reportMarker); reportMarker = null; }
      loadReportsList();
      reportMap.eachLayer(l => { if (l instanceof L.Marker) reportMap.removeLayer(l); });
      loadMapMarkers(reportMap);
    } else {
      showMessage(msgEl, data.error || 'Eroare', 'error');
    }
  } catch (err) { showMessage(msgEl, 'Eroare de conexiune', 'error'); }
}

// ── Contact Submit ──────────────────────────────────────────────
async function submitContact() {
  const name = document.getElementById('cName').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const subject = document.getElementById('cSubject').value.trim();
  const message = document.getElementById('cMessage').value.trim();
  const msgEl = document.getElementById('contactMessage');

  if (!name || !email || !message) { showMessage(msgEl, 'Completați câmpurile obligatorii', 'error'); return; }

  try {
    const res = await fetch('/api/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, subject, message })
    });
    if (res.ok) {
      showMessage(msgEl, 'Mesaj trimis cu succes!', 'success');
      showToast('Mesaj trimis!', 'success');
      ['cName', 'cEmail', 'cSubject', 'cMessage'].forEach(id => document.getElementById(id).value = '');
    } else { showMessage(msgEl, 'Eroare', 'error'); }
  } catch (err) { showMessage(msgEl, 'Eroare de conexiune', 'error'); }
}

// ══════════════════════════════════════════════════════════════════
// ── ADMIN ───────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

async function loadAdminData() {
  await Promise.all([loadAdminStats(), loadAdminReports(), loadAdminNews(), loadAdminMessages()]);
}

async function loadAdminStats() {
  const stats = await fetch('/api/reports/stats').then(r => r.json());
  document.getElementById('aStatTotal').textContent = stats.total;
  document.getElementById('aStatUrgent').textContent = stats.urgent;
  const gc = (s) => (stats.byStatus.find(x => x.status === s) || { count: 0 }).count;
  document.getElementById('aStatNew').textContent = gc('nou');
  document.getElementById('aStatProgress').textContent = gc('in_lucru');
  document.getElementById('aStatResolved').textContent = gc('rezolvat');
}

async function loadAdminReports() {
  const status = document.getElementById('adminFilterStatus').value;
  const category = document.getElementById('adminFilterCategory').value;
  let url = '/api/reports?';
  if (status) url += `status=${status}&`;
  if (category) url += `category=${category}&`;

  const reports = await fetch(url).then(r => r.json());
  document.getElementById('adminReportsBody').innerHTML = reports.map(r => `
    <tr onclick="openReportDetail(${r.id})">
      <td><strong>#${r.id}</strong></td>
      <td>
        <div style="font-weight:600">${esc(r.title)}</div>
        <div style="font-size:0.8rem;color:var(--text-light)">${esc(r.address || 'Fără adresă')}</div>
      </td>
      <td>${CATEGORY_LABELS[r.category] || r.category}</td>
      <td><span class="priority-badge pb-${r.priority}">${r.priority === 'urgent' ? '🔴 Urgent' : 'Normal'}</span></td>
      <td><span class="status-badge sb-${r.status}">${STATUS_LABELS[r.status]}</span></td>
      <td style="font-size:0.85rem">${esc(r.author || '—')}</td>
      <td style="font-size:0.85rem">${formatDate(r.created_at)}</td>
      <td>
        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();openReportDetail(${r.id})">
          <i data-lucide="eye" style="width:14px;height:14px"></i> Detalii
        </button>
      </td>
    </tr>
  `).join('');
  lucide.createIcons();
}

async function loadAdminNews() {
  const news = await fetch('/api/news').then(r => r.json());
  document.getElementById('adminNewsList').innerHTML = news.map(n => `
    <div class="admin-item-card">
      <div><h4>${esc(n.title)}</h4><p>${esc(n.summary || n.content.substring(0, 120) + '...')}</p><div class="meta">${n.category} · ${formatDate(n.created_at)}</div></div>
      <button class="btn btn-danger btn-sm" onclick="deleteNews(${n.id})"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
    </div>
  `).join('');
  lucide.createIcons();
}

async function loadAdminMessages() {
  const msgs = await api('/api/contact').then(r => r.json());
  document.getElementById('adminMessagesList').innerHTML = !msgs.length
    ? '<p style="text-align:center;color:var(--text-muted);padding:2rem">Niciun mesaj</p>'
    : msgs.map(m => `
      <div class="admin-item-card">
        <div><h4>${esc(m.subject || 'Fără subiect')}</h4><p>${esc(m.message)}</p><div class="meta">De la: ${esc(m.name)} (${esc(m.email)}) · ${formatDate(m.created_at)}</div></div>
      </div>
    `).join('');
}

// Admin global actions
window.deleteReport = async function(id) {
  if (!confirm('Sigur doriți să ștergeți?')) return;
  await api(`/api/reports/${id}`, { method: 'DELETE' });
  showToast('Raport șters', 'info');
  loadAdminData();
};

window.deleteNews = async function(id) {
  if (!confirm('Sigur?')) return;
  await api(`/api/news/${id}`, { method: 'DELETE' });
  showToast('Știre ștearsă', 'info');
  loadAdminNews();
};

async function submitAddNews() {
  const title = document.getElementById('nTitle').value.trim();
  const summary = document.getElementById('nSummary').value.trim();
  const content = document.getElementById('nContent').value.trim();
  const category = document.getElementById('nCategory').value;
  const image_url = document.getElementById('nImage').value.trim();
  if (!title || !content) { showToast('Titlu și conținut obligatorii', 'error'); return; }
  const res = await api('/api/news', { method: 'POST', body: { title, summary, content, category, image_url } });
  if (res.ok) {
    showToast('Știre publicată!', 'success');
    ['nTitle', 'nSummary', 'nContent', 'nImage'].forEach(id => document.getElementById(id).value = '');
    loadAdminNews();
  }
}

// ── Utilities ───────────────────────────────────────────────────
function esc(str) { if (!str) return ''; const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
// Keep backward compat
const escapeHtml = esc;

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('ro-RO', { year: 'numeric', month: 'long', day: 'numeric' });
}

function showMessage(el, msg, type) {
  el.className = 'form-message ' + type;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Make openReportDetail global
window.openReportDetail = openReportDetail;
