# QA — Test da Esame (fswd-fp)

## Credenziali demo (seed)
- Admin: admin@example.com / Admin123!
- User:  user@example.com  / User123!

> Per test multi-utente usare **2 browser diversi** (es. Chrome + Safari) o Chrome normale + Incognito.

---

## Avvio rapido
### Backend
- `cd backend`
- `npm i`
- `npm run dev`
- (opzionale) `npm run seed`

### Frontend
- `cd frontend`
- `npm i`
- `npm run dev` (http://localhost:5173)

---

## 1) Backend smoke test
- GET `/health` → `{ ok: true }`

## 2) Login + persistenza
- Login admin → OK
- Refresh → resta loggato
- Logout → OK

## 3) Admin (solo admin)
- Accesso pagina Admin come admin → OK
- Accesso pagina Admin come user → negato (comportamento atteso)

## 4) Chat 1-to-1 realtime
Setup:
- Browser A: admin
- Browser B: user

Test:
- A seleziona B → room DM
- Messaggio A→B realtime + persistito
- Messaggio B→A realtime + persistito
- Refresh su entrambi → storico presente

## 5) Presence (pallini stato)
- B online → A vede online
- Chiudi tab B → A vede offline (dopo breve tempo)

## 6) Badge unread (notifiche)
- Messaggi ricevuti in room NON attiva → badge aumenta
- Apri la room → badge si resetta/si aggiorna

## 7) Video call (WebRTC)
- A avvia → B vede ringing + pulsante “Accetta”
- B accetta → stream parte
- Chiudi → nessun errore in console

