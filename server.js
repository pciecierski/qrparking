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
  return { spots: [], drivers: [], checkIns: [] };
}

function normalizeState(parsed) {
  return {
    spots: Array.isArray(parsed && parsed.spots) ? parsed.spots : [],
    drivers: Array.isArray(parsed && parsed.drivers) ? parsed.drivers : [],
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
    `Stan parkingu: ${cachedState.spots.length} miejsc, ${cachedState.drivers.length} kierowców, ${cachedState.checkIns.length} meldunków`
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

function getPublicBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

function spotToApi(spot, state, baseUrl) {
  const active = getActiveCheckIn(state, spot.id);
  const checkInUrl = buildCheckInUrl(baseUrl, spot.id);
  return {
    id: spot.id,
    name: spot.name,
    zone: normalizeString(spot.zone, 80),
    createdAt: spot.createdAt || null,
    checkInUrl,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=${encodeURIComponent(checkInUrl)}`,
    occupied: Boolean(active),
    activeCheckIn: active
      ? {
          id: active.id,
          plate: active.plate,
          driverName: active.driverName,
          driverPhone: active.driverPhone || null,
          checkedInAt: active.checkedInAt
        }
      : null
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
  if (active) {
    return res.status(400).json({ error: "Nie można usunąć zajętego miejsca — najpierw zwolnij parking." });
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

  const statusBlock = active
    ? `<div class="status-card status-card--busy">
        <p class="status-label">Miejsce zajęte</p>
        <p class="status-plate">${escapeHtml(active.plate)}</p>
        <p class="status-driver">${escapeHtml(active.driverName)}</p>
        <p class="status-time">Od: ${escapeHtml(formatDateTime(active.checkedInAt))}</p>
      </div>`
    : `<div class="status-card status-card--free">
        <p class="status-label">Miejsce wolne</p>
      </div>`;

  const hiddenUid = `<input type="hidden" name="uid" value="${escapeHtml(spot.id)}" />`;

  const checkoutForm =
    active && state.drivers.length
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
        ? `<form method="post" action="/p/check-in" class="check-form">
        ${hiddenUid}
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
          ${active ? "disabled" : ""}
        />
        <p class="plate-validation" id="plate-in-hint" aria-live="polite"></p>
        <button type="submit" class="btn btn--primary" ${active ? "disabled" : ""}>Melduję się</button>
      </form>`
        : `<p class="hint">Brak kierowców w słowniku — dodaj tablice w panelu administracyjnym.</p>`
    }
    ${checkoutForm}
  </main>
  <script>
    (function () {
      var validPlates = new Set(${validPlatesJson});
      function normalizePlate(value) {
        return String(value || "")
          .trim()
          .toUpperCase()
          .replace(/\\s+/g, "")
          .replace(/-/g, "");
      }
      function setupPlateField(input) {
        var hint = document.getElementById(input.id + "-hint");
        var form = input.closest("form");
        var submit = form && form.querySelector('button[type="submit"]');
        if (!form || !submit) return;
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
        });
        validate();
      }
      document.querySelectorAll(".plate-field").forEach(setupPlateField);
    })();
  </script>
</body>
</html>`);
});

app.post("/p/check-in", ensureSpotFromRequest, (req, res) => {
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
  if (active) {
    return res.redirect(buildCheckInPath(spotId, { err: "Miejsce jest już zajęte." }));
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
