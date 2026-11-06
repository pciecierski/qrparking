/* global Tesseract */
(function (global) {
  "use strict";

  var TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
  var confusions = {
    O: "0",
    Q: "0",
    D: "0",
    I: "1",
    L: "1",
    Z: "2",
    S: "5",
    B: "8",
    G: "6"
  };

  function normalizePlate(value) {
    return String(value || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "")
      .replace(/-/g, "")
      .replace(/[^A-Z0-9]/g, "");
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (global.Tesseract) {
        resolve(global.Tesseract);
        return;
      }
      var existing = document.querySelector('script[data-plate-ocr="1"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve(global.Tesseract);
        });
        existing.addEventListener("error", reject);
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.plateOcr = "1";
      script.onload = function () {
        resolve(global.Tesseract);
      };
      script.onerror = function () {
        reject(new Error("Nie udało się załadować silnika OCR."));
      };
      document.head.appendChild(script);
    });
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = new Array(b.length + 1);
    var curr = new Array(b.length + 1);
    var i;
    var j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      curr[0] = i;
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      var tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[b.length];
  }

  function foldLookalikes(plate) {
    return normalizePlate(plate)
      .replace(/[OQD]/g, "0")
      .replace(/[IL]/g, "1")
      .replace(/Z/g, "2")
      .replace(/S/g, "5")
      .replace(/B/g, "8")
      .replace(/G/g, "6");
  }

  function plateVariants(plate) {
    var base = normalizePlate(plate);
    var variants = new Set([base, foldLookalikes(base)]);
    // pojedyncze zamiany O↔0 / I↔1 itd.
    Object.keys(confusions).forEach(function (letter) {
      var digit = confusions[letter];
      if (base.indexOf(letter) !== -1) variants.add(base.split(letter).join(digit));
      if (base.indexOf(digit) !== -1) variants.add(base.split(digit).join(letter));
    });
    return variants;
  }

  function extractCandidates(ocrText) {
    var raw = String(ocrText || "").toUpperCase();
    var compact = normalizePlate(raw);
    var found = new Set();
    if (compact.length >= 5 && compact.length <= 10) found.add(compact);
    var matches = raw.match(/[A-Z0-9]{5,10}/g) || [];
    matches.forEach(function (m) {
      found.add(normalizePlate(m));
    });
    // okna przesuwne po sklejonym tekście
    for (var len = 5; len <= 8; len++) {
      for (var i = 0; i + len <= compact.length; i++) {
        found.add(compact.slice(i, i + len));
      }
    }
    return Array.from(found);
  }

  function bestMatch(ocrText, validPlates) {
    var plates = Array.from(validPlates || []);
    if (!plates.length) return null;
    var candidates = extractCandidates(ocrText);
    var best = null;

    plates.forEach(function (plate) {
      var target = normalizePlate(plate);
      var variants = plateVariants(target);
      candidates.forEach(function (cand) {
        variants.forEach(function (variant) {
          if (cand === variant) {
            if (!best || best.distance > 0) {
              best = { plate: target, distance: 0, candidate: cand };
            }
            return;
          }
          var dist = levenshtein(cand, variant);
          var maxLen = Math.max(cand.length, variant.length) || 1;
          var ok =
            dist <= 1 ||
            (dist <= 2 && maxLen >= 7) ||
            (cand.indexOf(variant) !== -1 && variant.length >= 5) ||
            (variant.indexOf(cand) !== -1 && cand.length >= 5);
          if (!ok) return;
          if (!best || dist < best.distance) {
            best = { plate: target, distance: dist, candidate: cand };
          }
        });
      });
    });

    return best && best.distance <= 2 ? best : null;
  }

  function ensureModal() {
    var modal = document.getElementById("plate-scan-modal");
    if (modal) return modal;

    modal = document.createElement("div");
    modal.id = "plate-scan-modal";
    modal.className = "plate-scan-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML =
      '<div class="plate-scan-modal__backdrop" data-plate-scan-close="1"></div>' +
      '<div class="plate-scan-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="plate-scan-title">' +
      '  <h2 class="plate-scan-modal__title" id="plate-scan-title">Skan tablicy</h2>' +
      '  <p class="plate-scan-modal__hint">Skieruj aparat na tablicę rejestracyjną i zrób zdjęcie.</p>' +
      '  <div class="plate-scan-modal__video-wrap">' +
      '    <video id="plate-scan-video" class="plate-scan-modal__video" playsinline muted autoplay></video>' +
      '    <div class="plate-scan-modal__guide" aria-hidden="true"></div>' +
      "  </div>" +
      '  <p class="plate-scan-modal__status" id="plate-scan-status" aria-live="polite"></p>' +
      '  <button type="button" class="btn btn--primary" id="plate-scan-capture">Zrób zdjęcie i odczytaj</button>' +
      '  <button type="button" class="btn btn--secondary plate-scan-modal__cancel" data-plate-scan-close="1">Anuluj</button>' +
      "</div>";
    document.body.appendChild(modal);
    return modal;
  }

  function openPlateScanner(options) {
    var opts = options || {};
    var validPlates = opts.validPlates instanceof Set ? opts.validPlates : new Set(opts.validPlates || []);
    var onResult = typeof opts.onResult === "function" ? opts.onResult : function () {};
    var onError = typeof opts.onError === "function" ? opts.onError : function () {};

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onError("To urządzenie nie obsługuje aparatu w przeglądarce.");
      return;
    }

    var modal = ensureModal();
    var video = document.getElementById("plate-scan-video");
    var statusEl = document.getElementById("plate-scan-status");
    var captureBtn = document.getElementById("plate-scan-capture");
    var stream = null;
    var busy = false;

    function setStatus(text, isError) {
      if (!statusEl) return;
      statusEl.textContent = text || "";
      statusEl.className = "plate-scan-modal__status" + (isError ? " plate-scan-modal__status--err" : "");
    }

    function close() {
      busy = false;
      if (stream) {
        stream.getTracks().forEach(function (t) {
          t.stop();
        });
        stream = null;
      }
      if (video) video.srcObject = null;
      modal.classList.remove("plate-scan-modal--open");
      modal.setAttribute("aria-hidden", "true");
      setStatus("");
      if (captureBtn) {
        captureBtn.disabled = false;
        captureBtn.textContent = "Zrób zdjęcie i odczytaj";
      }
    }

    function captureAndRecognize() {
      if (busy || !video || !video.videoWidth) return;
      busy = true;
      captureBtn.disabled = true;
      captureBtn.textContent = "Odczytywanie…";
      setStatus("Analizuję tablicę…");

      var canvas = document.createElement("canvas");
      var vw = video.videoWidth;
      var vh = video.videoHeight;
      // wycinek środkowego pasa (gdzie jest ramka przewodnika)
      var cropH = Math.floor(vh * 0.28);
      var cropY = Math.floor((vh - cropH) / 2);
      var cropW = Math.floor(vw * 0.86);
      var cropX = Math.floor((vw - cropW) / 2);
      canvas.width = cropW;
      canvas.height = cropH;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

      // lekki kontrast pod OCR
      try {
        var img = ctx.getImageData(0, 0, cropW, cropH);
        var data = img.data;
        for (var i = 0; i < data.length; i += 4) {
          var gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
          var v = gray > 140 ? 255 : gray < 90 ? 0 : gray;
          data[i] = data[i + 1] = data[i + 2] = v;
        }
        ctx.putImageData(img, 0, 0);
      } catch (e) {
        /* ignore */
      }

      loadScript(TESSERACT_CDN)
        .then(function (TesseractLib) {
          return TesseractLib.recognize(canvas, "eng", {
            tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
            preserve_interword_spaces: "0"
          });
        })
        .then(function (result) {
          var text = (result && result.data && result.data.text) || "";
          var match = bestMatch(text, validPlates);
          if (match) {
            setStatus("Rozpoznano: " + match.plate);
            onResult(match.plate, { raw: text, distance: match.distance });
            close();
            return;
          }
          var fallback = extractCandidates(text).sort(function (a, b) {
            return b.length - a.length;
          })[0];
          if (fallback && fallback.length >= 5) {
            setStatus("Odczytano „" + fallback + "”, ale nie ma jej w słowniku placu.", true);
            onResult(fallback, { raw: text, distance: null, unmatched: true });
            busy = false;
            captureBtn.disabled = false;
            captureBtn.textContent = "Spróbuj ponownie";
            return;
          }
          setStatus("Nie udało się odczytać tablicy. Popraw kadr i spróbuj ponownie.", true);
          busy = false;
          captureBtn.disabled = false;
          captureBtn.textContent = "Zrób zdjęcie i odczytaj";
        })
        .catch(function (err) {
          setStatus((err && err.message) || "Błąd OCR.", true);
          busy = false;
          captureBtn.disabled = false;
          captureBtn.textContent = "Zrób zdjęcie i odczytaj";
          onError((err && err.message) || "Błąd OCR.");
        });
    }

    modal.classList.add("plate-scan-modal--open");
    modal.setAttribute("aria-hidden", "false");
    setStatus("Uruchamianie aparatu…");

    modal.onclick = function (event) {
      if (event.target && event.target.getAttribute("data-plate-scan-close") === "1") {
        close();
      }
    };
    captureBtn.onclick = captureAndRecognize;

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      .then(function (mediaStream) {
        stream = mediaStream;
        video.srcObject = mediaStream;
        return video.play();
      })
      .then(function () {
        setStatus("Ustaw tablicę w ramce, potem zrób zdjęcie.");
      })
      .catch(function (err) {
        close();
        var msg =
          err && err.name === "NotAllowedError"
            ? "Brak zgody na aparat. Zezwól na kamerę albo wpisz tablicę ręcznie."
            : "Nie udało się uruchomić aparatu.";
        onError(msg);
      });
  }

  global.QrParkingPlateScanner = {
    open: openPlateScanner,
    normalizePlate: normalizePlate,
    bestMatch: bestMatch
  };
})(typeof window !== "undefined" ? window : globalThis);
