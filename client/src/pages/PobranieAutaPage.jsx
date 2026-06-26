import { useCallback, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import DirectionsCarFilledIcon from "@mui/icons-material/DirectionsCarFilled";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import QrPickupScanner from "../components/QrPickupScanner.jsx";
import { parseSpotUidFromQr } from "../utils/parseSpotUidFromQr.js";

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

export default function PobranieAutaPage() {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recognizedDriver, setRecognizedDriver] = useState(null);
  const [step, setStep] = useState("identify");
  const [pickupResult, setPickupResult] = useState(null);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanKey, setScanKey] = useState(0);

  const handleVerify = async (event) => {
    event.preventDefault();
    const value = identifier.trim();
    if (!value) {
      setError("Podaj identyfikator kierowcy placowego.");
      setRecognizedDriver(null);
      return;
    }

    setLoading(true);
    setError(null);
    setRecognizedDriver(null);
    setPickupResult(null);
    setStep("identify");

    try {
      const res = await fetch("/api/pobranie-auta/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
        return;
      }
      setRecognizedDriver(data.driver);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setIdentifier("");
    setError(null);
    setRecognizedDriver(null);
    setPickupResult(null);
    setStep("identify");
    setScanBusy(false);
    setScanKey(0);
  };

  const processPickup = useCallback(
    async (spotUid) => {
      if (!recognizedDriver || scanBusy) return;

      setScanBusy(true);
      setError(null);

      try {
        const res = await fetch("/api/pobranie-auta/pickup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            yardDriverId: recognizedDriver.id,
            spotUid
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || `HTTP ${res.status}`);
          setScanBusy(false);
          setScanKey((k) => k + 1);
          return;
        }
        setPickupResult(data.pickup);
        setStep("done");
      } catch (e) {
        setError(e.message || String(e));
        setScanBusy(false);
        setScanKey((k) => k + 1);
      }
    },
    [recognizedDriver, scanBusy]
  );

  const handleQrScan = useCallback(
    (decodedText) => {
      const spotUid = parseSpotUidFromQr(decodedText);
      if (!spotUid) {
        setError("Nie rozpoznano kodu QR miejsca parkingowego.");
        setScanBusy(false);
        setScanKey((k) => k + 1);
        return;
      }
      processPickup(spotUid);
    },
    [processPickup]
  );

  return (
    <Box sx={{ maxWidth: 520, mx: "auto" }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Pobranie auta
      </Typography>

      {step === "identify" && !recognizedDriver ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2} component="form" onSubmit={handleVerify}>
              <Typography variant="body1">
                Aby pobrać auto podaj identyfikator kierowcy placowego.
              </Typography>
              <TextField
                label="Identyfikator kierowcy placowego"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="np. KP-001"
                autoFocus
                fullWidth
              />
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Button type="submit" variant="contained" disabled={loading || !identifier.trim()}>
                {loading ? "Sprawdzanie…" : "Sprawdź kierowcę"}
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {recognizedDriver && step === "identify" ? (
        <Card variant="outlined" sx={{ borderColor: "success.main", borderWidth: 2 }}>
          <CardContent>
            <Stack spacing={2}>
              <Alert severity="success" sx={{ alignItems: "flex-start" }}>
                Rozpoznano kierowcę placowego: <strong>{recognizedDriver.name}</strong> (
                {recognizedDriver.identifier}).
              </Alert>
              <Typography variant="body1">Możesz teraz pobrać auto z parkingu.</Typography>
              <Button
                variant="contained"
                size="large"
                startIcon={<DirectionsCarFilledIcon />}
                onClick={() => {
                  setStep("scan");
                  setScanKey((k) => k + 1);
                }}
              >
                Pobierz auto
              </Button>
              <Button variant="text" onClick={handleReset}>
                Podaj inny identyfikator
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {step === "scan" ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Alert severity="info">
                Kierowca placowy: <strong>{recognizedDriver.name}</strong> ({recognizedDriver.identifier})
              </Alert>
              {scanBusy ? (
                <Stack alignItems="center" spacing={1} sx={{ py: 4 }}>
                  <CircularProgress />
                  <Typography variant="body2" color="text.secondary">
                    Rejestrowanie pobrania auta…
                  </Typography>
                </Stack>
              ) : (
                <QrPickupScanner key={scanKey} onScan={handleQrScan} onError={setError} />
              )}
              {error ? <Alert severity="error">{error}</Alert> : null}
              <Button
                variant="outlined"
                disabled={scanBusy}
                onClick={() => {
                  setError(null);
                  setScanBusy(false);
                  setStep("identify");
                }}
              >
                Anuluj skanowanie
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {step === "done" && pickupResult ? (
        <Card variant="outlined" sx={{ borderColor: "success.main", borderWidth: 2 }}>
          <CardContent>
            <Stack spacing={2}>
              <Alert severity="success" icon={<QrCodeScannerIcon />} sx={{ alignItems: "flex-start" }}>
                Auto zostało pobrane z miejsca <strong>{pickupResult.spotName}</strong>
                {pickupResult.spotZone ? ` (${pickupResult.spotZone})` : ""}.
              </Alert>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Numer rejestracyjny
                </Typography>
                <Typography variant="h6" sx={{ letterSpacing: 1 }}>
                  {pickupResult.plate}
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Kierowca auta
                </Typography>
                <Typography variant="body1">{pickupResult.driverName}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Pobrał
                </Typography>
                <Typography variant="body1">
                  {pickupResult.pickedUpByYardDriverName} ({pickupResult.pickedUpByYardDriverIdentifier})
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                {formatDateTime(pickupResult.pickedUpAt)}
              </Typography>
              <Button variant="contained" onClick={handleReset}>
                Pobierz kolejne auto
              </Button>
            </Stack>
          </CardContent>
        </Card>
      ) : null}
    </Box>
  );
}
