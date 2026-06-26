import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Select,
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

const SPOT_STATUS_LABELS = {
  free: "Wolne",
  occupied: "Zajęte",
  picked_up: "Pobrany Pojazd"
};

function spotCardStyle(spotStatus) {
  if (spotStatus === "occupied") {
    return { borderColor: "warning.main", bgcolor: "warning.50" };
  }
  if (spotStatus === "picked_up") {
    return { borderColor: "info.main", bgcolor: "info.50" };
  }
  return { borderColor: "success.main", bgcolor: "success.50" };
}

export default function OccupancyPage() {
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [zoneFilter, setZoneFilter] = useState("all");

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
    const hasOccupied = spots.some((s) => s.spotStatus === "occupied");
    if (!hasOccupied) return undefined;
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, [spots]);

  const zones = useMemo(() => {
    const unique = new Set(spots.map((s) => s.zone).filter(Boolean));
    return Array.from(unique).sort((a, b) => a.localeCompare(b, "pl"));
  }, [spots]);

  const visibleSpots = useMemo(() => {
    if (zoneFilter === "all") return spots;
    return spots.filter((s) => s.zone === zoneFilter);
  }, [spots, zoneFilter]);

  const free = visibleSpots.filter((s) => s.spotStatus === "free").length;
  const busy = visibleSpots.filter((s) => s.spotStatus === "occupied").length;
  const pickedUp = visibleSpots.filter((s) => s.spotStatus === "picked_up").length;

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

      {zones.length > 0 ? (
        <FormControl size="small" sx={{ minWidth: 240, mb: 2 }}>
          <InputLabel id="zone-filter-label">Strefa</InputLabel>
          <Select
            labelId="zone-filter-label"
            label="Strefa"
            value={zoneFilter}
            onChange={(e) => setZoneFilter(e.target.value)}
          >
            <MenuItem value="all">Wszystkie strefy</MenuItem>
            {zones.map((zone) => (
              <MenuItem key={zone} value={zone}>
                {zone}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      ) : null}

      <Stack direction="row" spacing={1} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <Chip label={`Wolne: ${free}`} color="success" variant={free ? "filled" : "outlined"} />
        <Chip label={`Zajęte: ${busy}`} color="warning" variant={busy ? "filled" : "outlined"} />
        <Chip label={`Pobrany pojazd: ${pickedUp}`} color="info" variant={pickedUp ? "filled" : "outlined"} />
      </Stack>

      {loading && spots.length === 0 ? (
        <Typography color="text.secondary">Ładowanie…</Typography>
      ) : spots.length === 0 ? (
        <Typography color="text.secondary">
          Brak miejsc — dodaj je w zakładce <strong>Miejsca</strong> lub uruchom <code>npm run seed:local -- --yes</code>.
        </Typography>
      ) : visibleSpots.length === 0 ? (
        <Typography color="text.secondary">Brak miejsc w wybranej strefie.</Typography>
      ) : (
        <Grid container spacing={2}>
          {visibleSpots.map((spot) => {
            const cardStyle = spotCardStyle(spot.spotStatus);
            const checkIn = spot.activeCheckIn;
            return (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={spot.id}>
              <Card
                variant="outlined"
                sx={{
                  height: "100%",
                  borderColor: cardStyle.borderColor,
                  borderWidth: 2,
                  bgcolor: cardStyle.bgcolor
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
                    {spot.spotStatus === "occupied" && checkIn ? (
                      <>
                        <Chip size="small" color="warning" label={SPOT_STATUS_LABELS.occupied} />
                        <Typography variant="h6" sx={{ letterSpacing: 1 }}>
                          {checkIn.plate}
                        </Typography>
                        <Typography variant="body2">{checkIn.driverName}</Typography>
                        {checkIn.driverPhone ? (
                          <Typography variant="body2" color="text.secondary">
                            tel. {checkIn.driverPhone}
                          </Typography>
                        ) : null}
                        <Typography variant="caption" color="text.secondary">
                          Od {formatDate(checkIn.checkedInAt)}
                        </Typography>
                        <Typography variant="body2" fontWeight={700} color="warning.dark">
                          Czas pobytu: {formatStayDuration(checkIn.checkedInAt, now)}
                        </Typography>
                      </>
                    ) : null}
                    {spot.spotStatus === "picked_up" && checkIn ? (
                      <>
                        <Chip size="small" color="info" label={SPOT_STATUS_LABELS.picked_up} />
                        <Typography variant="h6" sx={{ letterSpacing: 1 }}>
                          {checkIn.plate}
                        </Typography>
                        <Typography variant="body2">{checkIn.driverName}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          Pobrano {formatDate(checkIn.pickedUpAt)}
                        </Typography>
                        <Typography variant="body2" fontWeight={600} color="info.dark">
                          Pobrał: {checkIn.pickedUpByYardDriverName} ({checkIn.pickedUpByYardDriverIdentifier})
                        </Typography>
                      </>
                    ) : null}
                    {spot.spotStatus === "free" ? (
                      <Chip size="small" color="success" label={SPOT_STATUS_LABELS.free} />
                    ) : null}
                    <Link href={spot.checkInUrl} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13 }}>
                      Meldunek (QR) <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: "middle" }} />
                    </Link>
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          );
          })}
        </Grid>
      )}
    </Box>
  );
}
