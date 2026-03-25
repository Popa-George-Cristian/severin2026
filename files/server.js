const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Directories ─────────────────────────────────────────────────
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const imgDir = path.join(publicDir, 'img');
[dataDir, imgDir, path.join(publicDir, 'css'), path.join(publicDir, 'js')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ── Database ────────────────────────────────────────────────────
const db = new Database(path.join(dataDir, 'primaria.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT DEFAULT 'building',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT DEFAULT 'cetatean',
    department_id INTEGER,
    full_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT DEFAULT 'sesizare',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    address TEXT,
    photo_path TEXT,
    status TEXT DEFAULT 'nou',
    priority TEXT DEFAULT 'normal',
    cerere_nr TEXT,
    cerere_date DATETIME,
    rezolutie TEXT,
    department_id INTEGER,
    department_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (department_id) REFERENCES departments(id)
  );

  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Auth Helpers ────────────────────────────────────────────────
const hashPw = (pw, salt) => crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');

function createUser(username, email, password, role = 'cetatean', deptId = null, fullName = null) {
  const salt = crypto.randomBytes(16).toString('hex');
  return db.prepare('INSERT INTO users (username,email,password_hash,salt,role,department_id,full_name) VALUES (?,?,?,?,?,?,?)')
    .run(username, email, hashPw(password, salt), salt, role, deptId, fullName);
}

function loginUser(username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(username, username);
  if (!u || hashPw(password, u.salt) !== u.password_hash) return null;
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, u.id, new Date(Date.now() + 7 * 86400000).toISOString());
  return { token, user: { id: u.id, username: u.username, email: u.email, role: u.role, department_id: u.department_id, full_name: u.full_name } };
}

function authMw(req, res, next) {
  const t = req.headers['x-auth-token'];
  if (!t) { req.user = null; return next(); }
  const s = db.prepare("SELECT u.id,u.username,u.email,u.role,u.department_id,u.full_name FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires_at>datetime('now')").get(t);
  req.user = s || null;
  next();
}
const needAuth = (rq, rs, nx) => rq.user ? nx() : rs.status(401).json({ error: 'Autentificare necesară' });
const needRole = (...roles) => (rq, rs, nx) => rq.user && roles.includes(rq.user.role) ? nx() : rs.status(403).json({ error: 'Acces interzis' });

// ── Generate Cerere Number ──────────────────────────────────────
function generateCerereNr() {
  const year = new Date().getFullYear();
  const count = db.prepare("SELECT COUNT(*) as c FROM reports WHERE cerere_nr IS NOT NULL AND cerere_nr LIKE ?").get(`%/${year}`).c;
  return `${String(count + 1).padStart(4, '0')}/${year}`;
}

// ── Seed Data ───────────────────────────────────────────────────
if (!db.prepare('SELECT COUNT(*) as c FROM departments').get().c) {
  const d = db.prepare('INSERT INTO departments (name, description, icon) VALUES (?,?,?)');
  d.run('Direcția Drumuri și Poduri', 'Întreținerea și reparația drumurilor, trotuarelor și podurilor', 'road');
  d.run('Direcția Iluminat Public', 'Gestionarea și întreținerea iluminatului stradal', 'lightbulb');
  d.run('Direcția Salubritate', 'Colectarea deșeurilor și curățenia stradală', 'trash-2');
  d.run('Direcția Spații Verzi', 'Întreținerea parcurilor, grădinilor și spațiilor verzi', 'trees');
  d.run('Direcția Apă și Canalizare', 'Rețeaua de apă și canalizare a municipiului', 'droplets');
  d.run('Direcția Urbanism', 'Autorizații construcții, urbanism și amenajarea teritoriului', 'building');
  d.run('Direcția Mobilier Urban', 'Bănci, coșuri de gunoi, stații de autobuz', 'armchair');
}

if (!db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get().c) {
  createUser('admin', 'admin@primaria-galati.ro', 'admin123', 'admin', null, 'Administrator Sistem');
  createUser('primar', 'primar@primaria-galati.ro', 'primar123', 'primar', null, 'Primarul Municipiului Galați');
  // Department heads
  const depts = db.prepare('SELECT id, name FROM departments').all();
  const deptUsers = [
    { u: 'drumuri', e: 'drumuri@primaria-galati.ro', n: 'Șef Direcția Drumuri' },
    { u: 'iluminat', e: 'iluminat@primaria-galati.ro', n: 'Șef Direcția Iluminat' },
    { u: 'salubritate', e: 'salubritate@primaria-galati.ro', n: 'Șef Direcția Salubritate' },
    { u: 'spatii.verzi', e: 'spatii@primaria-galati.ro', n: 'Șef Direcția Spații Verzi' },
    { u: 'apa.canal', e: 'apa@primaria-galati.ro', n: 'Șef Direcția Apă' },
    { u: 'urbanism', e: 'urbanism@primaria-galati.ro', n: 'Șef Direcția Urbanism' },
    { u: 'mobilier', e: 'mobilier@primaria-galati.ro', n: 'Șef Direcția Mobilier' },
  ];
  deptUsers.forEach((du, i) => {
    if (depts[i]) createUser(du.u, du.e, 'dept123', 'departament', depts[i].id, du.n);
  });
  createUser('maria.popescu', 'maria@email.ro', 'maria123', 'cetatean', null, 'Maria Popescu');
}

if (!db.prepare('SELECT COUNT(*) as c FROM news').get().c) {
  const n = db.prepare('INSERT INTO news (title,summary,content,category,image_url) VALUES (?,?,?,?,?)');
  n.run('Reabilitarea Falezei Dunării — Etapa II', 'Lucrările de reabilitare au demarat pe segmentul central al falezei.', 'Primăria Municipiului Galați a demarat etapa a doua de reabilitare a Falezei Dunării.\n\nProiectul include modernizarea aleilor, 80 de corpuri LED, 3 zone de relaxare și 200 de arbori noi.\n\nInvestiție: 4.8 milioane lei. Termen: octombrie 2026.', 'proiecte', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800');
  n.run('Programul „Galați Verde"', 'Colectare selectivă extinsă în toate cartierele municipiului.', 'Primăria extinde programul „Galați Verde" în Micro 13-21, Țiglina I-III, Mazepa, Siderurgiștilor și Centru.\n\nFiecare gospodărie primește 3 pubele gratuite. 50 de puncte noi pentru deșeuri electronice.', 'mediu', 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800');
  n.run('Ședința Consiliului Local — Buget 2026', 'Dezbaterea bugetului municipal, joi 3 aprilie.', 'Consiliul Local Galați — ședință ordinară joi, 3 aprilie 2026, ora 10:00, Str. Domnească nr. 38.\n\nOrdine de zi: bugetul 2026, modernizare transport public, digitalizare servicii, parcări rezidențiale.\n\nȘedința este publică.', 'administrativ', 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800');
  n.run('Festival „Dunărea Albastră" — 15-17 Mai', 'Muzică, artă și gastronomie pe malul Dunării.', 'Prima ediție a festivalului pe Faleza Dunării.\n\nVineri: concerte folk. Sâmbătă: târg produse locale, ateliere artă. Duminică: regată, artificii.\n\nIntrare liberă. Transport gratuit din toate cartierele.', 'cultura', 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800');
}

if (!db.prepare('SELECT COUNT(*) as c FROM reports').get().c) {
  const uid = db.prepare("SELECT id FROM users WHERE username='maria.popescu'").get()?.id || 1;
  const now = new Date().toISOString();
  const r = db.prepare('INSERT INTO reports (user_id,type,title,description,category,latitude,longitude,address,status,priority,cerere_nr,cerere_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  r.run(uid, 'sesizare', 'Groapă adâncă pe Str. Brăilei', 'Groapă de ~40cm pe carosabil, zona stației Micro 17. Pericol pentru mașini și bicicliști.', 'drum', 45.4386, 28.0503, 'Str. Brăilei, Micro 17', 'in_lucru', 'urgent', '0001/2026', now);
  r.run(uid, 'sesizare', 'Iluminat defect pe Faleza Dunării', 'Trei stâlpi consecutivi nu funcționează pe zona centrală. Periculos seara.', 'iluminat', 45.4352, 28.0418, 'Faleza Dunării, zona centrală', 'nou', 'normal', '0002/2026', now);
  r.run(uid, 'sesizare', 'Deșeuri ilegale — Lacul Brateș', 'Deșeuri de construcții pe malul sudic al lacului. Afectează ecosistemul.', 'salubritate', 45.4150, 28.0200, 'Malul sudic Lacul Brateș', 'nou', 'urgent', '0003/2026', now);
  r.run(uid, 'sesizare', 'Băncile rupte din Grădina Publică', 'Două bănci rupte pe aleea centrală, cuie ieșite — pericol copii.', 'mobilier_urban', 45.4370, 28.0470, 'Grădina Publică', 'rezolvat', 'normal', '0004/2026', now);
  r.run(uid, 'serviciu', 'Canalizare înfundată Str. Traian', 'Canalizarea de 3 zile e înfundată. Apa se revarsă pe stradă.', 'canalizare', 45.4330, 28.0440, 'Str. Traian nr. 22', 'in_lucru', 'urgent', '0005/2026', now);
  r.run(uid, 'serviciu', 'Copac periculos Str. Eroilor', 'Crengă ruptă parțial atârnă peste trotuar, risc de cădere.', 'spatii_verzi', 45.4360, 28.0500, 'Str. Eroilor nr. 15', 'nou', 'normal', '0006/2026', now);
  // Assign some to departments
  db.prepare("UPDATE reports SET department_id=1, status='in_lucru' WHERE category='drum'").run();
  db.prepare("UPDATE reports SET department_id=5, status='in_lucru' WHERE category='canalizare'").run();
  db.prepare("UPDATE reports SET department_id=7, status='rezolvat' WHERE category='mobilier_urban'").run();
}

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use(authMw);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imgDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════════
// AUTH API
// ══════════════════════════════════════════════════════════════════
app.post('/api/auth/register', (req, res) => {
  const { username, email, password, full_name } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Câmpuri obligatorii' });
  if (password.length < 4) return res.status(400).json({ error: 'Parola: minim 4 caractere' });
  if (db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(username, email))
    return res.status(409).json({ error: 'Utilizator existent' });
  try {
    createUser(username, email, password, 'cetatean', null, full_name || username);
    const session = loginUser(username, password);
    res.status(201).json(session);
  } catch (e) { res.status(500).json({ error: 'Eroare' }); }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const session = loginUser(username, password);
  session ? res.json(session) : res.status(401).json({ error: 'Credențiale incorecte' });
});

app.post('/api/auth/logout', (req, res) => {
  const t = req.headers['x-auth-token'];
  if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Neautentificat' });
  // Include department info
  let dept = null;
  if (req.user.department_id) dept = db.prepare('SELECT * FROM departments WHERE id=?').get(req.user.department_id);
  res.json({ user: { ...req.user, department: dept } });
});

// ══════════════════════════════════════════════════════════════════
// DEPARTMENTS API
// ══════════════════════════════════════════════════════════════════
app.get('/api/departments', (req, res) => {
  res.json(db.prepare('SELECT * FROM departments ORDER BY name').all());
});

app.post('/api/departments', needAuth, needRole('admin'), (req, res) => {
  const { name, description, icon } = req.body;
  if (!name) return res.status(400).json({ error: 'Nume obligatoriu' });
  const r = db.prepare('INSERT INTO departments (name,description,icon) VALUES (?,?,?)').run(name, description || '', icon || 'building');
  res.status(201).json({ id: r.lastInsertRowid });
});

app.delete('/api/departments/:id', needAuth, needRole('admin'), (req, res) => {
  db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// REPORTS API
// ══════════════════════════════════════════════════════════════════
app.get('/api/reports', (req, res) => {
  const { status, category, type, department_id } = req.query;
  let sql = 'SELECT r.*, u.username as author, u.full_name as author_name, d.name as dept_name FROM reports r LEFT JOIN users u ON r.user_id=u.id LEFT JOIN departments d ON r.department_id=d.id';
  const w = [], p = [];
  if (status) { w.push('r.status=?'); p.push(status); }
  if (category) { w.push('r.category=?'); p.push(category); }
  if (type) { w.push('r.type=?'); p.push(type); }
  if (department_id) { w.push('r.department_id=?'); p.push(department_id); }

  // Department users only see their department's reports
  if (req.user?.role === 'departament' && req.user.department_id) {
    w.push('r.department_id=?');
    p.push(req.user.department_id);
  }

  if (w.length) sql += ' WHERE ' + w.join(' AND ');
  sql += ' ORDER BY r.created_at DESC';
  res.json(db.prepare(sql).all(...p));
});

app.get('/api/reports/stats', (req, res) => {
  let where = '';
  const params = [];
  if (req.user?.role === 'departament' && req.user.department_id) {
    where = ' WHERE department_id=?';
    params.push(req.user.department_id);
  }
  res.json({
    total: db.prepare('SELECT COUNT(*) as c FROM reports' + where).get(...params).c,
    byStatus: db.prepare('SELECT status, COUNT(*) as count FROM reports' + where + ' GROUP BY status').all(...params),
    byCategory: db.prepare('SELECT category, COUNT(*) as count FROM reports' + where + ' GROUP BY category').all(...params),
    urgent: db.prepare("SELECT COUNT(*) as c FROM reports" + (where ? where + " AND" : " WHERE") + " priority='urgent' AND status!='rezolvat'").get(...params).c,
    unassigned: db.prepare("SELECT COUNT(*) as c FROM reports WHERE department_id IS NULL AND status!='rezolvat'").get().c
  });
});

app.get('/api/reports/:id', (req, res) => {
  const r = db.prepare('SELECT r.*, u.username as author, u.full_name as author_name, u.email as author_email, d.name as dept_name FROM reports r LEFT JOIN users u ON r.user_id=u.id LEFT JOIN departments d ON r.department_id=d.id WHERE r.id=?').get(req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'Negăsit' });
});

// Create report (citizen)
app.post('/api/reports', needAuth, upload.single('photo'), (req, res) => {
  const { type, title, description, category, latitude, longitude, address, priority } = req.body;
  if (!title || !description || !category) return res.status(400).json({ error: 'Câmpuri obligatorii' });
  const photo = req.file ? '/img/' + req.file.filename : null;
  const cerereNr = generateCerereNr();
  const cerereDate = new Date().toISOString();
  const r = db.prepare('INSERT INTO reports (user_id,type,title,description,category,latitude,longitude,address,photo_path,priority,cerere_nr,cerere_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, type || 'sesizare', title, description, category, latitude || null, longitude || null, address || null, photo, priority || 'normal', cerereNr, cerereDate);
  res.status(201).json({ id: r.lastInsertRowid, cerere_nr: cerereNr });
});

// Primar assigns to department + adds rezolutie
app.patch('/api/reports/:id/assign', needAuth, needRole('primar', 'admin'), (req, res) => {
  const { department_id, rezolutie, priority } = req.body;
  const ups = ['updated_at=CURRENT_TIMESTAMP'];
  const params = [];
  if (department_id !== undefined) { ups.push('department_id=?'); params.push(department_id); ups.push("status='redirecționat'"); }
  if (rezolutie) { ups.push('rezolutie=?'); params.push(rezolutie); }
  if (priority) { ups.push('priority=?'); params.push(priority); }
  params.push(req.params.id);
  db.prepare(`UPDATE reports SET ${ups.join(',')} WHERE id=?`).run(...params);
  res.json({ ok: true });
});

// Department updates status and notes
app.patch('/api/reports/:id/dept', needAuth, needRole('departament', 'primar', 'admin'), (req, res) => {
  const { status, department_notes } = req.body;
  const ups = ['updated_at=CURRENT_TIMESTAMP'];
  const params = [];
  if (status) { ups.push('status=?'); params.push(status); }
  if (department_notes !== undefined) { ups.push('department_notes=?'); params.push(department_notes); }
  params.push(req.params.id);
  db.prepare(`UPDATE reports SET ${ups.join(',')} WHERE id=?`).run(...params);
  res.json({ ok: true });
});

app.delete('/api/reports/:id', needAuth, needRole('admin', 'primar'), (req, res) => {
  db.prepare('DELETE FROM reports WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// USERS MANAGEMENT (admin)
// ══════════════════════════════════════════════════════════════════
app.get('/api/users', needAuth, needRole('admin'), (req, res) => {
  res.json(db.prepare('SELECT u.id,u.username,u.email,u.role,u.department_id,u.full_name,u.created_at,d.name as dept_name FROM users u LEFT JOIN departments d ON u.department_id=d.id ORDER BY u.role,u.username').all());
});

app.post('/api/users', needAuth, needRole('admin'), (req, res) => {
  const { username, email, password, role, department_id, full_name } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Câmpuri obligatorii' });
  try {
    createUser(username, email, password, role || 'cetatean', department_id || null, full_name || username);
    res.status(201).json({ ok: true });
  } catch (e) { res.status(409).json({ error: 'Utilizator existent' }); }
});

app.delete('/api/users/:id', needAuth, needRole('admin'), (req, res) => {
  db.prepare('DELETE FROM users WHERE id=? AND role!="admin"').run(req.params.id);
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════
// NEWS & CONTACT API
// ══════════════════════════════════════════════════════════════════
app.get('/api/news', (req, res) => res.json(db.prepare('SELECT * FROM news ORDER BY created_at DESC').all()));
app.get('/api/news/:id', (req, res) => { const a = db.prepare('SELECT * FROM news WHERE id=?').get(req.params.id); a ? res.json(a) : res.status(404).json({ error: 'Negăsit' }); });
app.post('/api/news', needAuth, needRole('admin', 'primar'), (req, res) => {
  const { title, summary, content, category, image_url } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Titlu + conținut obligatorii' });
  const r = db.prepare('INSERT INTO news (title,summary,content,category,image_url) VALUES (?,?,?,?,?)').run(title, summary || null, content, category || 'general', image_url || null);
  res.status(201).json({ id: r.lastInsertRowid });
});
app.delete('/api/news/:id', needAuth, needRole('admin', 'primar'), (req, res) => { db.prepare('DELETE FROM news WHERE id=?').run(req.params.id); res.json({ ok: true }); });

app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Câmpuri obligatorii' });
  db.prepare('INSERT INTO contacts (name,email,subject,message) VALUES (?,?,?,?)').run(name, email, subject || null, message);
  res.json({ ok: true });
});
app.get('/api/contact', needAuth, needRole('admin', 'primar'), (req, res) => res.json(db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all()));

// ══════════════════════════════════════════════════════════════════
// AI ASSISTANT (llama.cpp)
// ══════════════════════════════════════════════════════════════════
const LLAMA_URL = process.env.LLAMA_URL || 'http://localhost:8080';

const AI_SYSTEM = `Ești asistentul digital al Primăriei Municipiului Galați. Răspunzi scurt și clar în limba română.
Ajuți cetățenii cu: raportarea problemelor urbane, informații despre Galați, navigarea pe site, contactarea primăriei.
Primăria: Str. Domnească 38, tel 0236 307 700, Luni-Vineri 08-16.
Categorii raportare: drum, iluminat, salubritate, spații verzi, mobilier urban, canalizare, construcții.
Galați: ~250.000 loc, pe malul Dunării, județul Galați, România.
Răspunde concis, max 2-3 propoziții.`;

app.post('/api/ai/chat', async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ error: 'Mesaj necesar' });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const llamaRes = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'system', content: AI_SYSTEM }, ...history.slice(-8), { role: 'user', content: message }],
        max_tokens: 256, temperature: 0.7, stream: false
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (llamaRes.ok) {
      const data = await llamaRes.json();
      return res.json({ reply: data.choices?.[0]?.message?.content || 'Fără răspuns.', source: 'llama' });
    }
    throw new Error('llama.cpp unavailable');
  } catch (e) {
    res.json({ reply: smartFallback(message.toLowerCase()), source: 'fallback' });
  }
});

function smartFallback(m) {
  if (m.match(/salut|bun[aă]|hey|hello/)) return 'Bună ziua! Sunt asistentul Primăriei Galați. Cu ce vă pot ajuta?';
  if (m.match(/raport|problem|sesiz|reclam/)) return 'Pentru a raporta o problemă, autentificați-vă și accesați pagina „Raportează". Marcați locația pe hartă și completați detaliile.';
  if (m.match(/login|cont|autentif|loghe/)) return 'Apăsați „Autentificare" din meniu. Puteți crea un cont nou sau vă conectați cu unul existent.';
  if (m.match(/adres|unde|sediu/)) return 'Primăria Galați: Str. Domnească nr. 38, cod 800008. Program: L-V 08:00-16:00.';
  if (m.match(/telefon|sun|apel/)) return 'Telefon primărie: 0236 307 700. Sau folosiți formularul de Contact.';
  if (m.match(/groa|drum|strad|asfalt/)) return 'Problemele de drum se raportează cu categoria „Drum / Carosabil". Includeți adresa exactă.';
  if (m.match(/lumin|bec|stâlp/)) return 'Iluminatul defect se raportează cu categoria „Iluminat Public".';
  if (m.match(/gunoi|salubr|deșeu/)) return 'Depozitările ilegale → categoria „Salubritate". Atașați o fotografie dacă puteți.';
  if (m.match(/canal|ap[aă]|inund/)) return 'Probleme canalizare/apă → categoria „Canalizare / Apă". Menționați dacă e urgentă.';
  if (m.match(/copac|parc|verde/)) return 'Copaci periculoși sau spații verzi → categoria „Spații Verzi".';
  if (m.match(/stir|nout|evenim/)) return 'Știrile sunt pe pagina „Știri" din meniu.';
  if (m.match(/accesibil|orb|dizabil/)) return 'Modul accesibil se activează apăsând Space la intrare. Navigarea e cu Tab + Enter, cu ghidare vocală.';
  if (m.match(/gala[tț]/)) return 'Galați — ~250.000 locuitori, pe malul Dunării, cel mai mare oraș din Moldova de Jos.';
  if (m.match(/ajut|help|cum/)) return 'Vă pot ajuta cu: raportare probleme, informații oraș, navigare site, contact primărie.';
  if (m.match(/mulțum|mersi/)) return 'Cu plăcere! Sunt aici oricând aveți nevoie.';
  if (m.match(/cerere|numar|inregistr/)) return 'Fiecare sesizare primește automat un număr de cerere (ex: 0001/2026). Îl primiți după trimitere.';
  if (m.match(/departament|direct|serviciu/)) return 'Sesizările sunt redirecționate de primar către departamentele responsabile: Drumuri, Iluminat, Salubritate, Spații Verzi, Apă/Canal, Urbanism, Mobilier Urban.';
  return 'Sunt asistentul Primăriei Galați. Pot ajuta cu raportări, informații sau navigare pe site. Ce doriți?';
}

// SPA fallback
app.get('*', (req, res) => {
  const p = path.join(publicDir, 'index.html');
  fs.existsSync(p) ? res.sendFile(p) : res.status(500).send('<h1>public/index.html lipsește</h1>');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🏛️  Primăria Digitală Galați v3`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  📍 http://localhost:${PORT}`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  👤 Admin:       admin / admin123`);
  console.log(`  👤 Primar:      primar / primar123`);
  console.log(`  👤 Departament: drumuri / dept123 (etc.)`);
  console.log(`  👤 Cetățean:    maria.popescu / maria123`);
  console.log(`  ─────────────────────────────────`);
  console.log(`  🤖 AI: llama.cpp @ ${LLAMA_URL}`);
  console.log(`     Fallback inteligent activ dacă llama.cpp nu rulează\n`);
});
