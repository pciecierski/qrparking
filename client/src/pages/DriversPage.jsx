import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Alert,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

export default function DriversPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [plate, setPlate] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/drivers");
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
    const res = await fetch("/api/drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate: plate.trim(), name: name.trim(), phone: phone.trim() })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || `HTTP ${res.status}`);
      return;
    }
    setOpen(false);
    setPlate("");
    setName("");
    setPhone("");
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Usunąć kierowcę ze słownika?")) return;
    const res = await fetch(`/api/drivers/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || `HTTP ${res.status}`);
      return;
    }
    load();
  };

  const columns = useMemo(
    () => [
      {
        field: "plate",
        headerName: "Nr rejestracyjny",
        width: 160,
        renderCell: (p) => (
          <Typography fontWeight={700} letterSpacing={1}>
            {p.value}
          </Typography>
        )
      },
      { field: "name", headerName: "Kierowca", flex: 1, minWidth: 160 },
      { field: "phone", headerName: "Telefon", width: 140 },
      {
        field: "actions",
        headerName: "",
        width: 60,
        sortable: false,
        renderCell: (p) => (
          <IconButton size="small" aria-label="Usuń" onClick={() => handleDelete(p.row.id)}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        )
      }
    ],
    []
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Rejestr Kierowców na placu
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Meldunek na miejscu możliwy tylko dla tablic z tej listy.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          Dodaj kierowcę
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
        pageSizeOptions={[10, 25, 50]}
        initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
        disableRowSelectionOnClick
      />

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nowy kierowca</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="info" sx={{ alignItems: "flex-start" }}>
              Każda nowa wizyta z poziomu systemu YMS będzie skutkowała wpisaniem kierowcy do rejestru
              kierowców, który będzie pozwalał na zameldowanie się kierowcy na danym miejscu parkingowym.
            </Alert>
            <TextField
              label="Numer rejestracyjny"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="np. WX 12345"
              autoFocus
            />
            <TextField
              label="Imię i nazwisko"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Jan Kowalski"
            />
            <TextField
              label="Numer telefonu"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="np. 501 234 567"
              inputMode="tel"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Anuluj</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!plate.trim() || !name.trim() || !phone.trim()}>
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
