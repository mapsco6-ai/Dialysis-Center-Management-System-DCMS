/**
 * Synthetic UI smoke-test fixtures. Every identity, clinical value and stock
 * figure below is invented. No database, environment secrets, external API,
 * proxy, or persistent storage is accessed. Restarting resets the fixtures.
 *
 * Usage: node scripts/ui-preview-api.mjs
 * Web preview: NEXT_PUBLIC_API_URL=http://127.0.0.1:3101/api/v1, port 3100.
 * Demo login: fixture / fixture. Optional port: UI_PREVIEW_API_PORT=3101.
 * These responses support visual checks; they do not verify real API behavior.
 */
import { createServer } from "node:http";
import { Server as SocketServer } from "socket.io";
import shared from "../packages/shared/index.js";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("ts-node").register({ transpileOnly: true, compilerOptions: { module: "CommonJS", moduleResolution: "Node" } });
const { resolveV2, v2Envelope } = require("../apps/api/src/common/api-v2.ts");

const port = Number(process.env.UI_PREVIEW_API_PORT ?? 3101);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("UI_PREVIEW_API_PORT must be an integer from 1024 to 65535");
}
const origins = ["http://localhost:3100", "http://127.0.0.1:3100"];
const token = "dcms-synthetic-ui-fixture-only";
const committeeToken = "dcms-synthetic-committee-only";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baghdad" }).format(new Date());
const timestamp = "2026-09-11T06:00:00.000Z";
const user = {
  id: "fixture-user", username: "fixture", fullName: "Alex Morgan (Demo)",
  roles: ["SUPER_ADMIN"], permissions: shared.PERMISSIONS.map(({ key }) => key), landingPath: "/admin", mustChangePassword: false,
};
const committeeUser = { id: "fixture-committee", username: "committee", fullName: "Health Authority Committee (Demo)", roles: ["AUDITOR"], permissions: ["oversight.view"], landingPath: "/admin/governance/oversight", mustChangePassword: false };
const oversightSummary = () => {
  const day = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
  const days = [6, 5, 4, 3, 2, 1, 0].map(day);
  const tally = (pairs) => pairs.map(([key, count]) => ({ key, count }));
  return {
    range: { from: timestamp, to: timestamp },
    kpis: { activePatients: 120, sessions: 84, completedSessions: 76, interruptedSessions: 3, incidents: 5, openIncidents: 2, criticalLabResults: 4, machines: 20, machinesAvailable: 14, complaints: 2 },
    charts: {
      sessionsByDay: days.map((d, i) => ({ day: d, count: 8 + i })), interruptedByDay: days.map((d, i) => ({ day: d, count: i % 3 })),
      incidentsByDay: [], activityByDay: days.map((d, i) => ({ day: d, count: 30 + i * 4 })),
      sessionsByStatus: tally([["COMPLETED", 70], ["IN_DIALYSIS", 9], ["INTERRUPTED", 3]]), patientsByStatus: tally([["ACTIVE", 110], ["ON_HOLD", 4]]),
      incidentsByType: tally([["INFECTION", 2], ["MACHINE_INCIDENT", 3]]), incidentsBySeverity: tally([["HIGH", 2], ["LOW", 3]]), incidentsByStatus: tally([["OPEN", 2], ["CLOSED", 3]]),
      machinesByStatus: tally([["AVAILABLE", 14], ["MAINTENANCE", 3], ["OUT_OF_SERVICE", 3]]), ticketsByStatus: tally([["OPEN", 2]]), ticketsBySeverity: tally([["HIGH", 1]]),
      labItemsByStatus: tally([["FINAL", 40], ["PROCESSING", 5]]), prescriptionsByStatus: tally([["DISPENSED", 30]]), transfersByStatus: tally([["RECEIVED", 6]]),
      entriesByType: tally([["SHIFT_REPORT", 12], ["COMPLAINT", 2]]), complaintsBySource: tally([["PATIENT", 2]]), complaintsByStatus: tally([["SUBMITTED", 1], ["RESOLVED", 1]]),
      activityByRole: tally([["NURSE", 120]]), staffByRole: tally([["NURSE", 12], ["DOCTOR", 4]]),
    },
  };
};
const wards = [
  { id: "fixture-ward-1", name: "North ward (Demo)" },
  { id: "fixture-ward-2", name: "South ward (Demo)" },
];
const shifts = [
  ["07:00", "11:00", "11:00", "11:30"],
  ["11:30", "15:30", "15:30", "16:00"],
  ["16:00", "20:00", "20:00", "20:30"],
  ["20:30", "00:30", "00:30", "01:00"],
].map(([dialysisStart, dialysisEnd, cleaningStart, cleaningEnd], index) => ({
  id: `fixture-shift-${index + 1}`, name: `SHIFT_${index + 1}`,
  dialysisStart, dialysisEnd, cleaningStart, cleaningEnd,
  nominalCapacity: 12, reservedCapacity: 2, lateThresholdMinutes: 20,
}));
const machines = ["AVAILABLE", "IN_USE", "IN_USE", "CLEANING", "AVAILABLE", "IN_USE", "MAINTENANCE", "EMERGENCY_RESERVED"].map((status, index) => ({
  id: `fixture-machine-${index + 1}`, machineCode: `DEMO-${String(index + 1).padStart(2, "0")}`,
  wardId: wards[index < 4 ? 0 : 1].id, ward: wards[index < 4 ? 0 : 1],
  serialNumber: `SYNTHETIC-${index + 1}`, manufacturer: "Demo equipment", model: "Preview model",
  status, isProtected: false, isEmergencyDedicated: index === 7,
}));
const names = ["Avery Morgan", "Jordan Reed", "Casey Taylor", "Riley Parker", "Cameron Ellis", "Quinn Brooks", "Morgan Blake", "Drew Carter"];
function makePatient(index, values = {}) {
  return {
    id: `fixture-patient-${index}`, patientCode: `DEMO-${String(index).padStart(4, "0")}`,
    barcode: `FIXTURE${String(index).padStart(4, "0")}`, fullName: `${names[index - 1] ?? "New patient"} (Demo)`,
    gender: index % 2 ? "FEMALE" : "MALE", dateOfBirth: `${1965 + index}-04-12T00:00:00.000Z`,
    phone: `000-000-${String(index).padStart(4, "0")}`, address: "Synthetic address — UI preview only",
    fileNumber: `DEMO-FILE-${index}`, registeredAt: timestamp, status: "ACTIVE",
    dialysisStartDate: "2025-01-15T00:00:00.000Z", dryWeight: String(60 + index),
    vascularAccessType: "FISTULA", vascularAccessLocation: "Demo entry",
    diagnoses: "Synthetic record for interface verification", chronicDiseases: [], allergies: null,
    medicalNotes: "Invented fixture; not a clinical record.", specialInstructions: null,
    alerts: [], ...values,
  };
}
const patients = names.map((_, index) => makePatient(index + 1));
const items = [
  { id: "fixture-item-1", name: "Dialyzer (Demo)", category: "Dialyzer", unit: "piece", barcode: "FIXTURE-ITEM-1", minimumStock: "20", cost: "18.50", requiresBatchTracking: true, quantityInStock: "145" },
  { id: "fixture-item-2", name: "Tubing set (Demo)", category: "Supplies", unit: "set", barcode: "FIXTURE-ITEM-2", minimumStock: "30", cost: "7.25", requiresBatchTracking: false, quantityInStock: "18" },
];
const locations = ["MAIN_WAREHOUSE", "PHARMACY", "LABORATORY_STOCK", "WARD_STOCK"].map((type, index) => ({ id: `fixture-location-${index + 1}`, type, name: "Demo location" }));
function schedule(date) {
  return patients.slice(0, 8).map((patient, index) => ({
    id: `fixture-schedule-${index + 1}`, patientId: patient.id, patient,
    scheduledDate: `${date}T00:00:00.000Z`, shiftId: shifts[index < 4 ? 0 : 1].id,
    shift: shifts[index < 4 ? 0 : 1], status: ["SCHEDULED", "ARRIVED", "ARRIVED", "LATE", "SCHEDULED", "ARRIVED", "ABSENT", "SCHEDULED"][index],
    type: "REGULAR", extraReason: null, emergencySourceHospital: null, emergencyReason: null,
    checkInTime: index === 1 || index === 2 || index === 5 ? `${date}T04:00:00.000Z` : null,
    checkInStationId: null, lateMinutes: index === 3 ? 12 : null, absentMarkedAt: null,
    machineId: machines[index].status === "IN_USE" ? machines[index].id : null,
  }));
}
function machineSummary(rows) {
  return rows.reduce((result, { status }) => ({ ...result, [status]: (result[status] ?? 0) + 1 }), {});
}
function send(response, status, body) {
  if (response.apiV2 && status >= 200 && status < 300) body = v2Envelope(body);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-DCMS-Fixture": "synthetic-only" });
  response.end(JSON.stringify(body));
}
async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > 64 * 1024) throw new Error("Fixture payload exceeds 64 KiB");
  }
  return body ? JSON.parse(body) : {};
}
const emptyCollections = new Set([
  "/approvals", "/nursing/assignments", "/nursing/my-assignments", "/doctor-orders",
  "/lab/queue", "/lab/tests", "/lab/panels", "/lab/orders", "/pharmacy/queue",
  "/maintenance/tickets", "/inventory/transfers", "/incidents", "/audit",
]);

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (origin && !origins.includes(origin)) return send(response, 403, { message: "Only the local preview origin is supported" });
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }

  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  response.apiV2 = /^\/api\/v2(?:\/|$)/.test(url.pathname);
  let path = url.pathname.replace(/^\/api\/v[12](?=\/|$)/, "") || "/";
  if (response.apiV2) {
    const resolved = resolveV2(request.method, path);
    if (resolved.kind === "renamed") return send(response, 404, { message: resolved.use });
    path = resolved.path;
    request.method = resolved.method;
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get("date") ?? "") ? url.searchParams.get("date") : today();
  try {
    if (path === "/health" && request.method === "GET") return send(response, 200, { status: "ok", fixture: true });
    if (path === "/auth/login" && request.method === "POST") {
      const body = await readJson(request);
      const account = body.username === "fixture" && body.password === "fixture" ? { accessToken: token, user }
        : body.username === "committee" && body.password === "committee" ? { accessToken: committeeToken, user: committeeUser } : null;
      if (!account) return send(response, 401, { message: "Demo credentials are fixture / fixture" });
      // Like the real API: the session is an HttpOnly cookie.
      response.setHeader("Set-Cookie", `dcms_token=${account.accessToken}; HttpOnly; Path=/; SameSite=Lax`);
      return send(response, 200, account);
    }
    const presented = request.headers.authorization?.replace(/^Bearer /, "") ?? /(?:^|; )dcms_token=([^;]*)/.exec(request.headers.cookie ?? "")?.[1];
    if (presented !== token && presented !== committeeToken) return send(response, 401, { message: "Sign in with the synthetic fixture account" });
    const me = presented === committeeToken ? committeeUser : user;
    if (path === "/auth/logout" && request.method === "POST") {
      response.setHeader("Set-Cookie", "dcms_token=; HttpOnly; Path=/; Max-Age=0");
      return send(response, 200, { success: true });
    }

    if (path === "/patients" && request.method === "POST") {
      const body = await readJson(request);
      if (!body.fullName || !body.gender || !body.dateOfBirth) return send(response, 400, { message: "Full name, sex and date of birth are required" });
      // Only this synthetic in-memory record is changed; never persisted.
      const fields = ["fullName", "gender", "dateOfBirth", "phone", "address", "fileNumber", "dialysisStartDate", "dryWeight", "vascularAccessType", "vascularAccessLocation", "diagnoses", "chronicDiseases", "allergies", "medicalNotes", "specialInstructions"];
      const values = Object.fromEntries(fields.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
      const patient = makePatient(patients.length + 1, values);
      patients.unshift(patient);
      return send(response, 201, patient);
    }
    if (path === "/notifications/read-all" || /^\/notifications\/[^/]+\/read$/.test(path)) return send(response, 200, { success: true });
    if (path.startsWith("/settings/") && request.method === "PUT") return send(response, 200, { key: path.slice(10), value: (await readJson(request)).value });
    if (/^\/schedule\/[^/]+\/reschedule$/.test(path) && request.method === "POST") return send(response, 201, { from: path.split("/")[2], to: { id: "fixture-schedule-new" } });
    if (request.method !== "GET") return send(response, 404, { message: "This action is not implemented by the UI fixture server" });
    if (path === "/auth/me") return send(response, 200, me);
    if (path === "/notifications" && request.method === "GET") return send(response, 200, { total: 1, unread: 1, data: [{ id: "fixture-note-1", type: "COMPLAINT_FILED", title: "Long wait (Demo)", body: "Synthetic complaint", link: "/admin/people/entries", readAt: null, createdAt: timestamp }] });
    if (path === "/me/work-queue") return send(response, 200, { items: [{ key: "prescriptionsToDispense", count: 3, link: "/admin/care/pharmacy" }, { key: "entriesToReview", count: 2, link: "/admin/people/entries" }] });
    if (path === "/settings/public") return send(response, 200, { shiftReportRequired: false });
    if (path === "/settings" && request.method === "GET") return send(response, 200, [{ key: "shiftReportRequired", value: false, description: "x" }, { key: "auditRetentionYears", value: 10, description: "y" }]);
    if (path === "/audit-logs/verify") return send(response, 200, { ok: true, checked: 42 });
    if (path === "/audit-logs/retention") return send(response, 200, { retentionYears: 10, total: 42, olderThanCutoff: 0, oldestAt: timestamp });
    if (path === "/permissions/grouped") return send(response, 200, [{ module: "patients", permissions: [{ key: "patient.view", description: "View patients" }, { key: "patient.edit", description: "Edit patients" }] }]);
    if (path === "/flow/today") {
      const step = (current, attention = null) => ["arrival", "pre", "supplies", "machine", "dialysis", "discharge"].map((key, i, all) => ({ key, state: key === current ? "current" : i < all.indexOf(current) ? "done" : "todo" }));
      const item = (n, patient, current, action, allowed, extra = {}) => ({ appointmentId: `fixture-schedule-${n}`, patient: { id: patient.id, patientCode: patient.patientCode, fullName: patient.fullName }, shift: { id: "fixture-shift-1", name: "SHIFT_1" }, type: "REGULAR", scheduleStatus: "ARRIVED", lateMinutes: null, sessionStatus: null, machineCode: null, steps: step(current), current, attention: null, nextAction: { key: action, permission: "x", allowed }, minutesInStep: 12 + n, ...extra });
      const items = [
        item(1, patients[0], "dialysis", "resume-dialysis", true, { attention: "INTERRUPTED", sessionStatus: "INTERRUPTED", machineCode: "DEMO-02", minutesInStep: 31 }),
        item(2, patients[1], "supplies", "confirm-supplies", false, { sessionStatus: "PRE_DIALYSIS" }),
        item(3, patients[2], "arrival", "check-in", true, { scheduleStatus: "SCHEDULED" }),
      ];
      return send(response, 200, { generatedAt: timestamp, total: 3, needsAttention: 1, byStep: { dialysis: 1, supplies: 1, arrival: 1 }, items });
    }
    if (path === "/oversight/summary") return send(response, 200, oversightSummary());
    if (path === "/oversight/timeline") return send(response, 200, { total: 2, modules: [{ key: "dialysis", count: 1 }, { key: "lab", count: 1 }], data: [
      { id: "tl-1", performedAt: timestamp, type: "DIALYSIS_STARTED", sourceModule: "dialysis", patientCode: "P-000001", performedBy: "Sam Rivera (Demo)", payload: { machine: "M-01" } },
      { id: "tl-2", performedAt: timestamp, type: "LAB_RESULT_FINAL", sourceModule: "lab", patientCode: "P-000002", performedBy: null, payload: null }] });
    if (path === "/wards") return send(response, 200, wards);
    if (path === "/machines") return send(response, 200, machines);
    if (path === "/shifts") return send(response, 200, shifts);
    if (path === "/schedule") return send(response, 200, schedule(date));
    if (path === "/inventory/items") return send(response, 200, items);
    if (path === "/inventory/locations") return send(response, 200, locations);
    if (path === "/nursing/nurses" || path === "/maintenance/staff") return send(response, 200, [user]);
    if (path === "/inventory/alerts/low-stock") return send(response, 200, [{ itemId: items[1].id, itemName: items[1].name, available: 18, minimumStock: 30, level: "LOW" }]);
    if (path === "/inventory/alerts/expiring") return send(response, 200, { expired: [], expiringSoon: [], withinDays: 30 });

    if (path === "/dashboard/live-center") return send(response, 200, { date, shiftId: null, scheduled: 8, arrived: 3, late: 1, absent: 1, cancelled: 0, emergency: 0, waiting: 1, inDialysis: 3, completed: 0 });
    if (path === "/dashboard/machines") return send(response, 200, { totalMachines: machines.length, availableForRegularAssignment: 2, protectedCount: 0, emergencyDedicatedCount: 1, byStatus: machineSummary(machines), utilizationPercent: 37.5 });
    if (path === "/dashboard/wards") return send(response, 200, wards.map((ward) => ({ ...ward, byStatus: machineSummary(machines.filter((machine) => machine.wardId === ward.id)) })));
    if (path === "/dashboard/inventory-alerts") return send(response, 200, { lowStockCount: 1, criticalStockCount: 0, expiringSoonCount: 0, expiredCount: 0 });
    if (path === "/dashboard/pending-work") return send(response, 200, { labPending: 0, pharmacyPending: 0 });
    if (path === "/dashboard/session-cost") return send(response, 200, { date, scheduleCount: 8, consumablesCost: 206, medicationCost: 44, labConsumablesCost: 18, totalCost: 268 });

    if (path === "/patients" || path === "/patients/search") {
      const query = (url.searchParams.get("q") ?? "").toLowerCase();
      const matches = patients.filter((patient) => [patient.fullName, patient.patientCode, patient.fileNumber, patient.phone].some((value) => value?.toLowerCase().includes(query)));
      const page = Number(url.searchParams.get("page") ?? 1);
      const requestedLimit = Number(url.searchParams.get("limit") ?? 50);
      if (!Number.isInteger(page) || page < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) return send(response, 400, { message: "Page and limit must be positive integers" });
      const limit = Math.min(requestedLimit, 100);
      // GET /patients pages as { data, total }; /patients/search stays a bare array (matches PatientsService).
      const pageRows = matches.slice((page - 1) * limit, page * limit);
      return send(response, 200, path === "/patients" ? { data: pageRows, total: matches.length } : pageRows);
    }
    const barcodeMatch = path.match(/^\/(?:patients\/barcode|reception\/scan)\/([^/]+)$/);
    if (barcodeMatch) {
      const patient = patients.find((entry) => entry.barcode === decodeURIComponent(barcodeMatch[1]));
      return patient ? send(response, 200, path.startsWith("/reception") ? { patient, todaySchedules: schedule(date).filter((entry) => entry.patientId === patient.id) } : patient) : send(response, 404, { message: "Synthetic patient not found" });
    }
    const patientMatch = path.match(/^\/patients\/([^/]+)(?:\/([^/]+))?$/);
    if (patientMatch) {
      const patient = patients.find((entry) => entry.id === patientMatch[1]);
      if (!patient) return send(response, 404, { message: "Synthetic patient not found" });
      if (!patientMatch[2]) return send(response, 200, patient);
      if (patientMatch[2] === "timeline") return send(response, 200, [{ id: `fixture-event-${patient.id}`, patientId: patient.id, type: "PATIENT_CREATED", payload: { fixture: true }, performedById: user.id, performedBy: user, performedAt: timestamp, sourceModule: "patients" }]);
      if (patientMatch[2] === "dialysis-plan") return send(response, 200, ["MON", "WED", "FRI"].map((weekday) => ({ id: `fixture-plan-${patient.id}-${weekday}`, patientId: patient.id, weekday, shiftId: shifts[0].id, shift: shifts[0], isActive: true, effectiveFrom: timestamp, effectiveTo: null })));
      if (patientMatch[2] === "supply-profile") return send(response, 200, [{ id: `fixture-profile-${patient.id}`, patientId: patient.id, itemId: items[0].id, item: items[0], defaultQuantity: "1" }]);
      if (["alerts", "prescriptions", "clinical-notes", "medication-history"].includes(patientMatch[2])) return send(response, 200, []);
    }
    const wardMatch = path.match(/^\/wards\/([^/]+)\/dashboard$/);
    if (wardMatch) {
      const ward = wards.find((entry) => entry.id === wardMatch[1]);
      if (!ward) return send(response, 404, { message: "Synthetic ward not found" });
      return send(response, 200, { ward, date, machines: machines.filter((machine) => machine.wardId === ward.id).map((machine) => ({ ...machine, session: machine.status === "IN_USE" ? { id: `fixture-session-${machine.id}`, status: "IN_DIALYSIS", patientId: patients[0].id, patient: patients[0], nurseId: user.id, nurse: user, startTime: `${date}T04:00:00.000Z`, lastReadingAt: null, minutesSinceLastReading: null, openAlertsCount: 0, openAlerts: [], recentEvents: [], activeDoctorOrders: [] } : null })) });
    }
    if (/^\/quality\/clinical-audit\/[^/]+$/.test(path)) return send(response, 200, { rows: [] });
    if (emptyCollections.has(path) || /^\/inventory\/items\/[^/]+\/batches$/.test(path) || /^\/machines\/[^/]+\/timeline$/.test(path)) return send(response, 200, []);
    if (path === "/users") return send(response, 200, { total: 1, data: [{ id: "fixture-staff-1", username: "nurse.demo", fullName: "Sam Rivera (Demo)", isActive: true, lastLoginAt: timestamp, employeeNo: "E-100", jobTitle: "Staff nurse", department: null, expiresAt: null, roles: ["NURSE"] }] });
    if (path === "/users/fixture-staff-1") return send(response, 200, { roles: ["NURSE"], permissions: ["entry.create", "nursing.ward.view"] });
    if (path === "/roles") return send(response, 200, shared.ROLES.map((name) => ({ id: name, name, permissions: [] })));
    if (path === "/audit-logs/search") return send(response, 200, { total: 1, data: [{ id: "fixture-audit-1", createdAt: timestamp, actorRole: "NURSE", action: "PATIENT_VIEWED", entityType: "Patient", entityId: "fixture-patient-1", patientId: "fixture-patient-1", reason: null, actor: { id: "fixture-staff-1", fullName: "Sam Rivera (Demo)", username: "nurse.demo" } }] });
    if (path === "/staff-entries/mine" || path === "/staff-entries") return send(response, 200, { total: 1, data: [{ id: "fixture-entry-1", type: "PROBLEM", title: "Bay 3 chair (Demo)", body: "Synthetic entry", severity: "LOW", status: "SUBMITTED", isConfidential: false, response: null, entryDate: timestamp, patientId: null, escalatedIncidentId: null, author: { fullName: "Sam Rivera (Demo)" } }] });
    return send(response, 404, { message: "Endpoint not implemented by the synthetic UI fixture server" });
  } catch {
    return send(response, 400, { message: "Invalid synthetic fixture request" });
  }
});

// Idle synthetic socket prevents transport errors on the overview page. There
// are no live clinical events and no connection to the real API gateway.
const sockets = new SocketServer(server, { cors: { origin: origins } });
sockets.use((socket, next) => next(socket.handshake.auth.token === token ? undefined : new Error("Fixture authentication required")));
server.listen(port, "127.0.0.1", () => {
  console.log(`Synthetic UI fixture API: http://127.0.0.1:${port}/api/v1`);
  console.log("Demo login: fixture / fixture. In-memory invented data only.");
});
function shutdown() { sockets.close(); }
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
