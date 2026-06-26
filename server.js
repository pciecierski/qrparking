const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");

const dbFilePath = process.env.DATA_FILE || path.join(__dirname, "data.json");
const clientDist = path.join(__dirname, "client", "dist");
const app = express();
const port = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function normalizePlate(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  return digits.slice(0, 15);
}

function isValidPhone(raw) {
  const phone = normalizePhone(raw);
  return phone.length >= 9 && phone.length <= 15;
}

function isValidAuthCode(raw) {
  return /^[1234]{4}$/.test(String(raw || "").trim());
}

function normalizeString(value, maxLen) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function driverToApi(d) {
  return {
    id: d.id,
    plate: normalizePlate(d.plate),
    name: d.name,
    phone: normalizePhone(d.phone),
    createdAt: d.createdAt || null
  };
}

function normalizeYardDriverStatus(raw) {
  return raw === "inactive" ? "inactive" : "active";
}

function yardDriverToApi(d) {
  return {
    id: d.id,
    name: d.name,
    identifier: normalizeString(d.identifier, 80),
    status: normalizeYardDriverStatus(d.status),
    createdAt: d.createdAt || null
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function generateSpotUid() {
  return crypto.randomUUID();
}

function parseSpotUid(raw) {
  if (raw == null) return "";
  return String(raw).trim().slice(0, 80);
}

function buildCheckInPath(uid, extraQuery = {}) {
  const params = new URLSearchParams({ uid, ...extraQuery });
  return `/p?${params.toString()}`;
}

function buildCheckInUrl(baseUrl, uid) {
  return `${baseUrl}${buildCheckInPath(uid)}`;
}

function emptyState() {
  return { spots: [], drivers: [], yardDrivers: [], checkIns: [] };
}

function normalizeState(parsed) {
  return {
    spots: Array.isArray(parsed && parsed.spots) ? parsed.spots : [],
    drivers: Array.isArray(parsed && parsed.drivers) ? parsed.drivers : [],
    yardDrivers: Array.isArray(parsed && parsed.yardDrivers) ? parsed.yardDrivers : [],
    checkIns: Array.isArray(parsed && parsed.checkIns) ? parsed.checkIns : []
  };
}

let cachedState = null;

function loadStateFromDisk() {
  if (!fs.existsSync(dbFilePath)) {
    return emptyState();
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(dbFilePath, "utf8"));
    return normalizeState(parsed);
  } catch (err) {
    console.error(`Nie można wczytać pliku danych (${dbFilePath}):`, err.message);
    try {
      const backup = `${dbFilePath}.corrupt-${Date.now()}.bak`;
      fs.copyFileSync(dbFilePath, backup);
      console.error(`Zapisano kopię uszkodzonego pliku: ${backup}`);
    } catch (backupErr) {
      console.error("Nie udało się utworzyć kopii zapasowej:", backupErr.message);
    }
    return emptyState();
  }
}

function getState() {
  if (!cachedState) {
    cachedState = loadStateFromDisk();
  }
  return cachedState;
}

function persistState() {
  const state = getState();
  const dir = path.dirname(dbFilePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = JSON.stringify(state, null, 2);
  const tmpPath = `${dbFilePath}.tmp`;
  fs.writeFileSync(tmpPath, payload, "utf8");
  if (fs.existsSync(dbFilePath)) {
    fs.unlinkSync(dbFilePath);
  }
  fs.renameSync(tmpPath, dbFilePath);
}

function initState() {
  cachedState = loadStateFromDisk();
  if (!fs.existsSync(dbFilePath)) {
    persistState();
    console.log(`Utworzono plik danych: ${dbFilePath}`);
  }
  console.log(
    `Stan parkingu: ${cachedState.spots.length} miejsc, ${cachedState.drivers.length} aut na placu, ${cachedState.yardDrivers.length} kierowców placowych, ${cachedState.checkIns.length} meldunków`
  );
}

function resolveSpotByUid(uid) {
  const state = getState();
  const id = parseSpotUid(uid);
  const spot = id ? state.spots.find((s) => s.id === id) : null;
  return { state, spot, id };
}

function getActiveCheckIn(state, spotId) {
  return (
    state.checkIns
      .filter((c) => c.spotId === spotId && !c.checkedOutAt)
      .sort((a, b) => new Date(b.checkedInAt) - new Date(a.checkedInAt))[0] || null
  );
}

function findDriverByPlate(state, plate) {
  const p = normalizePlate(plate);
  if (!p) return null;
  return state.drivers.find((d) => normalizePlate(d.plate) === p) || null;
}

const PLATE_ALREADY_PARKED_MSG =
  "Pojazd z tym numerem rejestracyjnym zajmuje już miejsce parkingowe na placu, zwolnij wcześniejsze miejsce jeśli chcesz przeparkować pojazd.";

function findActiveCheckInByPlateOnOtherSpot(state, plate, spotId) {
  const p = normalizePlate(plate);
  if (!p) return null;
  return (
    state.checkIns.find(
      (c) => !c.checkedOutAt && c.spotId !== spotId && normalizePlate(c.plate) === p
    ) || null
  );
}

function getPublicBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function getSpotStatus(active) {
  if (!active) return "free";
  if (active.pickedUpAt) return "picked_up";
  return "occupied";
}

function checkInToApi(active) {
  if (!active) return null;
  return {
    id: active.id,
    plate: active.plate,
    driverName: active.driverName,
    driverPhone: active.driverPhone || null,
    checkedInAt: active.checkedInAt,
    pickedUpAt: active.pickedUpAt || null,
    pickedUpByYardDriverId: active.pickedUpByYardDriverId || null,
    pickedUpByYardDriverName: active.pickedUpByYardDriverName || null,
    pickedUpByYardDriverIdentifier: active.pickedUpByYardDriverIdentifier || null
  };
}

function spotToApi(spot, state, baseUrl) {
  const active = getActiveCheckIn(state, spot.id);
  const spotStatus = getSpotStatus(active);
  const checkInUrl = buildCheckInUrl(baseUrl, spot.id);
  return {
    id: spot.id,
    name: spot.name,
    zone: normalizeString(spot.zone, 80),
    createdAt: spot.createdAt || null,
    checkInUrl,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(checkInUrl)}`,
    spotStatus,
    occupied: spotStatus === "occupied",
    activeCheckIn: checkInToApi(active)
  };
}

function ensureSpotFromRequest(req, res, next) {
  const uid = parseSpotUid((req.body && req.body.uid) || (req.query && req.query.uid));
  if (!uid) {
    return res.status(404).send(renderNotFoundPage());
  }
  const { state, spot } = resolveSpotByUid(uid);
  if (!spot) {
    return res.status(404).send(renderNotFoundPage());
  }
  req.spotUid = uid;
  req.spot = spot;
  req.state = state;
  return next();
}

// ——— API ———

app.get("/api/spots", (req, res) => {
  const state = getState();
  const baseUrl = getPublicBaseUrl(req);
  res.json(state.spots.map((s) => spotToApi(s, state, baseUrl)));
});

app.post("/api/spots", (req, res) => {
  const name = normalizeString(req.body && req.body.name, 120);
  const zone = normalizeString(req.body && req.body.zone, 80);
  if (!name) {
    return res.status(400).json({ error: "Podaj nazwę miejsca parkingowego." });
  }
  if (!zone) {
    return res.status(400).json({ error: "Podaj strefę miejsca parkingowego." });
  }
  const state = getState();
  let id = generateSpotUid();
  for (let i = 0; i < 20 && state.spots.some((s) => s.id === id); i += 1) {
    id = generateSpotUid();
  }
  const spot = { id, name, zone, createdAt: new Date().toISOString() };
  state.spots.push(spot);
  try {
    persistState();
    res.status(201).json(spotToApi(spot, state, getPublicBaseUrl(req)));
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    state.spots.pop();
    res.status(500).json({ error: "Nie udało się zapisać danych na dysku." });
  }
});

app.delete("/api/spots/:spotId", (req, res) => {
  const { spotId } = req.params;
  const state = getState();
  const idx = state.spots.findIndex((s) => s.id === spotId);
  if (idx === -1) {
    return res.status(404).json({ error: "Nie znaleziono miejsca." });
  }
  const active = getActiveCheckIn(state, spotId);
  if (active && !active.pickedUpAt) {
    return res.status(400).json({ error: "Nie można usunąć zajętego miejsca — najpierw zwolnij parking." });
  }
  if (active && active.pickedUpAt) {
    return res.status(400).json({
      error: "Nie można usunąć miejsca z pobranym pojazdem — zamelduj nowe auto lub zakończ meldunek."
    });
  }
  state.spots.splice(idx, 1);
  state.checkIns = state.checkIns.filter((c) => c.spotId !== spotId);
  try {
    persistState();
    res.status(204).end();
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    res.status(500).json({ error: "Nie udało się zapisać danych na dysku." });
  }
});

app.post("/api/spots/:spotId/release", (req, res) => {
  const { spotId } = req.params;
  const state = getState();
  const spot = state.spots.find((s) => s.id === spotId);
  if (!spot) {
    return res.status(404).json({ error: "Nie znaleziono miejsca." });
  }
  const active = getActiveCheckIn(state, spotId);
  if (!active) {
    return res.status(400).json({ error: "Miejsce nie jest zajęte." });
  }
  if (active.pickedUpAt) {
    return res.status(400).json({ error: "Nie można zwolnić miejsca z pobranym pojazdem." });
  }
  active.checkedOutAt = new Date().toISOString();
  try {
    persistState();
    res.json(spotToApi(spot, state, getPublicBaseUrl(req)));
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    active.checkedOutAt = null;
    res.status(500).json({ error: "Nie udało się zwolnić miejsca." });
  }
});

app.get("/api/drivers", (req, res) => {
  const state = getState();
  res.json(
    state.drivers
      .map(driverToApi)
      .sort((a, b) => a.plate.localeCompare(b.plate, "pl"))
  );
});

app.post("/api/drivers", (req, res) => {
  const plate = normalizePlate(req.body && req.body.plate);
  const name = normalizeString(req.body && req.body.name, 120);
  const phone = normalizePhone(req.body && req.body.phone);
  if (!plate) {
    return res.status(400).json({ error: "Podaj numer rejestracyjny." });
  }
  if (!name) {
    return res.status(400).json({ error: "Podaj imię i nazwisko kierowcy." });
  }
  if (!isValidPhone(phone)) {
    return res.status(400).json({ error: "Podaj poprawny numer telefonu (9–15 cyfr)." });
  }
  const state = getState();
  if (state.drivers.some((d) => normalizePlate(d.plate) === plate)) {
    return res.status(409).json({ error: "Ten numer rejestracyjny jest już w słowniku." });
  }
  const driver = {
    id: `drv${crypto.randomBytes(4).toString("hex")}`,
    plate,
    name,
    phone,
    createdAt: new Date().toISOString()
  };
  state.drivers.push(driver);
  try {
    persistState();
    res.status(201).json(driverToApi(driver));
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    state.drivers.pop();
    res.status(500).json({ error: "Nie udało się zapisać danych na dysku." });
  }
});

app.delete("/api/drivers/:driverId", (req, res) => {
  const state = getState();
  const idx = state.drivers.findIndex((d) => d.id === req.params.driverId);
  if (idx === -1) {
    return res.status(404).json({ error: "Nie znaleziono kierowcy." });
  }
  state.drivers.splice(idx, 1);
  try {
    persistState();
    res.status(204).end();
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    res.status(500).json({ error: "Nie udało się zapisać danych na dysku." });
  }
});

app.get("/api/yard-drivers", (req, res) => {
  const state = getState();
  res.json(
    state.yardDrivers
      .map(yardDriverToApi)
      .sort((a, b) => a.name.localeCompare(b.name, "pl"))
  );
});

app.post("/api/yard-drivers", (req, res) => {
  const name = normalizeString(req.body && req.body.name, 120);
  const identifier = normalizeString(req.body && req.body.identifier, 80);
  const status = normalizeYardDriverStatus(req.body && req.body.status);
  if (!name) {
    return res.status(400).json({ error: "Podaj imię i nazwisko kierowcy." });
  }
  if (!identifier) {
    return res.status(400).json({ error: "Podaj identyfikator kierowcy." });
  }
  const state = getState();
  const idKey = identifier.toLowerCase();
  if (state.yardDrivers.some((d) => normalizeString(d.identifier, 80).toLowerCase() === idKey)) {
    return res.status(409).json({ error: "Ten identyfikator kierowcy jest już w rejestrze." });
  }
  const yardDriver = {
    id: `yd${crypto.randomBytes(4).toString("hex")}`,
    name,
    identifier,
    status,
    createdAt: new Date().toISOString()
  };
  state.yardDrivers.push(yardDriver);
  try {
    persistState();
    res.status(201).json(yardDriverToApi(yardDriver));
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    state.yardDrivers.pop();
    res.status(500).json({ error: "Nie udało się zapisać danych na dysku." });
  }
});

app.patch("/api/yard-drivers/:yardDriverId", (req, res) => {
  const status = normalizeYardDriverStatus(req.body && req.body.status);
  const state = getState();
  const driver = state.yardDrivers.find((d) => d.id === req.params.yardDriverId);
  if (!driver) {
    return res.status(404).json({ error: "Nie znaleziono kierowcy placowego." });
  }
  driver.status = status;
  try {
    persistState();
    res.json(yardDriverToApi(driver));
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    res.status(500).json({ error: "Nie udało się zapisać danych na dysku." });
  }
});

app.delete("/api/yard-drivers/:yardDriverId", (req, res) => {
  const state = getState();
  const idx = state.yardDrivers.findIndex((d) => d.id === req.params.yardDriverId);
  if (idx === -1) {
    return res.status(404).json({ error: "Nie znaleziono kierowcy placowego." });
  }
  state.yardDrivers.splice(idx, 1);
  try {
    persistState();
    res.status(204).end();
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    res.status(500).json({ error: "Nie udało się zapisać danych na dysku." });
  }
});

app.post("/api/pobranie-auta/verify", (req, res) => {
  const identifier = normalizeString(req.body && req.body.identifier, 80);
  if (!identifier) {
    return res.status(400).json({ error: "Podaj identyfikator kierowcy placowego." });
  }
  const state = getState();
  const idKey = identifier.toLowerCase();
  const driver = state.yardDrivers.find(
    (d) => normalizeString(d.identifier, 80).toLowerCase() === idKey
  );
  if (!driver) {
    return res.status(404).json({ error: "Nie rozpoznano kierowcy o podanym identyfikatorze." });
  }
  if (normalizeYardDriverStatus(driver.status) !== "active") {
    return res.status(403).json({ error: "Kierowca placowy jest nieaktywny." });
  }
  res.json({ driver: yardDriverToApi(driver) });
});

app.post("/api/pobranie-auta/pickup", (req, res) => {
  const yardDriverId = normalizeString(req.body && req.body.yardDriverId, 80);
  const spotUid = parseSpotUid(req.body && req.body.spotUid);
  if (!yardDriverId) {
    return res.status(400).json({ error: "Brak identyfikacji kierowcy placowego." });
  }
  if (!spotUid) {
    return res.status(400).json({ error: "Nie rozpoznano miejsca parkingowego z kodu QR." });
  }

  const state = getState();
  const yardDriver = state.yardDrivers.find((d) => d.id === yardDriverId);
  if (!yardDriver) {
    return res.status(404).json({ error: "Nie znaleziono kierowcy placowego." });
  }
  if (normalizeYardDriverStatus(yardDriver.status) !== "active") {
    return res.status(403).json({ error: "Kierowca placowy jest nieaktywny." });
  }

  const spot = state.spots.find((s) => s.id === spotUid);
  if (!spot) {
    return res.status(404).json({ error: "Miejsce parkingowe nie istnieje." });
  }

  const active = getActiveCheckIn(state, spotUid);
  if (!active) {
    return res.status(400).json({ error: "Miejsce nie jest zajęte — brak auta do pobrania." });
  }
  if (active.pickedUpAt) {
    return res.status(409).json({ error: "Auto z tego miejsca zostało już pobrane." });
  }

  const pickedUpAt = new Date().toISOString();
  active.pickedUpAt = pickedUpAt;
  active.pickedUpByYardDriverId = yardDriver.id;
  active.pickedUpByYardDriverName = yardDriver.name;
  active.pickedUpByYardDriverIdentifier = normalizeString(yardDriver.identifier, 80);

  try {
    persistState();
    res.json({
      pickup: {
        spotId: spot.id,
        spotName: spot.name,
        spotZone: normalizeString(spot.zone, 80) || null,
        plate: active.plate,
        driverName: active.driverName,
        pickedUpAt,
        pickedUpByYardDriverId: yardDriver.id,
        pickedUpByYardDriverName: yardDriver.name,
        pickedUpByYardDriverIdentifier: normalizeString(yardDriver.identifier, 80)
      }
    });
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    delete active.pickedUpAt;
    delete active.pickedUpByYardDriverId;
    delete active.pickedUpByYardDriverName;
    delete active.pickedUpByYardDriverIdentifier;
    res.status(500).json({ error: "Nie udało się zapisać pobrania auta." });
  }
});

app.get("/api/occupancy", (req, res) => {
  const state = getState();
  const baseUrl = getPublicBaseUrl(req);
  res.json(state.spots.map((s) => spotToApi(s, state, baseUrl)));
});

// ——— Strona meldunku (QR) ———

app.get("/p", (req, res) => {
  const uid = parseSpotUid(req.query.uid);
  if (!uid) {
    return res.status(404).send(renderNotFoundPage());
  }
  const { state, spot } = resolveSpotByUid(uid);
  if (!spot) {
    return res.status(404).send(renderNotFoundPage());
  }
  const active = getActiveCheckIn(state, spot.id);
  const ok = req.query.ok === "1";
  const err = req.query.err ? decodeURIComponent(String(req.query.err)) : "";
  const validPlatesJson = JSON.stringify(
    state.drivers.map((d) => normalizePlate(d.plate)).filter(Boolean)
  );
  const platesParkedElsewhereJson = JSON.stringify(
    state.checkIns
      .filter((c) => !c.checkedOutAt && c.spotId !== spot.id)
      .map((c) => normalizePlate(c.plate))
      .filter(Boolean)
  );

  const spotStatus = getSpotStatus(active);

  const statusBlock = !active
    ? `<div class="status-card status-card--free">
        <p class="status-label">Miejsce wolne</p>
      </div>`
    : active.pickedUpAt
      ? `<div class="status-card status-card--picked-up">
        <p class="status-label">Pobrany pojazd</p>
        <p class="status-plate">${escapeHtml(active.plate)}</p>
        <p class="status-driver">${escapeHtml(active.driverName)}</p>
        <p class="status-time">Pobrano: ${escapeHtml(formatDateTime(active.pickedUpAt))}</p>
        <p class="status-pickup-driver">Pobrał: ${escapeHtml(active.pickedUpByYardDriverName || "—")} (${escapeHtml(active.pickedUpByYardDriverIdentifier || "—")})</p>
      </div>`
      : `<div class="status-card status-card--busy">
        <p class="status-label">Miejsce zajęte</p>
        <p class="status-plate">${escapeHtml(active.plate)}</p>
        <p class="status-driver">${escapeHtml(active.driverName)}</p>
        <p class="status-time">Od: ${escapeHtml(formatDateTime(active.checkedInAt))}</p>
      </div>`;

  const checkInBlocked = active && !active.pickedUpAt;

  const hiddenUid = `<input type="hidden" name="uid" value="${escapeHtml(spot.id)}" />`;

  const checkoutForm =
    active && !active.pickedUpAt && state.drivers.length
      ? `<form method="post" action="/p/check-out" class="check-form check-form--out">
          ${hiddenUid}
          <h2 class="form-title">Zwolnij miejsce</h2>
          <label for="plate-out">Numer rejestracyjny</label>
          <input
            type="text"
            id="plate-out"
            name="plate"
            required
            class="check-input plate-field"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="np. WX12345"
            inputmode="text"
          />
          <p class="plate-validation" id="plate-out-hint" aria-live="polite"></p>
          <button type="submit" class="btn btn--secondary" disabled>Zwalniam miejsce</button>
        </form>`
      : "";

  res.send(`<!doctype html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(spot.name)} — QR Parking</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body class="page-checkin">
  <main class="checkin-shell">
    <header class="checkin-header">
      <p class="checkin-app">QR Parking</p>
      <h1>${escapeHtml(spot.name)}</h1>
      ${spot.zone ? `<p class="checkin-zone">Strefa: ${escapeHtml(normalizeString(spot.zone, 80))}</p>` : ""}
    </header>
    ${ok ? '<p class="flash flash--ok">Zapisano.</p>' : ""}
    ${err ? `<p class="flash flash--err">${escapeHtml(err)}</p>` : ""}
    ${statusBlock}
    ${
      state.drivers.length
        ? `<form method="post" action="/p/check-in" class="check-form check-form--in" id="check-in-form">
        ${hiddenUid}
        <input type="hidden" name="authCode" id="auth-code-hidden" value="" />
        <h2 class="form-title">Melduję się na tym miejscu</h2>
        <label for="plate-in">Numer rejestracyjny</label>
        <input
          type="text"
          id="plate-in"
          name="plate"
          required
          class="check-input plate-field"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          placeholder="np. WX12345"
          inputmode="text"
          ${checkInBlocked ? "disabled" : ""}
        />
        <p class="plate-validation" id="plate-in-hint" aria-live="polite"></p>
        <button type="submit" class="btn btn--primary" ${checkInBlocked ? "disabled" : ""}>Melduję się</button>
      </form>`
        : `<p class="hint">Brak kierowców w słowniku — dodaj tablice w panelu administracyjnym.</p>`
    }
    ${checkoutForm}
  </main>
  <div id="auth-modal" class="auth-modal" aria-hidden="true">
    <div class="auth-modal__backdrop" id="auth-modal-backdrop"></div>
    <div class="auth-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <h2 class="auth-modal__title" id="auth-modal-title">Kod autoryzacyjny</h2>
      <p class="auth-modal__text">
        Na podany w awizacji numer telefonu wysłany został SMS z kodem autoryzacyjnym, wprowadź kod poniżej
      </p>
      <label for="auth-code-input">Kod SMS (4 cyfry)</label>
      <input
        type="text"
        id="auth-code-input"
        class="check-input auth-code-input"
        maxlength="4"
        inputmode="numeric"
        pattern="[1234]{4}"
        autocomplete="one-time-code"
        placeholder="np. 1234"
      />
      <p class="plate-validation" id="auth-code-hint" aria-live="polite"></p>
      <button type="button" class="btn btn--primary" id="auth-code-confirm">Potwierdź meldunek</button>
      <button type="button" class="btn btn--secondary auth-modal__cancel" id="auth-code-cancel">Anuluj</button>
    </div>
  </div>
  <script>
    (function () {
      var validPlates = new Set(${validPlatesJson});
      var platesParkedElsewhere = new Set(${platesParkedElsewhereJson});
      var plateAlreadyParkedMsg = ${JSON.stringify(PLATE_ALREADY_PARKED_MSG)};
      function normalizePlate(value) {
        return String(value || "")
          .trim()
          .toUpperCase()
          .replace(/\\s+/g, "")
          .replace(/-/g, "");
      }
      function isValidAuthCode(value) {
        return /^[1234]{4}$/.test(String(value || "").trim());
      }
      function setupPlateField(input) {
        var hint = document.getElementById(input.id + "-hint");
        var form = input.closest("form");
        var submit = form && form.querySelector('button[type="submit"]');
        if (!form || !submit) return;
        var isCheckInForm = form.id === "check-in-form";
        function validate() {
          if (input.disabled) {
            submit.disabled = true;
            return false;
          }
          var normalized = normalizePlate(input.value);
          if (!normalized) {
            if (hint) {
              hint.textContent = "";
              hint.className = "plate-validation";
            }
            submit.disabled = true;
            return false;
          }
          if (!validPlates.has(normalized)) {
            if (hint) {
              hint.textContent = "Numer rejestracyjny nie obecny na placu.";
              hint.className = "plate-validation plate-validation--err";
            }
            submit.disabled = true;
            return false;
          }
          if (isCheckInForm && platesParkedElsewhere.has(normalized)) {
            if (hint) {
              hint.textContent = plateAlreadyParkedMsg;
              hint.className = "plate-validation plate-validation--err";
            }
            submit.disabled = true;
            return false;
          }
          if (hint) {
            hint.textContent = "";
            hint.className = "plate-validation";
          }
          submit.disabled = false;
          return true;
        }
        input.addEventListener("input", validate);
        form.addEventListener("submit", function (event) {
          if (!validate()) {
            event.preventDefault();
            return;
          }
          input.value = normalizePlate(input.value);
          if (isCheckInForm) {
            event.preventDefault();
            if (window.openAuthModal) window.openAuthModal(form);
          }
        });
        validate();
      }
      document.querySelectorAll(".plate-field").forEach(setupPlateField);

      (function setupAuthModal() {
        var modal = document.getElementById("auth-modal");
        var backdrop = document.getElementById("auth-modal-backdrop");
        var input = document.getElementById("auth-code-input");
        var hint = document.getElementById("auth-code-hint");
        var confirmBtn = document.getElementById("auth-code-confirm");
        var cancelBtn = document.getElementById("auth-code-cancel");
        var pendingForm = null;
        if (!modal || !input || !confirmBtn) return;

        function closeModal() {
          modal.classList.remove("auth-modal--open");
          modal.setAttribute("aria-hidden", "true");
          pendingForm = null;
          input.value = "";
          if (hint) {
            hint.textContent = "";
            hint.className = "plate-validation";
          }
        }

        function openModal(form) {
          pendingForm = form;
          modal.classList.add("auth-modal--open");
          modal.setAttribute("aria-hidden", "false");
          input.value = "";
          if (hint) {
            hint.textContent = "";
            hint.className = "plate-validation";
          }
          setTimeout(function () {
            input.focus();
          }, 50);
        }

        function submitWithCode() {
          var code = String(input.value || "").trim();
          if (!isValidAuthCode(code)) {
            if (hint) {
              hint.textContent = "Wprowadź poprawny 4-cyfrowy kod (cyfry 1–4).";
              hint.className = "plate-validation plate-validation--err";
            }
            return;
          }
          if (!pendingForm) return;
          var hidden = document.getElementById("auth-code-hidden");
          if (hidden) hidden.value = code;
          pendingForm.submit();
        }

        window.openAuthModal = openModal;
        confirmBtn.addEventListener("click", submitWithCode);
        cancelBtn.addEventListener("click", closeModal);
        backdrop.addEventListener("click", closeModal);
        input.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            event.preventDefault();
            submitWithCode();
          }
        });
      })();
    })();
  </script>
</body>
</html>`);
});

app.post("/p/check-in", ensureSpotFromRequest, (req, res) => {
  const spotId = req.spotUid;
  const plate = normalizePlate(req.body && req.body.plate);
  const authCode = String((req.body && req.body.authCode) || "").trim();
  const state = req.state;
  if (!isValidAuthCode(authCode)) {
    return res.redirect(
      buildCheckInPath(spotId, { err: "Nieprawidłowy kod autoryzacyjny SMS." })
    );
  }
  const driver = findDriverByPlate(state, plate);
  if (!driver) {
    return res.redirect(
      buildCheckInPath(spotId, { err: "Numer rejestracyjny nie obecny na placu." })
    );
  }
  if (findActiveCheckInByPlateOnOtherSpot(state, plate, spotId)) {
    return res.redirect(buildCheckInPath(spotId, { err: PLATE_ALREADY_PARKED_MSG }));
  }
  const active = getActiveCheckIn(state, spotId);
  if (active && !active.pickedUpAt) {
    return res.redirect(buildCheckInPath(spotId, { err: "Miejsce jest już zajęte." }));
  }
  if (active && active.pickedUpAt && !active.checkedOutAt) {
    active.checkedOutAt = new Date().toISOString();
  }
  state.checkIns.push({
    id: `ci${crypto.randomBytes(6).toString("hex")}`,
    spotId,
    driverId: driver.id,
    plate: normalizePlate(driver.plate),
    driverName: driver.name,
    driverPhone: normalizePhone(driver.phone),
    checkedInAt: new Date().toISOString(),
    checkedOutAt: null
  });
  try {
    persistState();
    res.redirect(buildCheckInPath(spotId, { ok: "1" }));
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    state.checkIns.pop();
    res.redirect(buildCheckInPath(spotId, { err: "Nie udało się zapisać meldunku." }));
  }
});

app.post("/p/check-out", ensureSpotFromRequest, (req, res) => {
  const spotId = req.spotUid;
  const plate = normalizePlate(req.body && req.body.plate);
  const state = req.state;
  const driver = findDriverByPlate(state, plate);
  if (!driver) {
    return res.redirect(
      buildCheckInPath(spotId, { err: "Numer rejestracyjny nie obecny na placu." })
    );
  }
  const active = getActiveCheckIn(state, spotId);
  if (!active) {
    return res.redirect(buildCheckInPath(spotId, { err: "Miejsce nie jest zajęte." }));
  }
  if (active.pickedUpAt) {
    return res.redirect(buildCheckInPath(spotId, { err: "Pojazd został już pobrany z tego miejsca." }));
  }
  if (normalizePlate(active.plate) !== normalizePlate(driver.plate)) {
    return res.redirect(
      buildCheckInPath(spotId, { err: "To miejsce jest zajęte przez inny pojazd." })
    );
  }
  active.checkedOutAt = new Date().toISOString();
  try {
    persistState();
    res.redirect(buildCheckInPath(spotId, { ok: "1" }));
  } catch (err) {
    console.error("Błąd zapisu stanu:", err);
    active.checkedOutAt = null;
    res.redirect(buildCheckInPath(spotId, { err: "Nie udało się zapisać zwolnienia miejsca." }));
  }
});

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function renderNotFoundPage() {
  return `<!doctype html>
<html lang="pl"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Brak miejsca — QR Parking</title><link rel="stylesheet" href="/styles.css"/></head>
<body class="page-checkin"><main class="checkin-shell">
<h1>Miejsce nie istnieje</h1><p><a href="/">Panel</a></p>
</main></body></html>`;
}

// ——— SPA ———

if (fs.existsSync(clientDist)) {
  const indexHtml = path.resolve(clientDist, "index.html");
  app.use(express.static(clientDist, { fallthrough: true }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || req.path === "/p" || req.path.startsWith("/p/")) return next();
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  });
} else {
  app.get("/", (req, res) => {
    res.status(503).type("html").send(`<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8"/><title>QR Parking</title></head>
<body style="font-family:system-ui;padding:24px;">
<h1>QR Parking</h1>
<p>Zbuduj panel: <code>npm run build</code></p>
<p>Meldunek: <code>/p?uid=&lt;uuid&gt;</code></p>
</body></html>`);
  });
}

initState();

function shutdown(signal) {
  try {
    persistState();
  } catch (err) {
    console.error(`Błąd zapisu stanu przy ${signal}:`, err);
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

app.listen(port, () => {
  console.log(`QR Parking listening on http://localhost:${port}`);
  console.log(`Data file: ${dbFilePath}`);
});
