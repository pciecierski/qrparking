const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const dbFile = process.env.DATA_FILE || path.join(__dirname, "..", "data.json");
const yes = process.argv.includes("--yes");

const seed = {
  spots: [
    { id: crypto.randomUUID(), name: "Miejsce 1 — Rampa A", zone: "CD2 Północ", createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), name: "Miejsce 2 — Rampa A", zone: "CD2 Północ", createdAt: new Date().toISOString() },
    { id: crypto.randomUUID(), name: "Miejsce 3 — Rampa B", zone: "CD3 Wschód", createdAt: new Date().toISOString() }
  ],
  drivers: [
    { id: "drv001", plate: "WX12345", name: "Jan Kowalski", phone: "501234567", createdAt: new Date().toISOString() },
    { id: "drv002", plate: "KR98765", name: "Anna Nowak", phone: "602345678", createdAt: new Date().toISOString() },
    { id: "drv003", plate: "GD55555", name: "Piotr Wiśniewski", phone: "603456789", createdAt: new Date().toISOString() }
  ],
  yardDrivers: [
    {
      id: "yd001",
      name: "Tomasz Zieliński",
      identifier: "KP-001",
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      id: "yd002",
      name: "Maria Lewandowska",
      identifier: "KP-002",
      status: "inactive",
      createdAt: new Date().toISOString()
    }
  ],
  checkIns: []
};

if (fs.existsSync(dbFile) && !yes) {
  console.error("Plik data.json już istnieje. Użyj --yes aby nadpisać.");
  process.exit(1);
}

fs.writeFileSync(dbFile, JSON.stringify(seed, null, 2), "utf8");
console.log(`Zapisano ${dbFile}`);
console.log("Miejsca (QR) — link meldunku:");
for (const s of seed.spots) {
  console.log(`  ${s.name}`);
  console.log(`    http://localhost:3000/p?uid=${encodeURIComponent(s.id)}`);
}
