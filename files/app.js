/* ═══════════════════════════════════════════════════════════════
   PRIMĂRIA DIGITALĂ — Frontend Application
   ═══════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  initNavigation();
  initMaps();
  loadHomeData();
});

// ── State ───────────────────────────────────────────────────────
let homeMap, reportMap;
let reportMarker = null;
let currentPage = 'home';
const DEFAULT_CENTER = [44.4268, 26.1025]; // Bucharest area
const DEFAULT_ZOOM = 14;

const CATEGORY_LABELS = {
  drum: '🛣️ Drum',
  iluminat: '💡 Iluminat',
  salubritate: '🗑️ Salubritate',
  spatii_verzi: '🌳 Spații Verzi',
  mobilier_urban: '🪑 Mobilier Urban',
  constructii: '🏗️ Construcții',
  altele: '📋 Altele'
};

const STATUS_LABELS = {
  nou: 'Nou',
  in_lucru: 'În lucru',
  rezolvat: 'Rezolvat'
};

const STATUS_COLORS = {
  nou: '#b7791f',
  in_lucru: '#c05621',
  rezolvat: '#2f855a'
};

// ── Navigation / SPA Routing ────────────────────────────────────
function initNavigation() {
  // Page navigation
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-page]');
    if (trigger) {
      e.preventDefault();
      const page = trigger.dataset.page;
      navigateTo(page);
    }
  });

  // Mobile toggle
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  toggle.addEventListener('click', () => {
    links.classList.toggle('open');
  });

  // Navbar scroll effect
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

  // Report form
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
  // Close mobile nav
  document.getElementById('navLinks').classList.remove('open');

  // Update active states
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) {
    pageEl.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  currentPage = page;

  // Page-specific init
  if (page === 'report') {
    setTimeout(() => {
      if (reportMap) reportMap.invalidateSize();
      loadReportsList();
    }, 100);
  } else if (page === 'news') {
    loadNewsPage();
  } else if (page === 'article' && data) {
    loadArticle(data);
  } else if (page === 'admin') {
    loadAdminData();
  } else if (page === 'home') {
    setTimeout(() => {
      if (homeMap) homeMap.invalidateSize();
      loadHomeData();
    }, 100);
  }

  lucide.createIcons();
}

// ── Maps ────────────────────────────────────────────────────────
function initMaps() {
  // Home map
  const homeMapEl = document.getElementById('homeMap');
  if (homeMapEl) {
    homeMap = L.map('homeMap').setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(homeMap);
    loadMapMarkers(homeMap);
  }

  // Report map
  const reportMapEl = document.getElementById('reportMap');
  if (reportMapEl) {
    reportMap = L.map('reportMap').setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(reportMap);

    // Click to place marker
    reportMap.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (reportMarker) {
        reportMarker.setLatLng(e.latlng);
      } else {
        reportMarker = L.marker(e.latlng, {
          draggable: true,
          icon: createMarkerIcon('red')
        }).addTo(reportMap);

        reportMarker.on('dragend', () => {
          const pos = reportMarker.getLatLng();
          updateLocationFields(pos.lat, pos.lng);
        });
      }
      updateLocationFields(lat, lng);
    });

    loadMapMarkers(reportMap);
  }

  // Try to get user location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      if (homeMap) homeMap.setView([latitude, longitude], DEFAULT_ZOOM);
      if (reportMap) reportMap.setView([latitude, longitude], DEFAULT_ZOOM);
    }, () => {}, { timeout: 5000 });
  }
}

function createMarkerIcon(color) {
  const colors = {
    red: '#c53030',
    yellow: '#b7791f',
    orange: '#c05621',
    green: '#2f855a',
    blue: '#2b6cb0'
  };
  const c = colors[color] || colors.blue;
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      width:28px;height:28px;
      background:${c};
      border:3px solid white;
      border-radius:50%;
      box-shadow:0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });
}

async function loadMapMarkers(map) {
  try {
    const reports = await fetch('/api/reports').then(r => r.json());
    reports.forEach(r => {
      if (r.latitude && r.longitude) {
        const statusColor = r.status === 'rezolvat' ? 'green' : r.status === 'in_lucru' ? 'orange' : 'yellow';
        const marker = L.marker([r.latitude, r.longitude], {
          icon: createMarkerIcon(r.priority === 'urgent' ? 'red' : statusColor)
        }).addTo(map);

        marker.bindPopup(`
          <div style="min-width:200px">
            <strong style="font-size:1rem">${escapeHtml(r.title)}</strong>
            <div style="margin:0.5rem 0;font-size:0.88rem;color:#5a6478">
              ${CATEGORY_LABELS[r.category] || r.category}
            </div>
            <p style="font-size:0.88rem;margin:0.5rem 0">${escapeHtml(r.description)}</p>
            ${r.photo_path ? `<img src="${r.photo_path}" style="width:100%;border-radius:6px;margin:0.5rem 0">` : ''}
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.75rem;padding-top:0.5rem;border-top:1px solid #eee">
              <span style="
                padding:2px 8px;border-radius:20px;font-size:0.75rem;font-weight:600;
                background:${r.status === 'rezolvat' ? '#f0fff4' : r.status === 'in_lucru' ? '#fffaf0' : '#fefcbf'};
                color:${STATUS_COLORS[r.status]}
              ">${STATUS_LABELS[r.status]}</span>
              <span style="font-size:0.78rem;color:#8a95a8">${formatDate(r.created_at)}</span>
            </div>
          </div>
        `);
      }
    });
  } catch (err) {
    console.error('Error loading markers:', err);
  }
}

function updateLocationFields(lat, lng) {
  document.getElementById('rLat').value = lat;
  document.getElementById('rLng').value = lng;
  document.getElementById('rAddress').value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

  // Try reverse geocoding via Nominatim
  fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ro`)
    .then(r => r.json())
    .then(data => {
      if (data.display_name) {
        document.getElementById('rAddress').value = data.display_name.split(',').slice(0, 3).join(',');
      }
    })
    .catch(() => {});
}

// ── Home Page Data ──────────────────────────────────────────────
async function loadHomeData() {
  try {
    const stats = await fetch('/api/reports/stats').then(r => r.json());
    document.getElementById('statTotal').textContent = stats.total;

    const resolved = stats.byStatus.find(s => s.status === 'rezolvat');
    const inProgress = stats.byStatus.find(s => s.status === 'in_lucru');
    document.getElementById('statResolved').textContent = resolved ? resolved.count : 0;
    document.getElementById('statProgress').textContent = inProgress ? inProgress.count : 0;

    // Load news for home
    const news = await fetch('/api/news').then(r => r.json());
    const grid = document.getElementById('homeNewsGrid');
    grid.innerHTML = news.slice(0, 3).map(n => createNewsCard(n)).join('');
  } catch (err) {
    console.error('Error loading home data:', err);
  }
}

// ── News ────────────────────────────────────────────────────────
function createNewsCard(n) {
  return `
    <div class="news-card" data-page="article" data-article-id="${n.id}">
      ${n.image_url ? `<div class="news-card-img" style="background-image:url(${n.image_url})"></div>` : ''}
      <div class="news-card-body">
        <div class="news-card-cat">${escapeHtml(n.category)}</div>
        <h3>${escapeHtml(n.title)}</h3>
        <p>${escapeHtml(n.summary || n.content.substring(0, 150) + '...')}</p>
        <div class="news-card-date">${formatDate(n.created_at)}</div>
      </div>
    </div>
  `;
}

// Add article click handling
document.addEventListener('click', (e) => {
  const card = e.target.closest('[data-article-id]');
  if (card) {
    e.preventDefault();
    navigateTo('article', card.dataset.articleId);
  }
});

async function loadNewsPage() {
  try {
    const news = await fetch('/api/news').then(r => r.json());
    document.getElementById('newsFullGrid').innerHTML = news.map(n => createNewsCard(n)).join('');
  } catch (err) {
    console.error('Error loading news:', err);
  }
}

async function loadArticle(id) {
  try {
    const article = await fetch(`/api/news/${id}`).then(r => r.json());
    const contentHtml = article.content.split('\n').map(p => p.trim() ? `<p>${escapeHtml(p)}</p>` : '').join('');
    document.getElementById('articleContent').innerHTML = `
      <div class="news-card-cat" style="margin-bottom:0.5rem">${escapeHtml(article.category)}</div>
      <h1>${escapeHtml(article.title)}</h1>
      <div class="article-meta">${formatDate(article.created_at)}</div>
      ${article.image_url ? `<img class="article-img" src="${article.image_url}" alt="">` : ''}
      <div class="article-body">${contentHtml}</div>
    `;
  } catch (err) {
    console.error('Error loading article:', err);
  }
}

// ── Report Form ─────────────────────────────────────────────────
async function loadReportsList() {
  try {
    const reports = await fetch('/api/reports').then(r => r.json());
    const list = document.getElementById('reportList');
    if (reports.length === 0) {
      list.innerHTML = '<p style="padding:1rem;color:var(--text-muted);text-align:center">Nicio problemă raportată încă</p>';
      return;
    }
    list.innerHTML = reports.map(r => `
      <div class="report-item">
        <div class="report-dot dot-${r.status}"></div>
        <div>
          <div class="report-item-title">${escapeHtml(r.title)}</div>
          <div class="report-item-meta">
            ${CATEGORY_LABELS[r.category] || r.category} · ${STATUS_LABELS[r.status]} · ${formatDate(r.created_at)}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading reports:', err);
  }
}

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

  if (!title || !description || !category) {
    showMessage(msgEl, 'Completați titlul, categoria și descrierea', 'error');
    return;
  }

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
    const res = await fetch('/api/reports', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok) {
      showMessage(msgEl, 'Raportul a fost trimis cu succes! Mulțumim.', 'success');
      showToast('Raport trimis cu succes!', 'success');
      // Reset form
      document.getElementById('rTitle').value = '';
      document.getElementById('rDesc').value = '';
      document.getElementById('rCategory').value = '';
      document.getElementById('rPriority').value = 'normal';
      document.getElementById('rPhoto').value = '';
      document.getElementById('photoPreview').style.display = 'none';
      if (reportMarker) {
        reportMap.removeLayer(reportMarker);
        reportMarker = null;
      }
      document.getElementById('rLat').value = '';
      document.getElementById('rLng').value = '';
      document.getElementById('rAddress').value = '';
      loadReportsList();
      // Reload map markers
      reportMap.eachLayer(l => { if (l instanceof L.Marker) reportMap.removeLayer(l); });
      loadMapMarkers(reportMap);
    } else {
      showMessage(msgEl, data.error || 'Eroare la trimitere', 'error');
    }
  } catch (err) {
    showMessage(msgEl, 'Eroare de conexiune', 'error');
  }
}

// ── Contact Form ────────────────────────────────────────────────
async function submitContact() {
  const name = document.getElementById('cName').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const subject = document.getElementById('cSubject').value.trim();
  const message = document.getElementById('cMessage').value.trim();
  const msgEl = document.getElementById('contactMessage');

  if (!name || !email || !message) {
    showMessage(msgEl, 'Completați câmpurile obligatorii', 'error');
    return;
  }

  try {
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, subject, message })
    });
    if (res.ok) {
      showMessage(msgEl, 'Mesajul a fost trimis! Vă vom contacta în curând.', 'success');
      showToast('Mesaj trimis cu succes!', 'success');
      document.getElementById('cName').value = '';
      document.getElementById('cEmail').value = '';
      document.getElementById('cSubject').value = '';
      document.getElementById('cMessage').value = '';
    } else {
      showMessage(msgEl, 'Eroare la trimitere', 'error');
    }
  } catch (err) {
    showMessage(msgEl, 'Eroare de conexiune', 'error');
  }
}

// ── Admin Dashboard ─────────────────────────────────────────────
async function loadAdminData() {
  await Promise.all([
    loadAdminStats(),
    loadAdminReports(),
    loadAdminNews(),
    loadAdminMessages()
  ]);
}

async function loadAdminStats() {
  try {
    const stats = await fetch('/api/reports/stats').then(r => r.json());
    document.getElementById('aStatTotal').textContent = stats.total;
    document.getElementById('aStatUrgent').textContent = stats.urgent;

    const getCount = (s) => (stats.byStatus.find(x => x.status === s) || { count: 0 }).count;
    document.getElementById('aStatNew').textContent = getCount('nou');
    document.getElementById('aStatProgress').textContent = getCount('in_lucru');
    document.getElementById('aStatResolved').textContent = getCount('rezolvat');
  } catch (err) {
    console.error('Error loading admin stats:', err);
  }
}

async function loadAdminReports() {
  const status = document.getElementById('adminFilterStatus').value;
  const category = document.getElementById('adminFilterCategory').value;
  let url = '/api/reports?';
  if (status) url += `status=${status}&`;
  if (category) url += `category=${category}&`;

  try {
    const reports = await fetch(url).then(r => r.json());
    const tbody = document.getElementById('adminReportsBody');
    tbody.innerHTML = reports.map(r => `
      <tr>
        <td><strong>#${r.id}</strong></td>
        <td>
          <div style="font-weight:600">${escapeHtml(r.title)}</div>
          <div style="font-size:0.8rem;color:var(--text-light)">${escapeHtml(r.address || 'Fără adresă')}</div>
        </td>
        <td>${CATEGORY_LABELS[r.category] || r.category}</td>
        <td><span class="priority-badge pb-${r.priority}">${r.priority === 'urgent' ? '🔴 Urgent' : 'Normal'}</span></td>
        <td><span class="status-badge sb-${r.status}">${STATUS_LABELS[r.status]}</span></td>
        <td style="font-size:0.85rem">${formatDate(r.created_at)}</td>
        <td>
          <div class="admin-actions">
            <select onchange="updateReportStatus(${r.id}, this.value)" style="min-width:100px">
              <option value="">Schimbă...</option>
              <option value="nou" ${r.status === 'nou' ? 'selected' : ''}>Nou</option>
              <option value="in_lucru" ${r.status === 'in_lucru' ? 'selected' : ''}>În lucru</option>
              <option value="rezolvat" ${r.status === 'rezolvat' ? 'selected' : ''}>Rezolvat</option>
            </select>
            <button class="btn btn-danger btn-sm" onclick="deleteReport(${r.id})">
              <i data-lucide="trash-2" style="width:14px;height:14px"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
    lucide.createIcons();
  } catch (err) {
    console.error('Error loading admin reports:', err);
  }
}

async function loadAdminNews() {
  try {
    const news = await fetch('/api/news').then(r => r.json());
    document.getElementById('adminNewsList').innerHTML = news.map(n => `
      <div class="admin-item-card">
        <div>
          <h4>${escapeHtml(n.title)}</h4>
          <p>${escapeHtml(n.summary || n.content.substring(0, 120) + '...')}</p>
          <div class="meta">${n.category} · ${formatDate(n.created_at)}</div>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteNews(${n.id})">
          <i data-lucide="trash-2" style="width:14px;height:14px"></i>
        </button>
      </div>
    `).join('');
    lucide.createIcons();
  } catch (err) {
    console.error('Error loading admin news:', err);
  }
}

async function loadAdminMessages() {
  try {
    const messages = await fetch('/api/contact').then(r => r.json());
    document.getElementById('adminMessagesList').innerHTML = messages.length === 0
      ? '<p style="text-align:center;color:var(--text-muted);padding:2rem">Niciun mesaj încă</p>'
      : messages.map(m => `
        <div class="admin-item-card">
          <div>
            <h4>${escapeHtml(m.subject || 'Fără subiect')}</h4>
            <p>${escapeHtml(m.message)}</p>
            <div class="meta">De la: ${escapeHtml(m.name)} (${escapeHtml(m.email)}) · ${formatDate(m.created_at)}</div>
          </div>
        </div>
      `).join('');
  } catch (err) {
    console.error('Error loading messages:', err);
  }
}

// Admin Actions (global scope)
window.updateReportStatus = async function(id, status) {
  if (!status) return;
  try {
    await fetch(`/api/reports/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    showToast('Status actualizat', 'success');
    loadAdminData();
  } catch (err) {
    showToast('Eroare la actualizare', 'error');
  }
};

window.deleteReport = async function(id) {
  if (!confirm('Sigur doriți să ștergeți acest raport?')) return;
  try {
    await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    showToast('Raport șters', 'info');
    loadAdminData();
  } catch (err) {
    showToast('Eroare la ștergere', 'error');
  }
};

window.deleteNews = async function(id) {
  if (!confirm('Sigur doriți să ștergeți această știre?')) return;
  try {
    await fetch(`/api/news/${id}`, { method: 'DELETE' });
    showToast('Știre ștearsă', 'info');
    loadAdminNews();
  } catch (err) {
    showToast('Eroare la ștergere', 'error');
  }
};

async function submitAddNews() {
  const title = document.getElementById('nTitle').value.trim();
  const summary = document.getElementById('nSummary').value.trim();
  const content = document.getElementById('nContent').value.trim();
  const category = document.getElementById('nCategory').value;
  const image_url = document.getElementById('nImage').value.trim();

  if (!title || !content) {
    showToast('Completați titlul și conținutul', 'error');
    return;
  }

  try {
    const res = await fetch('/api/news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, summary, content, category, image_url })
    });
    if (res.ok) {
      showToast('Știre publicată cu succes!', 'success');
      document.getElementById('nTitle').value = '';
      document.getElementById('nSummary').value = '';
      document.getElementById('nContent').value = '';
      document.getElementById('nImage').value = '';
      loadAdminNews();
    }
  } catch (err) {
    showToast('Eroare la publicare', 'error');
  }
}

// ── Utilities ───────────────────────────────────────────────────
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('ro-RO', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
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
