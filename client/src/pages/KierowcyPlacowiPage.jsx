import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
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
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

const STATUS_LABELS = {
  active: "Aktywny",
  inactive: "Nieaktywny"
};

export default function KierowcyPlacowiPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [status, setStatus] = useState("active");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/yard-drivers");
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
    const res = await fetch("/api/yard-drivers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        identifier: identifier.trim(),
        status
      })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || `HTTP ${res.status}`);
      return;
    }
    setOpen(false);
    setName("");
    setIdentifier("");
    setStatus("active");
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Usunąć kierowcę placowego z rejestru?")) return;
    const res = await fetch(`/api/yard-drivers/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || `HTTP ${res.status}`);
      return;
    }
    load();
  };

  const handleToggleStatus = useCallback(async (row) => {
    const nextStatus = row.status === "active" ? "inactive" : "active";
    setError(null);
    const res = await fetch(`/api/yard-drivers/${encodeURIComponent(row.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || `HTTP ${res.status}`);
      return;
    }
    load();
  }, [load]);

  const columns = useMemo(
    () => [
      {
        field: "identifier",
        headerName: "Identyfikator kierowcy",
        width: 180,
        renderCell: (p) => (
          <Typography fontWeight={700} letterSpacing={0.5}>
            {p.value}
          </Typography>
        )
      },
      { field: "name", headerName: "Imię i nazwisko", flex: 1, minWidth: 180 },
      {
        field: "status",
        headerName: "Status",
        width: 200,
        sortable: false,
        renderCell: (p) => (
          <Stack direction="row" alignItems="center" spacing={1}>
            <Switch
              size="small"
              checked={p.value === "active"}
              onChange={() => handleToggleStatus(p.row)}
              inputProps={{
                "aria-label": p.value === "active" ? "Deaktywuj kierowcę" : "Aktywuj kierowcę"
              }}
            />
            <Chip
              size="small"
              label={STATUS_LABELS[p.value] || p.value}
              color={p.value === "active" ? "success" : "default"}
              variant={p.value === "active" ? "filled" : "outlined"}
            />
          </Stack>
        )
      },
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
    [handleToggleStatus]
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Kierowcy placowi
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Rejestr kierowców obsługujących plac — identyfikator, dane i status aktywności.
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
        <DialogTitle>Nowy kierowca placowy</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Imię i nazwisko"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Jan Kowalski"
              autoFocus
            />
            <TextField
              label="Identyfikator kierowcy"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="np. KP-001"
            />
            <FormControl fullWidth>
              <InputLabel id="yard-driver-status-label">Status</InputLabel>
              <Select
                labelId="yard-driver-status-label"
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <MenuItem value="active">Aktywny</MenuItem>
                <MenuItem value="inactive">Nieaktywny</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Anuluj</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={!name.trim() || !identifier.trim()}
          >
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
