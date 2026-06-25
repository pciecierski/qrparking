import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import QrCode2Icon from "@mui/icons-material/QrCode2";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

export default function SpotsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [zone, setZone] = useState("");
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

  const handleDelete = async (id) => {
    if (!window.confirm("Usunąć to miejsce parkingowe?")) return;
    const res = await fetch(`/api/spots/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || `HTTP ${res.status}`);
      return;
    }
    load();
  };

  const columns = useMemo(
    () => [
      { field: "name", headerName: "Nazwa", flex: 1, minWidth: 160 },
      { field: "zone", headerName: "Strefa", width: 150 },
      { field: "id", headerName: "UID (QR)", flex: 1, minWidth: 280 },
      {
        field: "occupied",
        headerName: "Status",
        width: 100,
        renderCell: (p) => (p.value ? "Zajęte" : "Wolne")
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
    []
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

      <DataGrid
        rows={rows}
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
