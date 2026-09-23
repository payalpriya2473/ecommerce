// lib/asset-url.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single resolver for every uploaded file the admin shows (product images,
// category images, brand icons, logos, photos).
//
// The backend now stores/returns host-free paths ("/uploads/<folder>/<file>").
// Older rows may still hold absolute URLs built from the backend's BASE_URL
// (e.g. "http://localhost:5001/uploads/..."), which the browser cannot load on
// the live server. Both are re-based onto the backend origin this admin already
// talks to (NEXT_PUBLIC_API_URL without its trailing "/api"), so an image
// works wherever the API works.
//
// Optional override: NEXT_PUBLIC_ASSET_URL (e.g. a CDN / asset host).
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api"

export const ASSET_ORIGIN = (
  process.env.NEXT_PUBLIC_ASSET_URL ||
  // strip ONLY a trailing "/api" (a plain .replace("/api", "") breaks hosts like https://api.example.com)
  API_URL.replace(/\/+$/, "").replace(/\/api$/, "")
).replace(/\/+$/, "")

export function resolveAssetUrl(url?: string | null): string {
  if (!url) return ""
  const value = String(url).trim().replace(/\\/g, "/")
  if (!value) return ""
  if (value.startsWith("data:") || value.startsWith("blob:")) return value

  const uploadsIdx = value.indexOf("/uploads/")
  if (uploadsIdx >= 0) return `${ASSET_ORIGIN}${value.slice(uploadsIdx)}`
  if (value.startsWith("uploads/")) return `${ASSET_ORIGIN}/${value}`

  if (/^https?:\/\//i.test(value)) return value
  return `${ASSET_ORIGIN}${value.startsWith("/") ? value : `/${value}`}`
}

export default resolveAssetUrl
