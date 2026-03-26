const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const Database = require('better-sqlite3');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const publicDir = path.join(__dirname, 'public');
const dataDir = path.join(__dirname, 'data');
const imgDir = path.join(publicDir, 'img');
[dataDir, imgDir, path.join(publicDir,'css'), path.join(publicDir,'js')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// Database
const db = new Database(path.join(dataDir, 'primaria.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS departments (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL,
    description TEXT, icon TEXT DEFAULT 'building', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT DEFAULT 'cetatean',
    department_id INTEGER, full_name TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (department_id) REFERENCES departments(id)
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT DEFAULT 'sesizare',
    title TEXT NOT NULL, description TEXT NOT NULL, category TEXT NOT NULL,
    latitude REAL, longitude REAL, address TEXT, photo_path TEXT,
    status TEXT DEFAULT 'nou', priority TEXT DEFAULT 'normal',
    cerere_nr TEXT, cerere_date TEXT, rezolutie TEXT,
    department_id INTEGER, department_notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (department_id) REFERENCES departments(id)
  );
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, summary TEXT, content TEXT NOT NULL,
    category TEXT DEFAULT 'general', image_url TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL,
    subject TEXT, message TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Auth
const hashPw = (pw, salt) => crypto.pbkdf2Sync(pw, salt, 10000, 64, 'sha512').toString('hex');
function createUser(username, email, password, role, deptId, fullName) {
  const salt = crypto.randomBytes(16).toString('hex');
  return db.prepare('INSERT INTO users (username,email,password_hash,salt,role,department_id,full_name) VALUES (?,?,?,?,?,?,?)')
    .run(username, email, hashPw(password, salt), salt, role || 'cetatean', deptId || null, fullName || username);
}
function loginUser(username, password) {
  const u = db.prepare('SELECT * FROM users WHERE username=? OR email=?').get(username, username);
  if (!u || hashPw(password, u.salt) !== u.password_hash) return null;
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,?)').run(token, u.id, new Date(Date.now()+7*86400000).toISOString());
  return { token, user: { id:u.id, username:u.username, email:u.email, role:u.role, department_id:u.department_id, full_name:u.full_name } };
}
function authMw(req, res, next) {
  const t = req.headers['x-auth-token'];
  if (!t) { req.user = null; return next(); }
  const s = db.prepare("SELECT u.id,u.username,u.email,u.role,u.department_id,u.full_name FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires_at>datetime('now')").get(t);
  req.user = s || null; next();
}
const needAuth = (rq,rs,nx) => rq.user ? nx() : rs.status(401).json({error:'Autentificare necesară'});
const needRole = (...roles) => (rq,rs,nx) => rq.user && roles.includes(rq.user.role) ? nx() : rs.status(403).json({error:'Acces interzis'});
function generateCerereNr() {
  const y = new Date().getFullYear();
  const c = db.prepare("SELECT COUNT(*) as c FROM reports WHERE cerere_nr LIKE ?").get(`%/${y}`).c;
  return `${String(c+1).padStart(4,'0')}/${y}`;
}

// Seed
if (!db.prepare('SELECT COUNT(*) as c FROM departments').get().c) {
  const d = db.prepare('INSERT INTO departments (name,description) VALUES (?,?)');
  d.run('Direcția Drumuri și Poduri','Întreținerea drumurilor și trotuarelor');
  d.run('Direcția Iluminat Public','Iluminatul stradal');
  d.run('Direcția Salubritate','Colectare deșeuri și curățenie');
  d.run('Direcția Spații Verzi','Parcuri și grădini');
  d.run('Direcția Apă și Canalizare','Rețeaua de apă și canalizare');
  d.run('Direcția Urbanism','Autorizații și amenajare');
  d.run('Direcția Mobilier Urban','Bănci, coșuri, stații');
}
if (!db.prepare("SELECT COUNT(*) as c FROM users WHERE role='admin'").get().c) {
  createUser('admin','admin@primaria-galati.ro','admin123','admin',null,'Administrator');
  createUser('primar','primar@primaria-galati.ro','primar123','primar',null,'Primarul Municipiului');
  const depts = db.prepare('SELECT id FROM departments').all();
  const dn = ['drumuri','iluminat','salubritate','spatii.verzi','apa.canal','urbanism','mobilier'];
  dn.forEach((u,i) => { if(depts[i]) createUser(u,u+'@primaria-galati.ro','dept123','departament',depts[i].id,'Șef '+u); });
  createUser('maria.popescu','maria@email.ro','maria123','cetatean',null,'Maria Popescu');
}
if (!db.prepare('SELECT COUNT(*) as c FROM news').get().c) {
  const n = db.prepare('INSERT INTO news (title,summary,content,category,image_url) VALUES (?,?,?,?,?)');
  n.run('Reabilitarea Falezei Dunării','Lucrările au demarat pe segmentul central.','Primăria Galați a demarat etapa a doua de reabilitare a Falezei Dunării.\n\nProiectul include modernizarea aleilor, 80 corpuri LED, 3 zone de relaxare.\n\nInvestiție: 4.8 milioane lei.','proiecte','https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800');
  n.run('Programul Galați Verde','Colectare selectivă în toate cartierele.','Programul se extinde în Micro 13-21, Țiglina, Mazepa, Siderurgiștilor.\n\nFiecare gospodărie primește 3 pubele gratuite.','mediu','https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800');
  n.run('Ședința Consiliului Local','Dezbaterea bugetului 2026.','Consiliul Local Galați — ședință joi, 3 aprilie 2026, ora 10:00, Str. Domnească 38.\n\nOrdine de zi: bugetul 2026, modernizare transport, digitalizare.','administrativ','https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800');
}
if (!db.prepare('SELECT COUNT(*) as c FROM reports').get().c) {
  const uid = db.prepare("SELECT id FROM users WHERE username='maria.popescu'").get()?.id || 1;
  const now = new Date().toISOString();
  const r = db.prepare('INSERT INTO reports (user_id,type,title,description,category,latitude,longitude,address,status,priority,cerere_nr,cerere_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  r.run(uid,'sesizare','Groapă pe Str. Brăilei','Groapă de ~40cm, zona Micro 17.','drum',45.4386,28.0503,'Str. Brăilei, Micro 17','in_lucru','urgent','0001/2026',now);
  r.run(uid,'sesizare','Iluminat defect pe Faleză','Trei stâlpi nu funcționează.','iluminat',45.4352,28.0418,'Faleza Dunării','nou','normal','0002/2026',now);
  r.run(uid,'sesizare','Deșeuri la Lacul Brateș','Deșeuri de construcții pe mal.','salubritate',45.4150,28.0200,'Lacul Brateș','nou','urgent','0003/2026',now);
  r.run(uid,'serviciu','Canalizare Str. Traian','Canalizarea e înfundată de 3 zile.','canalizare',45.4330,28.0440,'Str. Traian nr. 22','in_lucru','urgent','0004/2026',now);
  db.prepare("UPDATE reports SET department_id=1 WHERE category='drum'").run();
  db.prepare("UPDATE reports SET department_id=5 WHERE category='canalizare'").run();
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(publicDir));
app.use(authMw);
const storage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,imgDir),
  filename:(req,file,cb)=>cb(null,Date.now()+'-'+Math.round(Math.random()*1E9)+path.extname(file.originalname))
});
const upload = multer({storage,limits:{fileSize:10*1024*1024}});

// AUTH API
app.post('/api/auth/register', (req,res) => {
  const {username,email,password,full_name}=req.body;
  if(!username||!email||!password) return res.status(400).json({error:'Câmpuri obligatorii'});
  if(password.length<4) return res.status(400).json({error:'Parola: minim 4 caractere'});
  if(db.prepare('SELECT id FROM users WHERE username=? OR email=?').get(username,email)) return res.status(409).json({error:'Utilizator existent'});
  try { createUser(username,email,password,'cetatean',null,full_name||username); const s=loginUser(username,password); res.status(201).json(s); }
  catch(e) { res.status(500).json({error:'Eroare'}); }
});
app.post('/api/auth/login', (req,res) => {
  const {username,password}=req.body;
  const s=loginUser(username,password);
  s ? res.json(s) : res.status(401).json({error:'Credențiale incorecte'});
});
app.post('/api/auth/logout', (req,res) => { const t=req.headers['x-auth-token']; if(t)db.prepare('DELETE FROM sessions WHERE token=?').run(t); res.json({ok:true}); });
app.get('/api/auth/me', (req,res) => {
  if(!req.user) return res.status(401).json({error:'Neautentificat'});
  let dept=null; if(req.user.department_id) dept=db.prepare('SELECT * FROM departments WHERE id=?').get(req.user.department_id);
  res.json({user:{...req.user,department:dept}});
});

// DEPARTMENTS
app.get('/api/departments', (req,res) => res.json(db.prepare('SELECT * FROM departments ORDER BY name').all()));
app.post('/api/departments', needAuth, needRole('admin'), (req,res) => {
  const {name,description}=req.body; if(!name) return res.status(400).json({error:'Nume obligatoriu'});
  const r=db.prepare('INSERT INTO departments (name,description) VALUES (?,?)').run(name,description||'');
  res.status(201).json({id:r.lastInsertRowid});
});
app.delete('/api/departments/:id', needAuth, needRole('admin'), (req,res) => { db.prepare('DELETE FROM departments WHERE id=?').run(req.params.id); res.json({ok:true}); });

// REPORTS
app.get('/api/reports', (req,res) => {
  const {status,category,type,department_id}=req.query;
  let sql='SELECT r.*,u.username as author,u.full_name as author_name,d.name as dept_name FROM reports r LEFT JOIN users u ON r.user_id=u.id LEFT JOIN departments d ON r.department_id=d.id';
  const w=[],p=[];
  if(status){w.push('r.status=?');p.push(status);} if(category){w.push('r.category=?');p.push(category);}
  if(type){w.push('r.type=?');p.push(type);} if(department_id){w.push('r.department_id=?');p.push(department_id);}
  if(req.user?.role==='departament'&&req.user.department_id){w.push('r.department_id=?');p.push(req.user.department_id);}
  if(w.length) sql+=' WHERE '+w.join(' AND ');
  sql+=' ORDER BY r.created_at DESC';
  res.json(db.prepare(sql).all(...p));
});
app.get('/api/reports/stats', (req,res) => {
  let wh='',pr=[];
  if(req.user?.role==='departament'&&req.user.department_id){wh=' WHERE department_id=?';pr.push(req.user.department_id);}
  res.json({
    total:db.prepare('SELECT COUNT(*) as c FROM reports'+wh).get(...pr).c,
    byStatus:db.prepare('SELECT status,COUNT(*) as count FROM reports'+wh+' GROUP BY status').all(...pr),
    urgent:db.prepare('SELECT COUNT(*) as c FROM reports'+(wh?wh+' AND':' WHERE')+" priority='urgent' AND status!='rezolvat'").get(...pr).c,
    unassigned:db.prepare("SELECT COUNT(*) as c FROM reports WHERE department_id IS NULL AND status!='rezolvat'").get().c
  });
});
app.get('/api/reports/:id', (req,res) => {
  const r=db.prepare('SELECT r.*,u.username as author,u.full_name as author_name,u.email as author_email,d.name as dept_name FROM reports r LEFT JOIN users u ON r.user_id=u.id LEFT JOIN departments d ON r.department_id=d.id WHERE r.id=?').get(req.params.id);
  r ? res.json(r) : res.status(404).json({error:'Negăsit'});
});
app.post('/api/reports', needAuth, upload.single('photo'), (req,res) => {
  const {type,title,description,category,latitude,longitude,address,priority}=req.body;
  if(!title||!description||!category) return res.status(400).json({error:'Câmpuri obligatorii'});
  const photo=req.file?'/img/'+req.file.filename:null;
  const nr=generateCerereNr(), dt=new Date().toISOString();
  db.prepare('INSERT INTO reports (user_id,type,title,description,category,latitude,longitude,address,photo_path,priority,cerere_nr,cerere_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(req.user.id,type||'sesizare',title,description,category,latitude||null,longitude||null,address||null,photo,priority||'normal',nr,dt);
  res.status(201).json({cerere_nr:nr});
});
app.patch('/api/reports/:id/assign', needAuth, needRole('primar','admin'), (req,res) => {
  const {department_id,rezolutie,priority}=req.body;
  const u=['updated_at=CURRENT_TIMESTAMP'],p=[];
  if(department_id!==undefined){u.push('department_id=?');p.push(department_id);u.push("status='redirectionat'");}
  if(rezolutie){u.push('rezolutie=?');p.push(rezolutie);} if(priority){u.push('priority=?');p.push(priority);}
  p.push(req.params.id); db.prepare(`UPDATE reports SET ${u.join(',')} WHERE id=?`).run(...p); res.json({ok:true});
});
app.patch('/api/reports/:id/dept', needAuth, needRole('departament','primar','admin'), (req,res) => {
  const {status,department_notes}=req.body;
  const u=['updated_at=CURRENT_TIMESTAMP'],p=[];
  if(status){u.push('status=?');p.push(status);} if(department_notes!==undefined){u.push('department_notes=?');p.push(department_notes);}
  p.push(req.params.id); db.prepare(`UPDATE reports SET ${u.join(',')} WHERE id=?`).run(...p); res.json({ok:true});
});
app.delete('/api/reports/:id', needAuth, needRole('admin','primar'), (req,res) => { db.prepare('DELETE FROM reports WHERE id=?').run(req.params.id); res.json({ok:true}); });

// USERS
app.get('/api/users', needAuth, needRole('admin'), (req,res) => {
  res.json(db.prepare('SELECT u.id,u.username,u.email,u.role,u.department_id,u.full_name,u.created_at,d.name as dept_name FROM users u LEFT JOIN departments d ON u.department_id=d.id ORDER BY u.role').all());
});
app.post('/api/users', needAuth, needRole('admin'), (req,res) => {
  const {username,email,password,role,department_id,full_name}=req.body;
  if(!username||!email||!password) return res.status(400).json({error:'Câmpuri obligatorii'});
  try { createUser(username,email,password,role,department_id,full_name); res.status(201).json({ok:true}); }
  catch(e) { res.status(409).json({error:'Utilizator existent'}); }
});
app.delete('/api/users/:id', needAuth, needRole('admin'), (req,res) => { db.prepare("DELETE FROM users WHERE id=? AND role!='admin'").run(req.params.id); res.json({ok:true}); });

// NEWS
app.get('/api/news', (req,res) => res.json(db.prepare('SELECT * FROM news ORDER BY created_at DESC').all()));
app.get('/api/news/:id', (req,res) => { const a=db.prepare('SELECT * FROM news WHERE id=?').get(req.params.id); a?res.json(a):res.status(404).json({error:'Negăsit'}); });
app.post('/api/news', needAuth, needRole('admin','primar'), (req,res) => {
  const {title,summary,content,category,image_url}=req.body;
  if(!title||!content) return res.status(400).json({error:'Titlu+conținut obligatorii'});
  const r=db.prepare('INSERT INTO news (title,summary,content,category,image_url) VALUES (?,?,?,?,?)').run(title,summary||null,content,category||'general',image_url||null);
  res.status(201).json({id:r.lastInsertRowid});
});
app.delete('/api/news/:id', needAuth, needRole('admin','primar'), (req,res) => { db.prepare('DELETE FROM news WHERE id=?').run(req.params.id); res.json({ok:true}); });

// CONTACT
app.post('/api/contact', (req,res) => {
  const {name,email,subject,message}=req.body; if(!name||!email||!message) return res.status(400).json({error:'Câmpuri obligatorii'});
  db.prepare('INSERT INTO contacts (name,email,subject,message) VALUES (?,?,?,?)').run(name,email,subject||null,message); res.json({ok:true});
});
app.get('/api/contact', needAuth, needRole('admin','primar'), (req,res) => res.json(db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all()));

// AI
const LLAMA_URL = process.env.LLAMA_URL || 'http://localhost:8080';
const AI_SYS = 'Ești asistentul Primăriei Galați. Răspunzi scurt în română. Ajuți cu raportare probleme, info despre Galați, navigare site. Primăria: Str. Domnească 38, tel 0236 307 700, L-V 08-16. Galați: ~250.000 loc, pe Dunăre.';

app.post('/api/ai/chat', async (req,res) => {
  const {message,history=[]}=req.body;
  if(!message) return res.status(400).json({error:'Mesaj necesar'});
  try {
    const ac=new AbortController(); const to=setTimeout(()=>ac.abort(),60000);
    console.log(`[AI] Sending: "${message.substring(0,50)}"`);
    const r=await fetch(`${LLAMA_URL}/v1/chat/completions`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages:[{role:'system',content:AI_SYS},...history.slice(-8),{role:'user',content:message}],max_tokens:256,temperature:0.7,stream:false}),
      signal:ac.signal
    });
    clearTimeout(to);
    if(r.ok){const d=await r.json();const reply=d.choices?.[0]?.message?.content||'Fără răspuns.';console.log(`[AI] OK: "${reply.substring(0,50)}"`);return res.json({reply,source:'llama'});}
    throw new Error('status '+r.status);
  } catch(e) { console.log(`[AI] Fallback: ${e.message}`); res.json({reply:fallback(message.toLowerCase()),source:'fallback'}); }
});

function fallback(m) {
  if(m.match(/salut|bun[aă]|hey|hello/)) return 'Bună ziua! Sunt asistentul Primăriei Galați. Cu ce vă pot ajuta?';
  if(m.match(/raport|problem|sesiz/)) return 'Pentru raportare, autentificați-vă și accesați „Raportează". Marcați locația pe hartă.';
  if(m.match(/login|cont|autentif/)) return 'Apăsați „Autentificare" din meniu pentru a vă conecta sau crea un cont.';
  if(m.match(/adres|unde|sediu/)) return 'Primăria Galați: Str. Domnească 38, cod 800008. L-V 08:00-16:00.';
  if(m.match(/telefon|sun/)) return 'Telefon: 0236 307 700.';
  if(m.match(/groa|drum|strad/)) return 'Probleme de drum → categoria „Drum / Carosabil".';
  if(m.match(/lumin|bec|stâlp/)) return 'Iluminat defect → categoria „Iluminat Public".';
  if(m.match(/gunoi|salubr/)) return 'Deșeuri → categoria „Salubritate".';
  if(m.match(/canal|ap[aă]/)) return 'Canalizare/apă → categoria „Canalizare / Apă".';
  if(m.match(/copac|parc|verde/)) return 'Spații verzi → categoria „Spații Verzi".';
  if(m.match(/stir|nout/)) return 'Știrile sunt pe pagina „Știri" din meniu.';
  if(m.match(/gala[tț]/)) return 'Galați — ~250.000 locuitori, pe malul Dunării, cel mai mare oraș din Moldova de Jos.';
  if(m.match(/ajut|help|cum/)) return 'Vă pot ajuta cu: raportare probleme, informații Galați, navigare site, contact primărie.';
  if(m.match(/mulțum|mersi/)) return 'Cu plăcere!';
  return 'Sunt asistentul Primăriei Galați. Pot ajuta cu raportări, informații sau navigare.';
}

// SPA fallback
app.get('*', (req,res) => { const p=path.join(publicDir,'index.html'); fs.existsSync(p)?res.sendFile(p):res.status(500).send('index.html lipsește'); });

app.listen(PORT,'0.0.0.0', () => {
  console.log(`\n  🏛️  Primăria Digitală Galați v3.1`);
  console.log(`  📍 http://localhost:${PORT}`);
  console.log(`  👤 admin/admin123 | primar/primar123 | maria.popescu/maria123`);
  console.log(`  🤖 AI: ${LLAMA_URL}\n`);
});
