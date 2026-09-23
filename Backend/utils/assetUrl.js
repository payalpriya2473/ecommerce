// utils/assetUrl.js
// ─────────────────────────────────────────────────────────────────────────────
// One place that decides how uploaded files (product images, category images,
// brand icons, …) are stored in the DB and returned by the API.
//
// Why: image URLs used to be built as `${process.env.BASE_URL}/uploads/...`.
// Whenever BASE_URL pointed at a host the browser cannot reach (e.g.
// http://localhost:5001, a wrong port, or plain http on an https site), uploads
// succeeded but the images never displayed. Admin forms could also send those
// absolute URLs back and save them.
//
// Rule now:
//   • DB stores a canonical, host-free path:   /uploads/<folder>/<file>
//   • API returns that same root-relative path (plus ASSET_BASE_URL if you
//     explicitly configure a CDN/asset host). Each frontend resolves it to a
//     URL its own users can reach (website: same-origin /uploads proxy,
//     admin: the backend URL it already talks to).
//   • Legacy values (absolute URLs from any host, "uploads\\x.jpg", paths with
//     the /motabhai_next_backend prefix) are normalised on the way out, so old
//     rows display correctly without a DB migration.
// ─────────────────────────────────────────────────────────────────────────────

const ASSET_BASE_URL = (process.env.ASSET_BASE_URL || "").trim().replace(/\/+$/, "");

/**
 * Normalise any stored/incoming image reference to "/uploads/…".
 * Returns the input unchanged if it is an external (non-upload) URL.
 */
export function toStoredAssetPath(value) {
  if (value == null) return null;
  let v = String(value).trim();
  if (!v) return null;
  if (v.startsWith("data:")) return v;

  v = v.replace(/\\/g, "/"); // Windows separators from multer .path

  const idx = v.indexOf("/uploads/");
  if (idx >= 0) return v.slice(idx).split(/[?#]/)[0];
  if (v.startsWith("uploads/")) return `/${v}`.split(/[?#]/)[0];

  // Not an upload (e.g. an external CDN URL) — keep as is.
  return v;
}

/** Value to send to clients for an image stored in the DB. */
export function toAssetUrl(value) {
  const p = toStoredAssetPath(value);
  if (!p) return null;
  if (p.startsWith("/uploads/")) return ASSET_BASE_URL ? `${ASSET_BASE_URL}${p}` : p;
  return p;
}

export default toAssetUrl;

/**
 * Absolute file-system path of an uploaded file (for deleting old images).
 * Uploads are written relative to the process working directory
 * (multer destinations are "uploads/<folder>"), so resolve the same way.
 */
export function assetFilePath(value) {
  const p = toStoredAssetPath(value);
  if (!p || !p.startsWith("/uploads/") || p.includes("..")) return null;
  return `${process.cwd().replace(/\/+$/, "")}${p}`;
}
