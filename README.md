# QR Parking

Meldowanie kierowców na **dedykowanych miejscach parkingowych** — każde miejsce ma własny **link i kod QR**. Kierowca **wpisuje numer rejestracyjny**; aplikacja sprawdza, czy tablica jest w słowniku (powiązanym z imieniem i nazwiskiem).

Stack (jak Marketplace / QRupload): **Express**, **React + Vite + MUI**, dane PoC w **`data.json`**.

## Szybki start (PoC)

```bash
cd qrparking
npm install
cp data.json.example data.json   # opcjonalnie — serwer utworzy pustą bazę sam
npm run seed:local -- --yes      # przykładowe miejsca i kierowcy
npm run build
npm start
```

- **Panel:** http://localhost:3000 — miejsca, słownik kierowców, stan parkingu  
- **Meldunek (QR):** http://localhost:3000/p?uid={uuid} — widok mobilny dla kierowcy  

**Dev z hot reload frontu:** `npm start` + w drugim terminalu `npm run dev:client` → http://localhost:5173 (proxy `/api` i `/p` na :3000).

## Model

| Encja | Opis |
|--------|------|
| **Miejsce** | UUID (niezgadywalny), nazwa, link `/p?uid={uuid}` + QR |
| **Kierowca** | Numer rejestracyjny (unikalny), imię i nazwisko, numer telefonu |
| **Meldunek** | Zajęcie miejsca; zwolnienie ustawia `checkedOutAt` |

Jedno miejsce = co najwyżej **jeden aktywny** meldunek. Meldunek tylko dla tablic ze **słownika**.

## Docker

```bash
docker compose up --build
```

Aplikacja: http://localhost:3001 (dane w wolumenie `DATA_FILE`).

## Następne kroki (poza PoC)

- PostgreSQL (`DATABASE_URL`) jak w Marketplace  
- Railway / HTTPS  
- Historia meldunków w panelu  
