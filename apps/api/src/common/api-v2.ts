import type { NextFunction, Request, Response } from "express";

// API v2 = the same handlers behind a cleaner URL design. Nothing here
// duplicates a controller: v2 requests are rewritten to their v1 route before
// routing (so guards, validation, audit and tests all stay single-sourced),
// and the v2 OpenAPI document is derived from the v1 one with the same table.
//
// Design rules of v2 (docs/ROUTES-REDESIGN-AR.md):
//  1. plural, kebab-case nouns; one URL per resource
//  2. the schedule entry is called what it is: an *appointment*; its dialysis
//     session lives under it (/appointments/{id}/session/...) - v1 called the
//     appointment id "session id"
//  3. "me" and sessions: identity and personal data under /me, login/logout as
//     creating/deleting an auth session
//  4. generic state changes are PATCH .../status, idempotent saves are PUT,
//     domain actions stay explicit POST verbs
//  5. no duplicated meanings: /audit-logs is the searchable list
// Every v1 endpoint not listed here keeps its path in v2.

export const V1_PREFIX = "/api/v1";
export const V2_PREFIX = "/api/v2";

// Only successful JSON responses are enveloped. Errors and binary/streamed
// downloads retain their existing contracts; v1 is never changed.
export function v2Envelope(body: unknown) {
  if (body && typeof body === "object" && "data" in body &&
      Array.isArray(body.data) && "total" in body && typeof body.total === "number") {
    const { data, ...meta } = body;
    return { data, meta };
  }
  return { data: body };
}

// [v2 route, v1 route]. Path parameters are matched by position.
export const ROUTE_PAIRS: [string, string][] = [
  // --- identity: sessions, "me" ---------------------------------------------
  ["POST /auth/sessions", "POST /auth/login"],
  ["DELETE /auth/sessions/current", "POST /auth/logout"],
  ["GET /me", "GET /auth/me"],
  ["PUT /me/password", "POST /auth/change-password"],
  ["GET /me/shift-report-status", "GET /auth/shift-report-status"],
  ["PUT /me/pin", "PATCH /nursing/my-pin"],
  ["GET /me/assignments", "GET /nursing/my-assignments"],
  ["GET /me/staff-entries", "GET /staff-entries/mine"],
  ["POST /pin-verifications", "POST /nursing/verify-pin"],

  // --- patients ---------------------------------------------------------------
  ["GET /patients/by-barcode/{code}", "GET /patients/barcode/{code}"],
  ["PUT /patients/{id}/restriction", "POST /patients/{id}/restrict"],
  ["GET /patients/{id}/audit-log", "GET /audit-logs/patients/{patientId}"],

  // --- appointments (v1: "schedule" + parts of "sessions") --------------------
  ["GET /appointments", "GET /schedule"],
  ["GET /appointments/today", "GET /schedule/today"],
  ["POST /appointments/extra", "POST /sessions/extra"],
  ["POST /appointments/emergency", "POST /sessions/emergency"],
  ["GET /appointments/scan/{barcode}", "GET /reception/scan/{barcode}"],
  ["POST /appointments/{id}/reschedule", "POST /schedule/{id}/reschedule"],
  ["POST /appointments/{id}/check-in", "POST /sessions/{id}/check-in"],
  ["GET /appointments/{id}/cost", "GET /inventory/schedules/{scheduleId}/cost"],

  // --- the dialysis session of an appointment ---------------------------------
  ["GET /appointments/{id}/session", "GET /sessions/{id}"],
  ["PUT /appointments/{id}/session/pre-dialysis", "POST /sessions/{id}/pre-dialysis"],
  ["POST /appointments/{id}/session/supplies-ready", "POST /sessions/{id}/confirm-supplies-ready"],
  ["POST /appointments/{id}/session/machine", "POST /sessions/{id}/assign-machine"],
  ["PUT /appointments/{id}/session/machine", "POST /sessions/{id}/reassign-machine"],
  ["POST /appointments/{id}/session/start", "POST /sessions/{id}/start"],
  ["POST /appointments/{id}/session/end", "POST /sessions/{id}/end"],
  ["POST /appointments/{id}/session/discharge", "POST /sessions/{id}/discharge"],
  ["POST /appointments/{id}/session/interrupt", "POST /sessions/{id}/interrupt"],
  ["POST /appointments/{id}/session/resume", "POST /sessions/{id}/resume"],
  ["GET /appointments/{id}/session/readings", "GET /sessions/{id}/readings"],
  ["POST /appointments/{id}/session/readings", "POST /sessions/{id}/readings"],
  ["POST /appointments/{id}/session/readings/{readingId}/amendments", "POST /sessions/{id}/readings/{readingId}/amend"],
  ["GET /appointments/{id}/session/events", "GET /sessions/{id}/events"],
  ["POST /appointments/{id}/session/events", "POST /sessions/{id}/events"],
  ["GET /appointments/{id}/session/supplies", "GET /sessions/{id}/supplies"],
  ["POST /appointments/{id}/session/supplies/issues", "POST /sessions/{id}/supplies/confirm-issue"],
  ["PATCH /appointments/{id}/session/supplies/override", "PATCH /sessions/{id}/supplies/override"],
  ["POST /appointments/{id}/session/supplies/substitutions", "POST /sessions/{id}/supplies/substitute"],

  // --- machines ---------------------------------------------------------------
  ["PATCH /machines/{id}/status", "POST /machines/{id}/status"],
  ["GET /machine-approvals", "GET /approvals"],
  ["POST /machine-approvals", "POST /approvals/machine-usage"],
  ["POST /machine-approvals/expiry-sweep", "POST /approvals/expire-stale"],
  ["PATCH /machine-approvals/{id}", "POST /approvals/{id}/decision"],

  // --- maintenance ------------------------------------------------------------
  ["GET /maintenance-tickets", "GET /maintenance/tickets"],
  ["POST /maintenance-tickets", "POST /maintenance/tickets"],
  ["GET /maintenance-tickets/assignees", "GET /maintenance/staff"],
  ["GET /maintenance-tickets/{id}", "GET /maintenance/tickets/{id}"],
  ["GET /maintenance-tickets/{id}/attachment", "GET /maintenance/tickets/{id}/attachment"],
  ["POST /maintenance-tickets/{id}/assign", "POST /maintenance/tickets/{id}/assign"],
  ["PATCH /maintenance-tickets/{id}/status", "POST /maintenance/tickets/{id}/status"],
  ["POST /maintenance-tickets/{id}/cancel", "POST /maintenance/tickets/{id}/cancel"],
  ["POST /maintenance-tickets/{id}/close", "POST /maintenance/tickets/{id}/close"],

  // --- nursing ----------------------------------------------------------------
  ["GET /nursing-assignments", "GET /nursing/assignments"],
  ["POST /nursing-assignments", "POST /nursing/assignments"],
  ["GET /nursing-assignments/nurses", "GET /nursing/nurses"],

  // --- laboratory -------------------------------------------------------------
  ["PATCH /lab/order-items/{id}/status", "POST /lab/order-items/{id}/status"],
  ["POST /lab/order-items/{id}/results/amendments", "POST /lab/order-items/{id}/amend-result"],

  // --- audit ------------------------------------------------------------------
  ["GET /audit-logs", "GET /audit-logs/search"],
  ["GET /audit-logs/feed", "GET /audit-logs"],
];

type Parsed = { method: string; segments: string[]; params: number };
const parse = (route: string): Parsed => {
  const [method, path] = route.split(" ");
  const segments = path.split("/").filter(Boolean);
  return { method, segments, params: segments.filter((s) => s.startsWith("{")).length };
};

interface Entry { v2: Parsed; v1: Parsed; v2Path: string; v1Path: string }
const ENTRIES: Entry[] = ROUTE_PAIRS.map(([v2, v1]) => {
  const entry = { v2: parse(v2), v1: parse(v1), v2Path: v2.split(" ")[1], v1Path: v1.split(" ")[1] };
  if (entry.v2.params !== entry.v1.params) throw new Error(`Route pair parameter mismatch: ${v2} <-> ${v1}`);
  return entry;
});
// Static segments beat parameters (e.g. /appointments/today before /appointments/{id}/...).
const bySpecificity = (a: Entry, b: Entry, side: "v1" | "v2") =>
  a[side].params - b[side].params || b[side].segments.length - a[side].segments.length;
const V2_ORDER = [...ENTRIES].sort((a, b) => bySpecificity(a, b, "v2"));
const V1_ORDER = [...ENTRIES].sort((a, b) => bySpecificity(a, b, "v1"));

function match(template: Parsed, method: string, path: string): string[] | null {
  if (template.method !== method) return null;
  const parts = path.split("/").filter(Boolean);
  if (parts.length !== template.segments.length) return null;
  const params: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const want = template.segments[i];
    if (want.startsWith("{")) params.push(parts[i]);
    else if (want !== parts[i]) return null;
  }
  return params;
}

const fill = (path: string, params: string[]) => {
  let index = 0;
  return path.replace(/\{[^}]+\}/g, () => params[index++]);
};

export type V2Resolution =
  | { kind: "route"; method: string; path: string }
  | { kind: "renamed"; use: string };

// Where does a request made to /api/v2{path} really go?
export function resolveV2(method: string, path: string): V2Resolution {
  for (const entry of V2_ORDER) {
    const params = match(entry.v2, method, path);
    if (params) return { kind: "route", method: entry.v1.method, path: fill(entry.v1Path, params) };
  }
  // A path that only exists in its old v1 spelling must not silently work in v2.
  for (const entry of V1_ORDER) {
    const params = match(entry.v1, method, path);
    if (params) return { kind: "renamed", use: `${entry.v2.method} ${V2_PREFIX}${fill(entry.v2Path, params)}` };
  }
  return { kind: "route", method, path };
}

// For a request made to the old v1 spelling: what replaces it?
export function v2Successor(method: string, path: string): string | null {
  for (const entry of V1_ORDER) {
    const params = match(entry.v1, method, path);
    if (params) return `${entry.v2.method} ${V2_PREFIX}${fill(entry.v2Path, params)}`;
  }
  return null;
}

export function apiVersioning() {
  return (req: Request, res: Response, next: NextFunction) => {
    const [pathname, ...rest] = req.url.split("?");
    const query = rest.length ? `?${rest.join("?")}` : "";

    if (pathname === V2_PREFIX || pathname.startsWith(`${V2_PREFIX}/`)) {
      // The v2 Swagger UI is served as-is by its own route.
      if (pathname.startsWith(`${V2_PREFIX}/docs`)) return next();
      const json = res.json.bind(res);
      res.json = ((body: unknown) => json(
        res.statusCode >= 200 && res.statusCode < 300 ? v2Envelope(body) : body,
      )) as Response["json"];
      const resolved = resolveV2(req.method, pathname.slice(V2_PREFIX.length));
      if (resolved.kind === "renamed") {
        return res.status(404).json({ statusCode: 404, message: `Not found in v2 - use ${resolved.use}` });
      }
      // A v1 POST handler answers 201; once it is spelled PATCH/PUT/DELETE in v2
      // the honest status for "updated an existing resource" is 200.
      if (resolved.method === "POST" && req.method !== "POST") {
        const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => Response;
        res.writeHead = ((code: number, ...args: unknown[]) => writeHead(code === 201 ? 200 : code, ...args)) as never;
      }
      req.url = `${V1_PREFIX}${resolved.path}${query}`;
      req.method = resolved.method;
      res.setHeader("X-API-Version", "2");
      return next();
    }

    if (pathname.startsWith(`${V1_PREFIX}/`)) {
      const successor = v2Successor(req.method, pathname.slice(V1_PREFIX.length));
      if (successor) {
        // RFC 8594-style hint; v1 keeps working.
        res.setHeader("Deprecation", "true");
        res.setHeader("X-Successor-Route", successor);
      }
    }
    next();
  };
}

// --- OpenAPI ------------------------------------------------------------------

const shape = (path: string) => path.replace(/\{[^}]+\}/g, "{}");

type Operation = { parameters?: { name: string; in: string }[]; operationId?: string; [key: string]: unknown };
type Doc = { info: Record<string, unknown>; paths: Record<string, Record<string, Operation>>; [key: string]: unknown };

// Derives the v2 document from the v1 one: same operations, new paths/methods,
// path parameters renamed to the new template, and a pointer back to v1.
export function buildV2Document<T extends Doc>(v1: T): T {
  const paths: Doc["paths"] = {};
  for (const [fullPath, operations] of Object.entries(v1.paths)) {
    const v1Path = fullPath.replace(V1_PREFIX, "");
    for (const [method, operation] of Object.entries(operations)) {
      const entry = ENTRIES.find((e) => e.v1.method === method.toUpperCase() && shape(e.v1Path) === shape(v1Path));
      const targetPath = entry ? entry.v2Path : v1Path;
      const targetMethod = entry ? entry.v2.method.toLowerCase() : method;

      const names = [...targetPath.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      let index = 0;
      const parameters = operation.parameters?.map((p) => (p.in === "path" ? { ...p, name: names[index++] ?? p.name } : p));
      const moved: Operation = {
        ...operation,
        ...(parameters ? { parameters } : {}),
        ...(operation.operationId ? { operationId: `${operation.operationId}V2` } : {}),
        "x-v1-equivalent": `${method.toUpperCase()} ${fullPath}`,
      };
      const responses = operation.responses as Record<string, Record<string, any>> | undefined;
      if (responses) {
        moved.responses = Object.fromEntries(Object.entries(responses).map(([status, response]) => {
          const code = status === "201" && method === "post" && targetMethod !== "post" ? "200" : status;
          if (!/^2\d\d$/.test(code) || code === "204" || /\/(attachment|export)$/.test(targetPath)) return [code, response];
          const content = response.content ?? {};
          const json = content["application/json"] ?? {};
          return [code, { ...response, content: { ...content, "application/json": {
            ...json,
            schema: {
              type: "object", required: ["data"],
              properties: {
                data: json.schema ?? {},
                meta: { type: "object", additionalProperties: true, description: "Pagination and collection metadata (total, page, limit, aggregates) when provided by the resource." },
              },
            },
          } } }];
        }));
      }
      (paths[`${V2_PREFIX}${targetPath}`] ??= {})[targetMethod] = moved;
    }
  }
  return { ...v1, info: { ...v1.info, title: "DCMS API v2", version: "2.0",
    description: `${v1.info.description ?? ""}\nSuccessful JSON responses use { data, meta? }. Paged collections place rows in data and pagination/aggregates in meta. Errors, empty responses and file downloads are unchanged.`,
  }, paths };
}
