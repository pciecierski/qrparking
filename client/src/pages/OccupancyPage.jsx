import { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Link,
  Stack,
  Typography
} from "@mui/material";
import Grid from "@mui/material/Grid2";
import RefreshIcon from "@mui/icons-material/Refresh";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function formatStayDuration(checkedInAt, now = new Date()) {
  const start = new Date(checkedInAt);
  if (Number.isNaN(start.getTime())) return "—";

  let totalSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  totalSeconds %= 86400;
  const hours = Math.floor(totalSeconds / 3600);
  totalSeconds %= 3600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days} ${days === 1 ? "dzień" : "dni"} ${hours} godz. ${minutes} min`;
  }
  if (hours > 0) {
    return `${hours} godz. ${minutes} min ${seconds} s`;
  }
  if (minutes > 0) {
    return `${minutes} min ${seconds} s`;
  }
  return `${seconds} s`;
}

export default function OccupancyPage() {
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/occupancy");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSpots(await res.json());
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const hasOccupied = spots.some((s) => s.occupied);
    if (!hasOccupied) return undefined;
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, [spots]);

  const free = spots.filter((s) => !s.occupied).length;
  const busy = spots.length - free;

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Stan parkingu
        </Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
          Odśwież
        </Button>
      </Stack>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Chip label={`Wolne: ${free}`} color="success" variant={free ? "filled" : "outlined"} />
        <Chip label={`Zajęte: ${busy}`} color="warning" variant={busy ? "filled" : "outlined"} />
      </Stack>

      {loading && spots.length === 0 ? (
        <Typography color="text.secondary">Ładowanie…</Typography>
      ) : spots.length === 0 ? (
        <Typography color="text.secondary">
          Brak miejsc — dodaj je w zakładce <strong>Miejsca</strong> lub uruchom <code>npm run seed:local -- --yes</code>.
        </Typography>
      ) : (
        <Grid container spacing={2}>
          {spots.map((spot) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={spot.id}>
              <Card
                variant="outlined"
                sx={{
                  height: "100%",
                  borderColor: spot.occupied ? "warning.main" : "success.main",
                  borderWidth: 2,
                  bgcolor: spot.occupied ? "warning.50" : "success.50"
                }}
              >
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="subtitle1" fontWeight={700}>
                      {spot.name}
                    </Typography>
                    {spot.zone ? (
                      <Typography variant="body2" color="text.secondary">
                        Strefa: {spot.zone}
                      </Typography>
                    ) : null}
                    {spot.occupied && spot.activeCheckIn ? (
                      <>
                        <Chip size="small" color="warning" label="Zajęte" />
                        <Typography variant="h6" sx={{ letterSpacing: 1 }}>
                          {spot.activeCheckIn.plate}
                        </Typography>
                        <Typography variant="body2">{spot.activeCheckIn.driverName}</Typography>
                        {spot.activeCheckIn.driverPhone ? (
                          <Typography variant="body2" color="text.secondary">
                            tel. {spot.activeCheckIn.driverPhone}
                          </Typography>
                        ) : null}
                        <Typography variant="caption" color="text.secondary">
                          Od {formatDate(spot.activeCheckIn.checkedInAt)}
                        </Typography>
                        <Typography variant="body2" fontWeight={700} color="warning.dark">
                          Czas pobytu: {formatStayDuration(spot.activeCheckIn.checkedInAt, now)}
                        </Typography>
                      </>
                    ) : (
                      <Chip size="small" color="success" label="Wolne" />
                    )}
                    <Link href={spot.checkInUrl} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13 }}>
                      Meldunek (QR) <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: "middle" }} />
                    </Link>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
