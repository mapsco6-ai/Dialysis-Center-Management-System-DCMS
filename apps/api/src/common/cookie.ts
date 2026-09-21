export const TOKEN_COOKIE = "dcms_token";

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

// Comma-separated list in CORS_ORIGINS; the defaults are the local web dev
// servers only. Never "*": the cookie login needs explicit origins.
export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}
