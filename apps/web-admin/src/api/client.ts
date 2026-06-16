import { tokenStore } from "./tokenStore";
import { ApiError, type Tokens } from "./types";

// Empty default base => same-origin relative URLs, which the Vite dev proxy
// (and the backend serving the built SPA in prod) forwards to /v1/*. Set
// VITE_API_BASE to point at a backend on another origin.
const BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

// Listeners notified when the session becomes invalid (refresh failed) so the
// React layer can redirect to /login.
type Listener = () => void;
const onLogout = new Set<Listener>();
export function subscribeLogout(fn: Listener): () => void {
  onLogout.add(fn);
  return () => onLogout.delete(fn);
}
function emitLogout() {
  tokenStore.clear();
  onLogout.forEach((fn) => fn());
}

interface RequestOpts {
  method?: string;
  body?: unknown;
  auth?: boolean; // default true
  query?: Record<string, string | number | undefined>;
  // internal: prevents infinite refresh loops
  _retried?: boolean;
}

function buildUrl(path: string, query?: RequestOpts["query"]): string {
  let url = BASE + path;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  return url;
}

// Single-flight refresh: concurrent 401s share one refresh request.
let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refresh_token = tokenStore.getRefresh();
  if (!refresh_token) return false;
  try {
    const res = await fetch(buildUrl("/v1/auth/refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) return false;
    const tokens = (await res.json()) as Tokens;
    tokenStore.updateTokens(tokens);
    return true;
  } catch {
    return false;
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function parseBody(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return await res.text();
}

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    for (const key of ["error", "message", "detail"]) {
      if (typeof b[key] === "string") return b[key] as string;
    }
  }
  if (typeof body === "string" && body.trim()) return body;
  return fallback;
}

export async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true, query } = opts;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const tok = tokenStore.getAccess();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Auto-refresh on 401, then retry the original request exactly once.
  if (res.status === 401 && auth && !opts._retried) {
    const ok = await refreshOnce();
    if (ok) {
      return request<T>(path, { ...opts, _retried: true });
    }
    emitLogout();
    throw new ApiError(401, "Session expired. Please sign in again.", null);
  }

  if (!res.ok) {
    const errBody = await parseBody(res);
    throw new ApiError(res.status, errorMessage(errBody, `Request failed (${res.status})`), errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await parseBody(res)) as T;
}

// Auth-gated image fetch: pulls bytes with the Bearer header and returns an
// object URL the caller can use as an <img src> (and must revoke later).
export async function fetchImageObjectUrl(clientUuid: string): Promise<string> {
  const tok = tokenStore.getAccess();
  const res = await fetch(buildUrl(`/v1/screenshots/${clientUuid}`), {
    headers: tok ? { Authorization: `Bearer ${tok}` } : {},
  });
  if (res.status === 401) {
    const ok = await refreshOnce();
    if (ok) return fetchImageObjectUrl(clientUuid);
    emitLogout();
    throw new ApiError(401, "Session expired.", null);
  }
  if (!res.ok) throw new ApiError(res.status, `Image failed (${res.status})`, null);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
