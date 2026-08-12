const express = require("express");
const rateLimit = require("express-rate-limit");

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// Google Places proxy (nearby / geocode / details / photo)
//
// The browser talks to Google's Places API through this server-side proxy so
// the API key never leaves the backend. Because the proxy is unauthenticated
// (repair-centre search works for guests), every input is validated and the
// endpoints are rate-limited per IP — otherwise the proxy would be a free
// Google-billing abuse vector.
// ─────────────────────────────────────────────────────────────────────────────

// Google Nearby Search hard cap is 50,000 m; anything larger is rejected
// rather than passed through.
const MAX_RADIUS = 50000;
const DEFAULT_RADIUS = 10000;
const KEYWORD_MAX_LENGTH = 80;
// Google place IDs look like "ChIJN1t_tDeuEmsRUsoyG83frY4"; photo references
// like "CmRa…". Enforce a sane charset + length so the proxy can't be used
// to probe arbitrary strings upstream.
const PLACE_ID_RE = /^[A-Za-z0-9_-]{10,255}$/;
const PHOTO_REF_RE = /^[A-Za-z0-9_-]{10,1024}$/;

// Allow-listed Google place types the repair-centre flow uses. Rejecting
// arbitrary types keeps the proxy from becoming a general-purpose scraper.
const ALLOWED_TYPES = new Set([
  "electronics_store",
  "hardware_store",
  "home_goods_store",
  "store",
  "shopping_mall",
  "department_store",
  "furniture_store",
  "home_improvement_store",
  "car_repair",
  "auto_repair",
  "electrician",
  "plumber",
  "locksmith"
]);

// Strict per-IP limit regardless of authentication state — guests get the
// same protection as signed-in users. Overridable via PLACES_RATE_LIMIT.
const placesLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.PLACES_RATE_LIMIT) || 120,
  standardHeaders: "draft-7",
  legacyHeaders: false
});
router.use(placesLimiter);

const hasApiKey = () => Boolean(process.env.GOOGLE_PLACES_API_KEY);

// 10s cap on every upstream call so a hung Google/Nominatim request can't
// tie up a free-tier dyno.
async function fetchJsonWithTimeout(url, headers = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", ...headers }
    });
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validCoordPair(lat, lng) {
  const la = parseCoord(lat);
  const lo = parseCoord(lng);
  return la !== null && la >= -90 && la <= 90 && lo !== null && lo >= -180 && lo <= 180;
}

// Optional integration — a missing key must produce a controlled 503, never a
// malformed upstream request with "key=undefined".
function requirePlacesKey(res) {
  if (!hasApiKey()) {
    res.status(503).json({ error: "Place search is temporarily unavailable" });
    return false;
  }
  return true;
}

// Upstream errors are logged server-side without the URL (a fetch error can
// embed the request URL, which carries the API key) and surfaced to clients
// as a single safe message — never raw Google errors or stack traces.
router.get("/nearby", async (req, res) => {
  const { lat, lng } = req.query;
  if (lat === undefined || lng === undefined || lat === "" || lng === "") {
    return res.status(400).json({ error: "lat and lng are required" });
  }
  if (!validCoordPair(lat, lng)) {
    return res.status(400).json({ error: "lat must be between -90 and 90 and lng between -180 and 180" });
  }
  const radius = req.query.radius === undefined ? DEFAULT_RADIUS : Number(req.query.radius);
  if (!Number.isFinite(radius) || radius < 1 || radius > MAX_RADIUS) {
    return res.status(400).json({ error: `radius must be between 1 and ${MAX_RADIUS} meters` });
  }
  const type = String(req.query.type || "electronics_store").trim();
  if (!ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ error: "Unsupported place type" });
  }
  // Keywords are derived from product brand names, which can contain
  // characters outside the safe set — strip them rather than rejecting the
  // whole search. An over-long keyword (a malformed/abusive client) is still
  // rejected outright.
  const keyword = String(req.query.keyword || "")
    .trim()
    .replace(/[^A-Za-z0-9 .,&'+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (keyword.length > KEYWORD_MAX_LENGTH) {
    return res.status(400).json({ error: "keyword is too long" });
  }
  if (!requirePlacesKey(res)) return;

  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
      `?location=${lat},${lng}&radius=${radius}&key=${process.env.GOOGLE_PLACES_API_KEY}` +
      `&type=${type}&keyword=${encodeURIComponent(keyword)}`;
    const data = await fetchJsonWithTimeout(url);
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(`Places nearby returned upstream status: ${data.status}`);
      return res.status(502).json({ error: "Unable to load nearby repair centres." });
    }
    return res.json(data);
  } catch {
    console.warn("Places nearby upstream request failed");
    return res.status(502).json({ error: "Unable to load nearby repair centres." });
  }
});

// Reverse-geocode a lat/lng into a human-readable place name/address. Tries
// Google first, then falls back to OpenStreetMap's Nominatim so the UI always
// has a place name to display.
router.get("/geocode", async (req, res) => {
  const { lat, lng } = req.query;
  if (lat === undefined || lng === undefined || lat === "" || lng === "") {
    return res.status(400).json({ error: "lat and lng are required" });
  }
  if (!validCoordPair(lat, lng)) {
    return res.status(400).json({ error: "lat must be between -90 and 90 and lng between -180 and 180" });
  }
  // Only the Google branch needs the API key — the Nominatim fallback works
  // without it, so a missing key must not kill geocoding entirely.
  let googleData = null;
  if (hasApiKey()) {
    try {
      const googleUrl =
        `https://maps.googleapis.com/maps/api/geocode/json` +
        `?latlng=${encodeURIComponent(lat)},${encodeURIComponent(lng)}` +
        `&key=${process.env.GOOGLE_PLACES_API_KEY}`;
      googleData = await fetchJsonWithTimeout(googleUrl);
    } catch {
      console.warn("Google Geocoding request failed");
      googleData = null;
    }
  }

  if (googleData?.status === "OK" && googleData?.results?.length) {
    return res.json(googleData);
  }

  // Nominatim's public instance allows ~1 req/sec — fine for one lookup per
  // repair-tab open, but keep it a fallback only (Google is the primary).
  try {
    const nominatimUrl =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}` +
      `&format=jsonv2&accept-language=en`;
    const nomData = await fetchJsonWithTimeout(nominatimUrl, {
      "User-Agent": "WarrantyVault/1.0 (warranty-tracker demo)"
    });
    if (nomData?.display_name) {
      return res.json({ status: "OK", results: [{ formatted_address: nomData.display_name }] });
    }
  } catch {
    console.warn("Nominatim reverse geocoding failed");
  }

  // Neither source answered: return a sanitized empty result — never Google's
  // raw error payload (which carries error_message) to the client.
  return res.json({ status: "ERROR", results: [] });
});

// Place Details proxy — enriches repair centres with phone numbers, opening
// hours, ratings and the canonical Maps URL.
router.get("/details", async (req, res) => {
  const placeId = String(req.query.place_id || "").trim();
  if (!placeId) {
    return res.status(400).json({ error: "place_id is required" });
  }
  if (!PLACE_ID_RE.test(placeId)) {
    return res.status(400).json({ error: "place_id is invalid" });
  }
  if (!requirePlacesKey(res)) return;

  try {
    const fields =
      "formatted_phone_number,international_phone_number,website,opening_hours,user_ratings_total,rating";
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json` +
      `?place_id=${encodeURIComponent(placeId)}&fields=${encodeURIComponent(fields)}` +
      `&key=${process.env.GOOGLE_PLACES_API_KEY}`;
    const data = await fetchJsonWithTimeout(url);
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(`Places details returned upstream status: ${data.status}`);
      return res.status(502).json({ error: "Unable to load place details." });
    }
    return res.json(data);
  } catch {
    console.warn("Places details upstream request failed");
    return res.status(502).json({ error: "Unable to load place details." });
  }
});

// Serve Google Places store photos without exposing the API key to the
// browser. Redirects to the signed photo URL so <img> tags can load it
// cross-origin without CORS concerns.
router.get("/photo", (req, res) => {
  const reference = String(req.query.reference || "").trim();
  if (!reference) {
    return res.status(400).json({ error: "reference is required" });
  }
  if (!PHOTO_REF_RE.test(reference)) {
    return res.status(400).json({ error: "reference is invalid" });
  }
  if (!requirePlacesKey(res)) return;

  const width = Math.min(800, Math.max(100, Number(req.query.maxwidth) || 400));
  const url =
    `https://maps.googleapis.com/maps/api/place/photo` +
    `?maxwidth=${width}&photo_reference=${encodeURIComponent(reference)}` +
    `&key=${process.env.GOOGLE_PLACES_API_KEY}`;
  return res.redirect(url);
});

module.exports = router;
