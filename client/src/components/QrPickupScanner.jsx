import { useEffect, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { Html5Qrcode } from "html5-qrcode";

const SCANNER_ID = "qr-pickup-reader";

export default function QrPickupScanner({ onScan, onError }) {
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);

  onScanRef.current = onScan;
  onErrorRef.current = onError;

  useEffect(() => {
    handledRef.current = false;
    const scanner = new Html5Qrcode(SCANNER_ID);
    let active = true;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            if (handledRef.current) return;
            handledRef.current = true;
            onScanRef.current(decodedText);
          },
          () => {}
        );
      } catch (err) {
        if (active) {
          onErrorRef.current(
            err.message ||
              "Nie udało się uruchomić kamery. Zezwól na dostęp do aparatu w przeglądarce."
          );
        }
      }
    };

    startScanner();

    return () => {
      active = false;
      scanner
        .stop()
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, []);

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Skieruj kamerę na kod QR przy miejscu parkingowym.
      </Typography>
      <Box
        id={SCANNER_ID}
        sx={{
          width: "100%",
          minHeight: 280,
          borderRadius: 2,
          overflow: "hidden",
          bgcolor: "grey.900"
        }}
      />
    </Box>
  );
}
