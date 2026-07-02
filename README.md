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

## Railway (deploy bez utraty danych)

Na Railway **dysk kontenera jest efemeryczny** — przy każdym deployu kontener startuje od zera. Jeśli `data.json` leży w `/app/data.json` bez wolumenu, miejsca i kierowcy **znikają po releasie**.

### Rozwiązanie: Volume (trwały dysk)

1. W Railway: **projekt → serwis → Volumes → Add Volume**
2. Podłącz wolumen do serwisu aplikacji
3. Ustaw **Mount Path:** `/app/data`
4. Zdeployuj ponownie (push na GitHub lub *Redeploy*)

Aplikacja automatycznie zapisze dane w:

`/app/data/data.json`

(zmienna `RAILWAY_VOLUME_MOUNT_PATH` jest ustawiana przez Railway w runtime).

### Weryfikacja

W logach startu serwisu powinno być:

```
Data file: /app/data/data.json
```

Jeśli widzisz `Data file: /app/data.json` **bez** katalogu `/app/data/`, wolumen nie jest podpięty — dane znowu znikną po deployu.

### Przywracanie danych po utracie

- Wprowadź miejsca i kierowców ponownie w panelu, **albo**
- Skopiuj lokalny `data.json` na wolumen (np. przez `railway shell` po podpięciu volume)

**Nie uruchamiaj** `npm run seed:local` na produkcji — nadpisze całą bazę przykładowymi danymi.

### Alternatywa (jawna ścieżka)

Możesz też ustawić zmienną środowiskową:

`DATA_FILE=/app/data/data.json`

(przy mount path wolumenu `/app/data`).

### Długoterminowo

Dla większej niezawodności warto przejść na **PostgreSQL** (`DATABASE_URL`) — jak w Marketplace. Plik JSON + volume wystarcza na PoC.

## Następne kroki (poza PoC)

- PostgreSQL (`DATABASE_URL`) jak w Marketplace  
- Historia meldunków w panelu  
