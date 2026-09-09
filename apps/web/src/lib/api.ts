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
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(options.headers);
  // A FormData body (file upload) needs the browser to set its own
  // multipart/form-data boundary - forcing application/json here would
  // corrupt the request (Phase 12: fault-report attachments).
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(body.message ?? "Request failed", response.status);
  }

  return response.json();
}

// For a binary response (Phase 12: fault-report attachment image) - an
// <img> tag can't attach an Authorization header itself, so the caller
// fetches the blob here and points the tag at an object URL instead.
export async function apiFetchBlob(path: string): Promise<Blob> {
  const token = getToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { headers });
  if (!response.ok) {
    throw new ApiError(response.statusText || "Request failed", response.status);
  }
  return response.blob();
}
