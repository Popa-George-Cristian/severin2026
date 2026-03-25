# 🏛️ Primăria Digitală

Portal digital municipal — raportare probleme pe hartă, știri, servicii publice și panou administrativ.

## 🚀 Instalare & Pornire

```bash
# Clonează / copiază proiectul pe laptop
cd primaria

# Instalează dependențele
npm install

# Pornește serverul
npm start

# SAU cu auto-restart la modificări (dev mode)
npm run dev
```

Apoi deschide **http://localhost:3000** în browser.

## 📋 Funcționalități

### 🏠 Portal Public
- **Pagina principală** cu statistici live, servicii rapide și hartă
- **Raportare probleme** cu Leaflet map interactiv (click pentru locație)
- **Știri & Anunțuri** cu pagini de articol complete
- **Contact** cu formular de mesaje
- **Despre Noi** cu informații despre proiect și echipă

### 🗺️ Sistem de Raportare pe Hartă
- Click pe hartă pentru a marca locația problemei
- Categorii: Drum, Iluminat, Salubritate, Spații Verzi, Mobilier Urban etc.
- Upload fotografii
- Prioritate (Normal / Urgent)
- Reverse geocoding automat (adresa din coordonate)

### 🛡️ Panou Administrativ
- Statistici: total rapoarte, noi, în lucru, rezolvate, urgente
- Gestionare rapoarte (schimbare status, ștergere)
- Publicare știri noi
- Vizualizare mesaje de contact
- Filtrare după status și categorie

## 🛠️ Tehnologii

- **Backend:** Node.js + Express
- **Bază de date:** SQLite (better-sqlite3) — zero configurare
- **Frontend:** Vanilla JS SPA, CSS custom
- **Hărți:** Leaflet.js + OpenStreetMap
- **Iconuri:** Lucide Icons
- **Fonturi:** Playfair Display + Source Sans 3

## 📁 Structură

```
primaria/
├── server.js          # Express server + API routes
├── package.json
├── data/              # SQLite database (auto-generat)
├── public/
│   ├── index.html     # SPA frontend
│   ├── css/style.css  # Stiluri
│   ├── js/app.js      # Logica frontend
│   └── img/           # Fotografii uploadate
└── README.md
```

## 🔮 Planuri Viitoare
- [ ] Integrare AI pentru categorizare automată a rapoartelor
- [ ] Funcționalități de accesibilitate pentru persoane nevăzătoare
- [ ] Notificări email/SMS la schimbarea statusului
- [ ] Sistem de autentificare admin
- [ ] PWA (Progressive Web App) pentru mobil
