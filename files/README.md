# 🏛️ Primăria Digitală Galați v3

Portal digital cu management ierarhic al sesizărilor: Cetățean → Primar → Departamente.

## 🚀 Pornire Rapidă

```bash
cd primaria
npm install
npm start
# → http://localhost:3000
```

## 👤 Conturi

| Rol | Utilizator | Parolă | Descriere |
|-----|-----------|--------|-----------|
| Admin | `admin` | `admin123` | Gestionare departamente și utilizatori |
| Primar | `primar` | `primar123` | Vizualizare sesizări, redirecționare către departamente |
| Departament | `drumuri` | `dept123` | Șef Direcția Drumuri (similar: iluminat, salubritate, etc.) |
| Cetățean | `maria.popescu` | `maria123` | Raportare probleme |

## 📋 Flux Sesizare

1. **Cetățeanul** raportează pe hartă → primește **Nr. Cerere** automat (ex: 0001/2026)
2. **Primarul** vizualizează toate sesizările → le **redirecționează** către departamentul responsabil cu rezoluție
3. **Departamentul** vede doar sesizările asignate → le **rezolvă** și actualizează statusul

## 🤖 AI — llama.cpp cu Model MoE

Site-ul are un asistent AI integrat. Funcționează cu fallback inteligent fără AI, dar pentru conversații reale:

### Instalare llama.cpp

```bash
# Clonare
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp

# Compilare cu suport CUDA (GTX 1050)
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release -j$(nproc)
```

### Modele MoE recomandate pentru GTX 1050 (4GB VRAM)

**Opțiunea 1 — OLMoE-1B-7B** (7B total, 1B activ per token):
```bash
# Descarcă GGUF quantizat Q4_K_M (~4GB)
wget https://huggingface.co/allenai/OLMoE-1B-7B-0924-Instruct-GGUF/resolve/main/olmoe-1b-7b-0924-instruct-q4_k_m.gguf

# Pornire server
./build/bin/llama-server \
  -m olmoe-1b-7b-0924-instruct-q4_k_m.gguf \
  -ngl 33 \
  --port 8080 \
  -c 2048
```

**Opțiunea 2 — Qwen1.5-MoE-A2.7B** (~14B total, 2.7B activ):
```bash
# Descarcă Q4_K_S (~5GB, merge cu offload parțial)
# Caută pe HuggingFace: Qwen1.5-MoE-A2.7B-Chat-GGUF

./build/bin/llama-server \
  -m qwen1.5-moe-a2.7b-chat-q4_k_s.gguf \
  -ngl 20 \
  --port 8080 \
  -c 2048
```

**Opțiunea 3 — DeepSeek-MoE-16B** (16B total, ~2.8B activ):
```bash
# Q3_K_M quantization (~4.5GB)
./build/bin/llama-server \
  -m deepseek-moe-16b-chat-q3_k_m.gguf \
  -ngl 25 \
  --port 8080 \
  -c 2048
```

> `-ngl` = nr. de layere pe GPU. Ajustează până nu depășești VRAM-ul.
> Serverul ascultă pe `http://localhost:8080` cu API compatibil OpenAI.

### Configurare

Serverul Node.js se conectează automat la `http://localhost:8080`. Poți schimba:

```bash
LLAMA_URL=http://localhost:8080 npm start
# sau
AI_MODEL=qwen npm start  # doar informativ
```

## ♿ Accesibilitate

- La prima vizită: **Space** = mod accesibil, **X** = standard
- Navigare completă cu **Tab** + **Enter**
- **Text-to-Speech** automat în română (Web Speech API)
- Butonul ♿ comută oricând
- Focus indicators vizuale mari
- Asistentul AI citește răspunsurile cu voce

## 🏗️ Arhitectură

```
server.js          Express + SQLite + Auth + AI proxy
public/
  index.html       SPA — toate paginile
  css/style.css    Design instituțional
  js/app.js        Logica completă frontend
data/
  primaria.db      Baza de date (auto-generată)
```

Linkuri instituții: Primăria Galați, Consiliul Județean, Prefectura, Poliția Locală, Transurb, Apă Canal.
