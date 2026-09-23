function trimValue(value?: string | null) {
  return value?.trim() ?? "";
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function stripApiSuffix(value: string) {
  return value.replace(/\/api$/, "");
}

function readBrowserApiBase() {
  if (typeof window === "undefined") return "";
  return "/backend-api";
}

function readBackendOrigin() {
  const explicitBackendUrl = trimValue(process.env.NEXT_PUBLIC_BACKEND_URL);
  if (explicitBackendUrl) return stripTrailingSlash(explicitBackendUrl);

  const legacyApiUrl = trimValue(process.env.NEXT_PUBLIC_API_URL);
  if (legacyApiUrl) return stripApiSuffix(stripTrailingSlash(legacyApiUrl));

  return "";
}

export const BACKEND_ORIGIN = readBackendOrigin();
export const API_BASE_URL =
  readBrowserApiBase() || `${BACKEND_ORIGIN}/api`;
export const PUBLIC_API_PROXY_BASE = `${API_BASE_URL}/public`;
export const CUSTOMER_API_PROXY_BASE = `${API_BASE_URL}/customer`;

export function buildBackendUrl(path = "") {
  if (!path) return BACKEND_ORIGIN;
  if (/^https?:\/\//i.test(path)) return path;
  return `${BACKEND_ORIGIN}/${path.replace(/^\/+/, "")}`;
}

export function buildApiUrl(path = "") {
  if (!path) return API_BASE_URL;
  return `${API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}

