const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Database Setup ──────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'data', 'primaria.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    address TEXT,
    photo_path TEXT,
    status TEXT DEFAULT 'nou',
    priority TEXT DEFAULT 'normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

// Seed some demo data if empty
const newsCount = db.prepare('SELECT COUNT(*) as c FROM news').get();
if (newsCount.c === 0) {
  const insertNews = db.prepare(`
    INSERT INTO news (title, summary, content, category, image_url) VALUES (?, ?, ?, ?, ?)
  `);
  insertNews.run(
    'Modernizarea parcului central',
    'Lucrările de modernizare a parcului central au început. Proiectul include noi alei, bănci și un sistem de iluminat ecologic.',
    'Primăria anunță începerea lucrărilor de modernizare a parcului central al orașului. Proiectul, în valoare de 2.5 milioane lei, include:\n\n- Refacerea aleilor pietonale cu pavaj ecologic\n- Instalarea a 120 de bănci noi\n- Sistem de iluminat cu LED-uri solare\n- Zonă de joacă modernă pentru copii\n- Spațiu dedicat pentru animale de companie\n\nLucrările sunt estimate să dureze 6 luni.',
    'proiecte',
    'https://images.unsplash.com/photo-1585938389612-a552a28d6914?w=800'
  );
  insertNews.run(
    'Program de colectare selectivă extins',
    'Din luna aprilie, programul de colectare selectivă se extinde în toate cartierele orașului.',
    'Începând cu luna aprilie, primăria extinde programul de colectare selectivă a deșeurilor în toate cartierele orașului. Fiecare gospodărie va primi gratuit 3 pubele color-codate pentru plastic, hârtie și deșeuri organice.',
    'mediu',
    'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800'
  );
  insertNews.run(
    'Ședință extraordinară a Consiliului Local',
    'Consiliul Local se întrunește vineri pentru a discuta bugetul pe anul 2026.',
    'Consiliul Local al municipiului se va întruni în ședință extraordinară vineri, 28 martie 2026, ora 10:00, în sala mare a Primăriei. Pe ordinea de zi se află aprobarea bugetului local pe anul 2026 și discutarea proiectelor de infrastructură prioritare.',
    'administrativ',
    'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800'
  );

  // Seed some demo reports
  const insertReport = db.prepare(`
    INSERT INTO reports (title, description, category, latitude, longitude, address, status, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertReport.run('Groapă mare pe Str. Libertății', 'Groapă adâncă de ~30cm pe carosabil, pericol pentru mașini', 'drum', 44.4268, 26.1025, 'Str. Libertății nr. 45', 'in_lucru', 'urgent');
  insertReport.run('Stâlp de iluminat defect', 'Bec ars pe stâlpul din fața blocului A3', 'iluminat', 44.4310, 26.1050, 'Bd. Unirii nr. 12', 'nou', 'normal');
  insertReport.run('Gunoi depozitat ilegal', 'Depozitare ilegală de deșeuri lângă râu', 'salubritate', 44.4195, 26.0980, 'Str. Râului, zona industrială', 'nou', 'urgent');
  insertReport.run('Bancă ruptă în parc', 'Bancă distrusă în parcul central, cuie ieșite - pericol', 'mobilier_urban', 44.4280, 26.1010, 'Parcul Central', 'rezolvat', 'normal');
}

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'public', 'img')),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ── API Routes ──────────────────────────────────────────────────

// --- Reports ---
app.get('/api/reports', (req, res) => {
  const { status, category } = req.query;
  let sql = 'SELECT * FROM reports';
  const conditions = [];
  const params = [];

  if (status) { conditions.push('status = ?'); params.push(status); }
  if (category) { conditions.push('category = ?'); params.push(category); }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';

  res.json(db.prepare(sql).all(...params));
});

app.get('/api/reports/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM reports').get().c;
  const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM reports GROUP BY status').all();
  const byCategory = db.prepare('SELECT category, COUNT(*) as count FROM reports GROUP BY category').all();
  const urgent = db.prepare("SELECT COUNT(*) as c FROM reports WHERE priority = 'urgent' AND status != 'rezolvat'").get().c;
  res.json({ total, byStatus, byCategory, urgent });
});

app.post('/api/reports', upload.single('photo'), (req, res) => {
  const { title, description, category, latitude, longitude, address, priority } = req.body;
  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Titlu, descriere și categorie sunt obligatorii' });
  }
  const photoPath = req.file ? '/img/' + req.file.filename : null;
  const stmt = db.prepare(`
    INSERT INTO reports (title, description, category, latitude, longitude, address, photo_path, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(title, description, category, latitude || null, longitude || null, address || null, photoPath, priority || 'normal');
  res.status(201).json({ id: result.lastInsertRowid, message: 'Raport creat cu succes' });
});

app.patch('/api/reports/:id', (req, res) => {
  const { status, priority } = req.body;
  const updates = [];
  const params = [];
  if (status) { updates.push('status = ?'); params.push(status); }
  if (priority) { updates.push('priority = ?'); params.push(priority); }
  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(req.params.id);

  db.prepare(`UPDATE reports SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ message: 'Raport actualizat' });
});

app.delete('/api/reports/:id', (req, res) => {
  db.prepare('DELETE FROM reports WHERE id = ?').run(req.params.id);
  res.json({ message: 'Raport șters' });
});

// --- News ---
app.get('/api/news', (req, res) => {
  const news = db.prepare('SELECT * FROM news WHERE published = 1 ORDER BY created_at DESC').all();
  res.json(news);
});

app.get('/api/news/:id', (req, res) => {
  const article = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Articol negăsit' });
  res.json(article);
});

app.post('/api/news', (req, res) => {
  const { title, summary, content, category, image_url } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Titlu și conținut sunt obligatorii' });
  const result = db.prepare('INSERT INTO news (title, summary, content, category, image_url) VALUES (?, ?, ?, ?, ?)')
    .run(title, summary || null, content, category || 'general', image_url || null);
  res.status(201).json({ id: result.lastInsertRowid });
});

app.delete('/api/news/:id', (req, res) => {
  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  res.json({ message: 'Știre ștearsă' });
});

// --- Contact ---
app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Completați toate câmpurile obligatorii' });
  db.prepare('INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)')
    .run(name, email, subject || null, message);
  res.json({ message: 'Mesaj trimis cu succes' });
});

app.get('/api/contact', (req, res) => {
  res.json(db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all());
});

// ── SPA Fallback ────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  🏛️  Primăria Digitală — server pornit`);
  console.log(`  📍 http://localhost:${PORT}\n`);
});
