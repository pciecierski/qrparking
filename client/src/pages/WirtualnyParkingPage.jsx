import { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Button, Chip, Stack, Tooltip, Typography } from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";

const BUILDINGS = ["CD2", "CD3"];
const SIDES = ["north", "south", "east", "west"];

const SIDE_LABELS = {
  north: "Północ",
  south: "Południe",
  east: "Wschód",
  west: "Zachód"
};

const STATUS_LABELS = {
  free: "Wolne",
  occupied: "Zajęte",
  picked_up: "Pobrany pojazd"
};

const STATUS_COLORS = {
  free: { bg: "#e8f5e9", border: "#2e7d32", text: "#1b5e20" },
  occupied: { bg: "#fff3e0", border: "#ed6c02", text: "#e65100" },
  picked_up: { bg: "#e3f2fd", border: "#0288d1", text: "#01579b" }
};

const DIRECTION_ALIASES = [
  { keys: ["polnoc"], side: "north" },
  { keys: ["poludnie"], side: "south" },
  { keys: ["wschod"], side: "east" },
  { keys: ["zachod"], side: "west" }
];

function normalizePolish(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function parseSpotZone(zone) {
  if (!zone) return { building: null, side: null };
  const parts = zone.trim().split(/\s+/);
  const building = (parts[0] || "").toUpperCase();
  const directionText = normalizePolish(parts.slice(1).join(" "));
  const match = DIRECTION_ALIASES.find(({ keys }) => keys.some((key) => directionText.includes(key)));
  return { building, side: match?.side || null };
}

function sortSpots(list) {
  return [...list].sort((a, b) => a.name.localeCompare(b.name, "pl"));
}

function groupSpotsByBuilding(spots, buildingId) {
  const grouped = {
    north: [],
    south: [],
    east: [],
    west: [],
    other: []
  };

  for (const spot of spots) {
    const { building, side } = parseSpotZone(spot.zone);
    if (building !== buildingId) continue;
    if (side && grouped[side]) grouped[side].push(spot);
    else grouped.other.push(spot);
  }

  for (const side of SIDES) {
    grouped[side] = sortSpots(grouped[side]);
  }
  grouped.other = sortSpots(grouped.other);
  return grouped;
}

function spotTooltip(spot) {
  const checkIn = spot.activeCheckIn;
  return [
    spot.name,
    spot.zone ? `Strefa: ${spot.zone}` : null,
    STATUS_LABELS[spot.spotStatus] || spot.spotStatus,
    checkIn?.plate ? `Rej.: ${checkIn.plate}` : null,
    checkIn?.driverName ? checkIn.driverName : null
  ]
    .filter(Boolean)
    .join("\n");
}

function TruckWithTrailer({ plate, colors }) {
  return (
    <Box
      sx={{
        position: "relative",
        width: "100%",
        height: 52,
        mt: 0.5
      }}
    >
      <Box
        component="svg"
        viewBox="0 0 128 52"
        sx={{ width: "100%", height: "100%", display: "block" }}
        aria-hidden
      >
        <rect x="4" y="18" width="34" height="22" rx="3" fill={colors.border} opacity="0.9" />
        <rect x="8" y="22" width="14" height="10" rx="1" fill="#fff" opacity="0.85" />
        <rect x="38" y="14" width="78" height="26" rx="2" fill={colors.border} />
        <rect x="44" y="18" width="66" height="18" rx="1" fill={colors.bg} stroke={colors.text} strokeWidth="0.6" />
        <circle cx="22" cy="42" r="6" fill="#37474f" />
        <circle cx="22" cy="42" r="2.5" fill="#90a4ae" />
        <circle cx="52" cy="42" r="6" fill="#37474f" />
        <circle cx="52" cy="42" r="2.5" fill="#90a4ae" />
        <circle cx="100" cy="42" r="6" fill="#37474f" />
        <circle cx="100" cy="42" r="2.5" fill="#90a4ae" />
      </Box>
      {plate ? (
        <Typography
          variant="caption"
          sx={{
            position: "absolute",
            top: "38%",
            left: "58%",
            transform: "translate(-50%, -50%)",
            fontWeight: 800,
            letterSpacing: 0.4,
            fontSize: "0.62rem",
            color: colors.text,
            maxWidth: "52%",
            textAlign: "center",
            lineHeight: 1.1,
            wordBreak: "break-all"
          }}
        >
          {plate}
        </Typography>
      ) : null}
    </Box>
  );
}

function VirtualSpot({ spot, vertical = false }) {
  const colors = STATUS_COLORS[spot.spotStatus] || STATUS_COLORS.free;
  const checkIn = spot.activeCheckIn;
  const isOccupied = spot.spotStatus === "occupied";
  const isFree = spot.spotStatus === "free";

  return (
    <Tooltip title={<span style={{ whiteSpace: "pre-line" }}>{spotTooltip(spot)}</span>} arrow>
      <Box
        sx={{
          width: vertical ? 96 : 112,
          minHeight: vertical ? 108 : 96,
          p: 1,
          borderRadius: 1,
          border: "2px solid",
          borderColor: colors.border,
          borderStyle: isFree ? "dashed" : "solid",
          bgcolor: colors.bg,
          color: colors.text,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          justifyContent: isOccupied ? "flex-start" : "center",
          boxSizing: "border-box",
          transition: "box-shadow 0.12s ease",
          "&:hover": { boxShadow: 2 }
        }}
      >
        <Typography variant="caption" fontWeight={700} noWrap sx={{ textAlign: "center" }}>
          {spot.name}
        </Typography>

        {isOccupied ? (
          <TruckWithTrailer plate={checkIn?.plate} colors={colors} />
        ) : null}

        {spot.spotStatus === "picked_up" && checkIn?.plate ? (
          <Typography variant="caption" fontWeight={700} sx={{ mt: 0.5, textAlign: "center", letterSpacing: 0.4 }}>
            {checkIn.plate}
          </Typography>
        ) : null}

        {isFree ? (
          <Typography variant="caption" sx={{ mt: 0.25, textAlign: "center", opacity: 0.8 }}>
            Wolne
          </Typography>
        ) : null}
      </Box>
    </Tooltip>
  );
}

function SideSpots({ spots, vertical = false }) {
  if (spots.length === 0) {
    return (
      <Box
        sx={{
          width: vertical ? 96 : 112,
          minHeight: vertical ? 48 : 32,
          opacity: 0.35
        }}
      />
    );
  }

  return (
    <Stack direction={vertical ? "column" : "row"} spacing={1} alignItems="center" justifyContent="center">
      {spots.map((spot) => (
        <VirtualSpot key={spot.id} spot={spot} vertical={vertical} />
      ))}
    </Stack>
  );
}

function BuildingParkingMap({ buildingId, grouped }) {
  const hasAny =
    SIDES.some((side) => grouped[side].length > 0) || grouped.other.length > 0;

  return (
    <Box sx={{ mb: 5 }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
        Budynek {buildingId}
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "auto minmax(160px, 220px) auto",
          gridTemplateRows: "auto minmax(140px, auto) auto",
          gridTemplateAreas: `
            ". north ."
            "west building east"
            ". south ."
          `,
          gap: 2,
          alignItems: "center",
          justifyContent: "center",
          justifyItems: "center",
          overflowX: "auto",
          pb: 1
        }}
      >
        <Box sx={{ gridArea: "north", width: "100%", display: "flex", justifyContent: "center" }}>
          <SideSpots spots={grouped.north} />
        </Box>

        <Box sx={{ gridArea: "west", display: "flex", justifyContent: "center" }}>
          <SideSpots spots={grouped.west} vertical />
        </Box>

        <Box
          sx={{
            gridArea: "building",
            width: "100%",
            minHeight: 140,
            border: "3px solid",
            borderColor: "grey.700",
            borderRadius: 1,
            bgcolor: "grey.300",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: 2
          }}
        >
          <Typography variant="h4" fontWeight={800} color="grey.900" letterSpacing={2}>
            {buildingId}
          </Typography>
        </Box>

        <Box sx={{ gridArea: "east", display: "flex", justifyContent: "center" }}>
          <SideSpots spots={grouped.east} vertical />
        </Box>

        <Box sx={{ gridArea: "south", width: "100%", display: "flex", justifyContent: "center" }}>
          <SideSpots spots={grouped.south} />
        </Box>
      </Box>

      {!hasAny ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, textAlign: "center" }}>
          Brak przypisanych miejsc dla budynku {buildingId}.
        </Typography>
      ) : null}

      {grouped.other.length > 0 ? (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Miejsca bez rozpoznanej strefy kierunkowej
          </Typography>
          <SideSpots spots={grouped.other} />
        </Box>
      ) : null}

      <Stack direction="row" spacing={2} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
        {SIDES.map((side) =>
          grouped[side].length > 0 ? (
            <Typography key={side} variant="caption" color="text.secondary">
              {SIDE_LABELS[side]}: {grouped[side].length}
            </Typography>
          ) : null
        )}
      </Stack>
    </Box>
  );
}

export default function WirtualnyParkingPage() {
  const [spots, setSpots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  const buildingLayouts = useMemo(
    () => BUILDINGS.map((buildingId) => ({ buildingId, grouped: groupSpotsByBuilding(spots, buildingId) })),
    [spots]
  );

  const unassignedSpots = useMemo(() => {
    const assigned = new Set();
    for (const { grouped } of buildingLayouts) {
      for (const side of [...SIDES, "other"]) {
        for (const spot of grouped[side]) assigned.add(spot.id);
      }
    }
    return sortSpots(spots.filter((s) => !assigned.has(s.id)));
  }, [spots, buildingLayouts]);

  const counts = useMemo(
    () => ({
      free: spots.filter((s) => s.spotStatus === "free").length,
      occupied: spots.filter((s) => s.spotStatus === "occupied").length,
      picked_up: spots.filter((s) => s.spotStatus === "picked_up").length
    }),
    [spots]
  );

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700}>
          Wirtualny Parking
        </Typography>
        <Button size="small" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
          Odśwież
        </Button>
      </Stack>

      {error ? (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      ) : null}

      <Stack direction="row" spacing={1} sx={{ mb: 3 }} flexWrap="wrap" useFlexGap>
        <Chip label={`Wolne: ${counts.free}`} color="success" variant={counts.free ? "filled" : "outlined"} />
        <Chip label={`Zajęte: ${counts.occupied}`} color="warning" variant={counts.occupied ? "filled" : "outlined"} />
        <Chip
          label={`Pobrany pojazd: ${counts.picked_up}`}
          color="info"
          variant={counts.picked_up ? "filled" : "outlined"}
        />
      </Stack>

      {loading && spots.length === 0 ? (
        <Typography color="text.secondary">Ładowanie…</Typography>
      ) : spots.length === 0 ? (
        <Typography color="text.secondary">Brak miejsc parkingowych.</Typography>
      ) : (
        <>
          {buildingLayouts.map(({ buildingId, grouped }) => (
            <BuildingParkingMap key={buildingId} buildingId={buildingId} grouped={grouped} />
          ))}

          {unassignedSpots.length > 0 ? (
            <Box>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
                Miejsca bez budynku CD2/CD3
              </Typography>
              <SideSpots spots={unassignedSpots} />
            </Box>
          ) : null}
        </>
      )}
    </Box>
  );
}
