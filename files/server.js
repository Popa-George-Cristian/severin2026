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
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    role TEXT DEFAULT 'cetatean',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    type TEXT NOT NULL DEFAULT 'problema',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    address TEXT,
    photo_path TEXT,
    status TEXT DEFAULT 'nou',
    priority TEXT DEFAULT 'normal',
    admin_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
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
const hash = (pw, salt) => crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');

function register(username, email, password, role = 'cetatean') {
  const salt = crypto.randomBytes(16).toString('hex');
  return db.prepare('INSERT INTO users (username, email, password_hash, salt, role) VALUES (?,?,?,?,?)')
    .run(username, email, hash(password, salt), salt, role);
}

function login(username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(username, username);
  if (!u || hash(password, u.salt) !== u.password_hash) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const exp = new Date(Date.now() + 7 * 86400000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, u.id, exp);
  return { token, user: { id: u.id, username: u.username, email: u.email, role: u.role } };
}

function auth(req, res, next) {
  const t = req.headers['x-auth-token'];
  if (!t) { req.user = null; return next(); }
  const s = db.prepare("SELECT s.*, u.id as uid, u.username, u.email, u.role FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires_at>datetime('now')").get(t);
  req.user = s ? { id: s.uid, username: s.username, email: s.email, role: s.role } : null;
  next();
}
const needAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Autentificare necesară' });
const needAdmin = (req, res, next) => (req.user && req.user.role === 'admin') ? next() : res.status(403).json({ error: 'Acces interzis' });

// ── Seed Data ───────────────────────────────────────────────────
if (!db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get().c) {
  register('admin', 'admin@primaria-galati.ro', 'admin123', 'admin');
  register('maria.popescu', 'maria@email.ro', 'maria123', 'cetatean');
}

if (!db.prepare('SELECT COUNT(*) as c FROM news').get().c) {
  const n = db.prepare('INSERT INTO news (title, summary, content, category, image_url) VALUES (?,?,?,?,?)');
  n.run('Reabilitarea Falezei Dunării — Etapa a II-a', 'Primăria Galați a demarat lucrările de reabilitare pe segmentul central al falezei.', 'Primăria Municipiului Galați anunță demararea etapei a doua de reabilitare a Falezei Dunării, pe segmentul cuprins între Restaurantul Viva și zona I.C. Frimu.\n\nProiectul include:\n• Modernizarea aleilor pietonale și a pistei de biciclete\n• Instalarea a 80 de corpuri de iluminat LED\n• Amenajarea a 3 zone de relaxare cu mobilier urban nou\n• Plantarea a 200 de arbori și arbuști ornamentali\n\nInvestiția totală se ridică la 4.8 milioane lei, cu termen de finalizare în octombrie 2026.', 'proiecte', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800');
  n.run('Programul „Galați Verde" — Colectare Selectivă în Toate Cartierele', 'Din aprilie, fiecare gospodărie primește pubele gratuite pentru reciclare.', 'Primăria Galați extinde programul „Galați Verde" de colectare selectivă în toate cartierele municipiului: Micro 13, 14, 16, 17, 19, 20, 21, Țiglina I-III, Mazepa I-II, Siderurgiștilor și Centru.\n\nFiecare gospodărie va primi gratuit 3 pubele color-codate:\n• Verde — sticlă\n• Galben — plastic și metal\n• Albastru — hârtie și carton\n\nProgramul include și 50 de puncte noi de colectare a deșeurilor electronice.', 'mediu', 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800');
  n.run('Ședința Consiliului Local — Bugetul 2026', 'Consilierii locali vor dezbate bugetul municipiului pentru anul 2026.', 'Consiliul Local al Municipiului Galați se va întruni în ședință ordinară joi, 3 aprilie 2026, de la ora 10:00, în sala mare a Primăriei (Str. Domnească nr. 38).\n\nPe ordinea de zi:\n• Aprobarea bugetului local pe anul 2026\n• Proiectul de modernizare a transportului public\n• Strategia de digitalizare a serviciilor publice\n• Regulamentul privind parcările rezidențiale\n\nȘedința este publică. Cetățenii pot participa și adresa întrebări în secțiunea dedicată.', 'administrativ', 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800');
  n.run('Festival „Dunărea Albastră" — 15-17 Mai', 'Trei zile de muzică, artă și gastronomie pe malul Dunării.', 'Primăria Galați organizează prima ediție a festivalului „Dunărea Albastră" pe Faleza Dunării.\n\nProgram:\n• Vineri 15 mai: Deschidere oficială, concerte folk\n• Sâmbătă 16 mai: Târg de produse locale, ateliere de artă\n• Duminică 17 mai: Regată pe Dunăre, spectacol de artificii\n\nIntrarea este liberă. Se asigură transport gratuit din toate cartierele.', 'cultura', 'https://images.unsplash.com/photo-1533174072545-7a4b6ad7a6c3?w=800');
}

if (!db.prepare('SELECT COUNT(*) as c FROM reports').get().c) {
  const r = db.prepare('INSERT INTO reports (user_id, type, title, description, category, latitude, longitude, address, status, priority) VALUES (?,?,?,?,?,?,?,?,?,?)');
  r.run(2, 'problema', 'Groapă adâncă pe Str. Brăilei', 'Groapă de aproximativ 40cm adâncime pe Str. Brăilei, în zona stației de autobuz Micro 17. Pericol major pentru mașini și bicicliști, mai ales noaptea când nu se vede.', 'drum', 45.4386, 28.0503, 'Str. Brăilei, zona Micro 17, Galați', 'in_lucru', 'urgent');
  r.run(2, 'problema', 'Iluminat stradal defect pe Faleză', 'Trei stâlpi consecutivi de iluminat nu funcționează pe Faleza Dunării, segmentul central. Zona devine foarte întunecată seara, nesigură pentru pietoni.', 'iluminat', 45.4352, 28.0418, 'Faleza Dunării, zona centrală, Galați', 'nou', 'normal');
  r.run(2, 'problema', 'Depozitare ilegală de deșeuri — Lacul Brateș', 'Cantitate mare de deșeuri de construcții și gunoaie menajere depozitate ilegal pe malul sudic al Lacului Brateș. Afectează ecosistemul și aspectul zonei.', 'salubritate', 45.4150, 28.0200, 'Malul sudic Lacul Brateș, Galați', 'nou', 'urgent');
  r.run(2, 'problema', 'Bancă distrusă în Grădina Publică', 'Două bănci din aleea centrală a Grădinii Publice sunt rupte, cu cuie și fier ieșite în afară. Pericol pentru copii și trecători.', 'mobilier_urban', 45.4370, 28.0470, 'Grădina Publică, aleea centrală, Galați', 'rezolvat', 'normal');
  r.run(2, 'serviciu', 'Solicitare reparație canalizare Str. Traian', 'Canalizarea de pe Str. Traian nr. 22 este înfundată de 3 zile. Apa reziduală se revarsă pe stradă și miroase puternic. Solicităm intervenție urgentă.', 'canalizare', 45.4330, 28.0440, 'Str. Traian nr. 22, Galați', 'in_lucru', 'urgent');
  r.run(2, 'serviciu', 'Solicitare tăiere copac periculos', 'Un copac mare de pe Str. Eroilor prezintă o crengă ruptă parțial care atârnă peste trotuar. Risc de cădere, mai ales pe vânt.', 'spatii_verzi', 45.4360, 28.0500, 'Str. Eroilor nr. 15, Galați', 'nou', 'normal');
}

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use(auth);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imgDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ══════════════════════════════════════════════════════════════════
// ── API ROUTES ──────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

// Auth
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii' });
  if (password.length < 4) return res.status(400).json({ error: 'Parola: minim 4 caractere' });
  if (db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(username, email))
    return res.status(409).json({ error: 'Utilizator sau email deja existent' });
  try {
    const result = register(username, email, password);
    const session = login(username, password);
    res.status(201).json(session);
  } catch (e) { res.status(500).json({ error: 'Eroare la înregistrare' }); }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const session = login(username, password);
  if (!session) return res.status(401).json({ error: 'Utilizator sau parolă incorectă' });
  res.json(session);
});

app.post('/api/auth/logout', (req, res) => {
  const t = req.headers['x-auth-token'];
  if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  req.user ? res.json({ user: req.user }) : res.status(401).json({ error: 'Neautentificat' });
});

// Reports
app.get('/api/reports', (req, res) => {
  const { status, category, type } = req.query;
  let sql = 'SELECT r.*, u.username as author FROM reports r LEFT JOIN users u ON r.user_id=u.id';
  const w = [], p = [];
  if (status) { w.push('r.status=?'); p.push(status); }
  if (category) { w.push('r.category=?'); p.push(category); }
  if (type) { w.push('r.type=?'); p.push(type); }
  if (w.length) sql += ' WHERE ' + w.join(' AND ');
  sql += ' ORDER BY r.created_at DESC';
  res.json(db.prepare(sql).all(...p));
});

app.get('/api/reports/stats', (req, res) => {
  res.json({
    total: db.prepare('SELECT COUNT(*) as c FROM reports').get().c,
    byStatus: db.prepare('SELECT status, COUNT(*) as count FROM reports GROUP BY status').all(),
    byCategory: db.prepare('SELECT category, COUNT(*) as count FROM reports GROUP BY category').all(),
    byType: db.prepare('SELECT type, COUNT(*) as count FROM reports GROUP BY type').all(),
    urgent: db.prepare("SELECT COUNT(*) as c FROM reports WHERE priority='urgent' AND status!='rezolvat'").get().c
  });
});

app.get('/api/reports/:id', (req, res) => {
  const r = db.prepare('SELECT r.*, u.username as author, u.email as author_email FROM reports r LEFT JOIN users u ON r.user_id=u.id WHERE r.id=?').get(req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'Negăsit' });
});

app.post('/api/reports', needAuth, upload.single('photo'), (req, res) => {
  const { type, title, description, category, latitude, longitude, address, priority } = req.body;
  if (!title || !description || !category) return res.status(400).json({ error: 'Câmpuri obligatorii lipsă' });
  const photo = req.file ? '/img/' + req.file.filename : null;
  const r = db.prepare('INSERT INTO reports (user_id,type,title,description,category,latitude,longitude,address,photo_path,priority) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(req.user.id, type || 'problema', title, description, category, latitude || null, longitude || null, address || null, photo, priority || 'normal');
  res.status(201).json({ id: r.lastInsertRowid });
});

app.patch('/api/reports/:id', needAdmin, (req, res) => {
  const { status, priority, admin_notes } = req.body;
  const u = [], p = [];
  if (status) { u.push('status=?'); p.push(status); }
  if (priority) { u.push('priority=?'); p.push(priority); }
  if (admin_notes !== undefined) { u.push('admin_notes=?'); p.push(admin_notes); }
  u.push('updated_at=CURRENT_TIMESTAMP');
  p.push(req.params.id);
  db.prepare(`UPDATE reports SET ${u.join(',')} WHERE id=?`).run(...p);
  res.json({ ok: true });
});

app.delete('/api/reports/:id', needAdmin, (req, res) => {
  db.prepare('DELETE FROM reports WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// News
app.get('/api/news', (req, res) => res.json(db.prepare('SELECT * FROM news ORDER BY created_at DESC').all()));
app.get('/api/news/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM news WHERE id=?').get(req.params.id);
  a ? res.json(a) : res.status(404).json({ error: 'Negăsit' });
});
app.post('/api/news', needAdmin, (req, res) => {
  const { title, summary, content, category, image_url } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Titlu și conținut obligatorii' });
  const r = db.prepare('INSERT INTO news (title,summary,content,category,image_url) VALUES (?,?,?,?,?)')
    .run(title, summary || null, content, category || 'general', image_url || null);
  res.status(201).json({ id: r.lastInsertRowid });
});
app.delete('/api/news/:id', needAdmin, (req, res) => {
  db.prepare('DELETE FROM news WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Contact
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Câmpuri obligatorii' });
  db.prepare('INSERT INTO contacts (name,email,subject,message) VALUES (?,?,?,?)').run(name, email, subject || null, message);
  res.json({ ok: true });
});
app.get('/api/contact', needAdmin, (req, res) => res.json(db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all()));

// SPA fallback
app.get('*', (req, res) => {
  const p = path.join(publicDir, 'index.html');
  fs.existsSync(p) ? res.sendFile(p) : res.status(500).send('<h1>public/index.html lipsește</h1><p>Verifică structura proiectului.</p>');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🏛️  Primăria Digitală Galați`);
  console.log(`  ─────────────────────────────`);
  console.log(`  📍 http://localhost:${PORT}`);
  console.log(`  👤 Admin:    admin / admin123`);
  console.log(`  👤 Cetățean: maria.popescu / maria123\n`);
});
