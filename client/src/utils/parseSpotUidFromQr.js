export function parseSpotUidFromQr(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";

  try {
    const url = new URL(text, window.location.origin);
    const uid = url.searchParams.get("uid");
    if (uid) return uid.trim().slice(0, 80);
    const pathMatch = url.pathname.match(/\/p\/([^/?#]+)/i);
    if (pathMatch) return pathMatch[1].trim().slice(0, 80);
  } catch {
    // not a URL — try raw UUID below
  }

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    return text.slice(0, 80);
  }

  return "";
}
