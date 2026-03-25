const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database Setup ──────────────────────────────────────────────
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

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
    role TEXT DEFAULT 'user',
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
    user_id INTEGER,
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
    published INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Auth Helpers ────────────────────────────────────────────────
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function createUser(username, email, password, role = 'user') {
  const salt = crypto.randomBytes(16).toString('hex');
  const password_hash = hashPassword(password, salt);
  return db.prepare('INSERT INTO users (username, email, password_hash, salt, role) VALUES (?, ?, ?, ?, ?)')
    .run(username, email, password_hash, salt, role);
}

function verifyPassword(user, password) {
  return hashPassword(password, user.salt) === user.password_hash;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return token;
}

function getSession(token) {
  if (!token) return null;
  return db.prepare(`
    SELECT s.*, u.id as uid, u.username, u.email, u.role
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) || null;
}

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'];
  const session = getSession(token);
  req.user = session ? { id: session.uid, username: session.username, email: session.email, role: session.role } : null;
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Trebuie să fiți autentificat' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Acces interzis' });
  next();
}

// ── Seed Data ───────────────────────────────────────────────────
const adminCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get();
if (adminCount.c === 0) {
  createUser('admin', 'admin@primaria-galati.ro', 'admin123', 'admin');
  console.log('  👤 Admin creat: admin / admin123');
}

const newsCount = db.prepare('SELECT COUNT(*) as c FROM news').get();
if (newsCount.c === 0) {
  const ins = db.prepare('INSERT INTO news (title, summary, content, category, image_url) VALUES (?, ?, ?, ?, ?)');
  ins.run('Modernizarea Grădinii Publice din Galați', 'Lucrările de modernizare a Grădinii Publice au început.', 'Primăria Municipiului Galați anunță începerea lucrărilor de modernizare a Grădinii Publice. Proiectul, în valoare de 3.2 milioane lei, include refacerea aleilor, 150 de bănci noi, iluminat LED solar, zonă de joacă modernă și fântână arteziană.', 'proiecte', 'https://images.unsplash.com/photo-1585938389612-a552a28d6914?w=800');
  ins.run('Colectare selectivă extinsă în Galați', 'Din aprilie, colectarea selectivă se extinde în toate cartierele.', 'Primăria Galați extinde programul de colectare selectivă în toate cartierele — Micro 17, Micro 19, Țiglina, Mazepa, Siderurgiștilor. Fiecare gospodărie va primi gratuit 3 pubele color-codate.', 'mediu', 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800');
  ins.run('Ședință extraordinară a Consiliului Local', 'Consiliul Local se întrunește pentru bugetul 2026.', 'Consiliul Local Galați se va întruni vineri, 28 martie 2026, ora 10:00, în sala Primăriei din Str. Domnească nr. 38. Pe ordinea de zi: bugetul local 2026 și proiectele pentru faleza Dunării.', 'administrativ', 'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800');

  const ir = db.prepare('INSERT INTO reports (title, description, category, latitude, longitude, address, status, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  ir.run('Groapă mare pe Str. Brăilei', 'Groapă adâncă de ~30cm pe carosabil, zona Micro 17', 'drum', 45.4386, 28.0503, 'Str. Brăilei, Micro 17', 'in_lucru', 'urgent');
  ir.run('Stâlp iluminat defect pe Faleză', 'Bec ars pe stâlpul din dreptul restaurantului, zonă întunecată seara', 'iluminat', 45.4352, 28.0418, 'Faleza Dunării, zona centrală', 'nou', 'normal');
  ir.run('Gunoi ilegal lângă Lacul Brateș', 'Deșeuri de construcții depozitate ilegal pe malul lacului', 'salubritate', 45.4150, 28.0200, 'Zona Lacul Brateș', 'nou', 'urgent');
  ir.run('Bancă ruptă în Grădina Publică', 'Bancă distrusă lângă fântână, cuie ieșite - pericol', 'mobilier_urban', 45.4370, 28.0470, 'Grădina Publică', 'rezolvat', 'normal');
  ir.run('Trotuar crăpat pe Str. Domnească', 'Trotuar ridicat de rădăcini, pericol de împiedicare', 'drum', 45.4340, 28.0490, 'Str. Domnească nr. 54', 'nou', 'normal');
}

// ── Directories & Middleware ────────────────────────────────────
const publicDir = path.join(__dirname, 'public');
[publicDir, path.join(publicDir, 'css'), path.join(publicDir, 'js'), path.join(publicDir, 'img')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));
app.use(authMiddleware);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(publicDir, 'img')),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── AUTH API ────────────────────────────────────────────────────
app.post('/api/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii' });
  if (password.length < 4) return res.status(400).json({ error: 'Parola: minim 4 caractere' });
  if (db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email))
    return res.status(409).json({ error: 'Utilizator sau email deja existent' });
  try {
    const result = createUser(username, email, password);
    const token = createSession(result.lastInsertRowid);
    const user = db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ token, user });
  } catch (err) { res.status(500).json({ error: 'Eroare la înregistrare' }); }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Completați toate câmpurile' });
  const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!user || !verifyPassword(user, password)) return res.status(401).json({ error: 'Utilizator sau parolă incorectă' });
  const token = createSession(user.id);
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ message: 'Deconectat' });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Neautentificat' });
  res.json({ user: req.user });
});

// ── REPORTS API ─────────────────────────────────────────────────
app.get('/api/reports', (req, res) => {
  const { status, category } = req.query;
  let sql = 'SELECT r.*, u.username as author FROM reports r LEFT JOIN users u ON r.user_id = u.id';
  const cond = [], params = [];
  if (status) { cond.push('r.status = ?'); params.push(status); }
  if (category) { cond.push('r.category = ?'); params.push(category); }
  if (cond.length) sql += ' WHERE ' + cond.join(' AND ');
  sql += ' ORDER BY r.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/reports/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM reports').get().c;
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM reports GROUP BY status').all();
  const byCategory = db.prepare('SELECT category, COUNT(*) as count FROM reports GROUP BY category').all();
  const urgent = db.prepare("SELECT COUNT(*) as c FROM reports WHERE priority = 'urgent' AND status != 'rezolvat'").get().c;
  res.json({ total, byStatus, byCategory, urgent });
});

app.get('/api/reports/:id', (req, res) => {
  const r = db.prepare('SELECT r.*, u.username as author, u.email as author_email FROM reports r LEFT JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'Raport negăsit' });
  res.json(r);
});

app.post('/api/reports', requireAuth, upload.single('photo'), (req, res) => {
  const { title, description, category, latitude, longitude, address, priority } = req.body;
  if (!title || !description || !category) return res.status(400).json({ error: 'Titlu, descriere și categorie obligatorii' });
  const photoPath = req.file ? '/img/' + req.file.filename : null;
  const result = db.prepare('INSERT INTO reports (user_id, title, description, category, latitude, longitude, address, photo_path, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(req.user.id, title, description, category, latitude || null, longitude || null, address || null, photoPath, priority || 'normal');
  res.status(201).json({ id: result.lastInsertRowid, message: 'Raport creat cu succes' });
});

app.patch('/api/reports/:id', requireAdmin, (req, res) => {
  const { status, priority, admin_notes } = req.body;
  const ups = [], params = [];
  if (status) { ups.push('status = ?'); params.push(status); }
  if (priority) { ups.push('priority = ?'); params.push(priority); }
  if (admin_notes !== undefined) { ups.push('admin_notes = ?'); params.push(admin_notes); }
  ups.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);
  db.prepare(`UPDATE reports SET ${ups.join(', ')} WHERE id = ?`).run(...params);
  res.json({ message: 'Raport actualizat' });
});

app.delete('/api/reports/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  res.json({ message: 'Raport șters' });
});

// ── NEWS API ────────────────────────────────────────────────────
app.get('/api/news', (req, res) => res.json(db.prepare('SELECT * FROM news WHERE published = 1 ORDER BY created_at DESC').all()));
app.get('/api/news/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  a ? res.json(a) : res.status(404).json({ error: 'Negăsit' });
});
app.post('/api/news', requireAdmin, (req, res) => {
  const { title, summary, content, category, image_url } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Titlu și conținut obligatorii' });
  const r = db.prepare('INSERT INTO news (title, summary, content, category, image_url) VALUES (?,?,?,?,?)').run(title, summary||null, content, category||'general', image_url||null);
  res.status(201).json({ id: r.lastInsertRowid });
});
app.delete('/api/news/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  res.json({ message: 'Șters' });
});

// ── CONTACT API ─────────────────────────────────────────────────
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Câmpuri obligatorii lipsă' });
  db.prepare('INSERT INTO contacts (name, email, subject, message) VALUES (?,?,?,?)').run(name, email, subject||null, message);
  res.json({ message: 'Trimis' });
});
app.get('/api/contact', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all()));

// ── SPA Fallback ────────────────────────────────────────────────
app.get('*', (req, res) => {
  const p = path.join(publicDir, 'index.html');
  fs.existsSync(p) ? res.sendFile(p) : res.status(500).send('<h1>public/index.html lipsește</h1>');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🏛️  Primăria Digitală Galați — server pornit`);
  console.log(`  📍 Local:  http://localhost:${PORT}`);
  console.log(`  📍 Rețea:  http://0.0.0.0:${PORT}`);
  console.log(`  👤 Admin:  admin / admin123\n`);
});
