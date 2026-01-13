# FSWD-FP — Chat 1-to-1 (Full-Stack)

Progetto finale full-stack:
- Backend: Node + Express + Prisma + MySQL + JWT
- Frontend: React + Vite + TypeScript
- Realtime: Socket.IO (messaggi + presence)
- WebRTC: Video call 1-to-1 (solo video)

## Requisiti
- Node 20+
- MySQL in locale (o container) con database `fswd_fp`

## Setup rapido

### 1) Backend
```bash
cd backend
npm i
cp env.example .env
npm run dev# Progetto Finale — Corso Full Stack Web Developer

Applicazione Web di Messaggistica Istantanea  
Sviluppata come progetto finale del corso Full Stack Web Developer.

---

## 🧱 Stack Tecnologico

### Backend
- Node.js
- TypeScript
- Express
- Prisma ORM
- MySQL

### Frontend
- (in sviluppo)
- React + TypeScript (previsto)

---

## 📂 Struttura Repository

- `/backend` → API REST, database, autenticazione
- `/frontend` → interfaccia utente
- `main` → branch stabile (protetto)
- altri branch → sviluppo funzionalità

---

## 🔀 Workflow di lavoro (IMPORTANTE)

1. **Non lavorare mai direttamente su `main`**
2. Creare un branch per ogni feature:
   ```bash
   git checkout -b feature/nome-feature
