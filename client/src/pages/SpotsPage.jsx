import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

const STATUS_LABELS = {
  free: "Wolne",
  occupied: "Zajęte",
  picked_up: "Pobrany Pojazd"
};

export default function SpotsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [qrOpen, setQrOpen] = useState(false);
  const [qrSpot, setQrSpot] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/spots");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(await res.json());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const zones = useMemo(() => {
    const unique = new Set(rows.map((r) => r.zone).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "pl"));
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (zoneFilter === "all") return rows;
    return rows.filter((r) => r.zone === zoneFilter);
  }, [rows, zoneFilter]);

  const handleCreate = async () => {
    const n = name.trim();
    const z = zone.trim();
    if (!n || !z) return;
    const res = await fetch("/api/spots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, zone: z })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || `HTTP ${res.status}`);
      return;
    }
    setCreateOpen(false);
    setName("");
    setZone("");
    load();
  };

  const handleDelete = useCallback(
    async (id) => {
      if (!window.confirm("Usunąć to miejsce parkingowe?")) return;
      const res = await fetch(`/api/spots/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `HTTP ${res.status}`);
        return;
      }
      load();
    },
    [load]
  );

  const handleRelease = useCallback(
    async (row) => {
      const plate = row.activeCheckIn?.plate;
      const message = plate
        ? `Zwolnić miejsce „${row.name}”? Pojazd ${plate} zostanie wymeldowany.`
        : `Zwolnić miejsce „${row.name}”?`;
      if (!window.confirm(message)) return;
      setError(null);
      const res = await fetch(`/api/spots/${encodeURIComponent(row.id)}/release`, {
        method: "POST"
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `HTTP ${res.status}`);
        return;
      }
      load();
    },
    [load]
  );

  const columns = useMemo(
    () => [
      { field: "name", headerName: "Nazwa", flex: 1, minWidth: 160 },
      { field: "zone", headerName: "Strefa", width: 150 },
      { field: "id", headerName: "UID (QR)", flex: 1, minWidth: 280 },
      {
        field: "spotStatus",
        headerName: "Status",
        width: 140,
        renderCell: (p) => STATUS_LABELS[p.value] || p.value
      },
      {
        field: "checkInUrl",
        headerName: "Link meldunku",
        flex: 1,
        minWidth: 200,
        renderCell: (p) => (
          <a href={p.value} target="_blank" rel="noopener noreferrer">
            Otwórz
          </a>
        )
      },
      {
        field: "release",
        headerName: "",
        width: 100,
        sortable: false,
        renderCell: (p) =>
          p.row.spotStatus === "occupied" ? (
            <Button size="small" variant="outlined" color="warning" onClick={() => handleRelease(p.row)}>
              Zwolnij
            </Button>
          ) : null
      },
      {
        field: "actions",
        headerName: "Akcje",
        width: 120,
        sortable: false,
        renderCell: (p) => (
          <Stack direction="row">
            <IconButton
              size="small"
              aria-label="Kod QR"
              onClick={() => {
                setQrSpot(p.row);
                setQrOpen(true);
              }}
            >
              <QrCode2Icon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Otwórz meldunek"
              href={p.row.checkInUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label="Usuń" onClick={() => handleDelete(p.row.id)}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        )
      }
    ],
    [handleDelete, handleRelease]
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Miejsca parkingowe
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Dodaj miejsce
        </Button>
      </Stack>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {zones.length > 0 ? (
        <FormControl size="small" sx={{ minWidth: 240, mb: 2 }}>
          <InputLabel id="spots-zone-filter-label">Strefa</InputLabel>
          <Select
            labelId="spots-zone-filter-label"
            label="Strefa"
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
          >
            <MenuItem value="all">Wszystkie strefy</MenuItem>
            {zones.map((z) => (
              <MenuItem key={z} value={z}>
                {z}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : null}

      <DataGrid
        rows={visibleRows}
        columns={columns}
        loading={loading}
        getRowId={(r) => r.id}
        autoHeight
        pageSizeOptions={[10, 25]}
        initialState={{ pagination: { paginationModel: { pageSize: 10 } } }}
        disableRowSelectionOnClick
      />

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nowe miejsce parkingowe</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              autoFocus
              label="Nazwa miejsca"
              fullWidth
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Miejsce 4 — Rampa B"
            />
            <TextField
              label="Strefa"
              fullWidth
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="np. CD2 Północ"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Anuluj</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!name.trim() || !zone.trim()}>
            Utwórz i wygeneruj QR
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={qrOpen} onClose={() => setQrOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{qrSpot?.name}</DialogTitle>
        <DialogContent sx={{ textAlign: "center" }}>
          {qrSpot?.qrCodeUrl ? (
            <img src={qrSpot.qrCodeUrl} alt="Kod QR meldunku" style={{ maxWidth: "100%" }} />
          ) : null}
          <Typography variant="body2" sx={{ mt: 2, wordBreak: "break-all" }}>
            {qrSpot?.checkInUrl}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrOpen(false)}>Zamknij</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
