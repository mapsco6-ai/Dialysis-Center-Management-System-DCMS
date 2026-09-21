export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api/v1";

export const TOKEN_COOKIE = "dcms_token";

export function getToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setToken(token: string) {
  const maxAgeSeconds = 8 * 60 * 60;
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

export function clearToken() {
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0`;
}

// Carries the HTTP status so callers can tell "not authenticated" (401) apart
// from "forbidden" (403), "not found" (404), or a real server/network fault -
// collapsing all of those into one generic failure state misleads the user
// (docs review DCMS-021).
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Tracks in-flight apiFetch/apiFetchBlob calls so a single global loading
// indicator (GlobalLoader) can react without every page wiring its own
// spinner state or a state-management library being pulled in.
type PendingListener = () => void;
let pendingRequestCount = 0;
const pendingListeners = new Set<PendingListener>();

export function subscribePendingRequests(listener: PendingListener) {
  pendingListeners.add(listener);
  return () => pendingListeners.delete(listener);
}

export function getPendingRequestCount() {
  return pendingRequestCount;
}

function beginRequest() {
  pendingRequestCount++;
  pendingListeners.forEach((listener) => listener());
}

function endRequest() {
  pendingRequestCount--;
  pendingListeners.forEach((listener) => listener());
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  beginRequest();
  try {
    const token = getToken();
    const headers = new Headers(options.headers);
    // A FormData body (file upload) needs the browser to set its own
    // multipart/form-data boundary - forcing application/json here would
    // corrupt the request (Phase 12: fault-report attachments).
    if (!(options.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    // The session lives in an HttpOnly cookie set by the API; a Bearer token
    // is only used when one was stored by an older login.
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" });

    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiError(body.message ?? "Request failed", response.status, body.code);
    }

    return response.json();
  } finally {
    endRequest();
  }
}

// For a binary response (Phase 12: fault-report attachment image) - an
// <img> tag can't attach an Authorization header itself, so the caller
// fetches the blob here and points the tag at an object URL instead.
export async function apiFetchBlob(path: string): Promise<Blob> {
  beginRequest();
  try {
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${API_URL}${path}`, { headers, credentials: "include" });
    if (!response.ok) {
      throw new ApiError(response.statusText || "Request failed", response.status);
    }
    return response.blob();
  } finally {
    endRequest();
  }
}
