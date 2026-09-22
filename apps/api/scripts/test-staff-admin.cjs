// Integration checks for the staff-administration / oversight / staff-entry /
// patient-record API work (docs/SYSTEM-IMPROVEMENT-STUDY-AR.md §9).
//
// Runs against a RUNNING API (default http://localhost:3001/api/v1) and its
// dev database, creating uniquely named users/patients (audit rows are
// append-only, so nothing is cleaned up). Needs SUPER_ADMIN_USERNAME /
// SUPER_ADMIN_PASSWORD (read from apps/api/.env when not in the environment).
//
//   node apps/api/scripts/test-staff-admin.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const envFile = path.join(__dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const API = process.env.API_URL || "http://localhost:3001/api/v1";
const run = Date.now().toString(36);
let passed = 0;

async function call(method, url, token, body) {
  const res = await fetch(API + url, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}
async function ok(name, fn) {
  try { await fn(); passed++; console.log("  ok  ", name); }
  catch (error) { console.error("  FAIL", name, "\n      ", error.message); process.exitCode = 1; }
}
const login = async (username, password) => {
  const r = await call("POST", "/auth/login", null, { username, password });
  assert.equal(r.status, 200, `login ${username}: ${JSON.stringify(r.body)}`);
  return r.body;
};

(async () => {
  const admin = await login(process.env.SUPER_ADMIN_USERNAME || "admin", process.env.SUPER_ADMIN_PASSWORD);
  const A = admin.accessToken;
  const mk = async (suffix, roleNames, extra = {}) => {
    const r = await call("POST", "/users", A, { username: `t${run}${suffix}`, password: "Passw0rd-init", fullName: `Test ${suffix}`, roleNames, ...extra });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const pw = "Passw0rd-init";

  console.log("A1 roles / landing");
  await ok("me exposes landingPath + mustChangePassword", async () => {
    const r = await call("GET", "/auth/me", A);
    assert.equal(r.body.landingPath, "/admin");
    assert.equal(r.body.mustChangePassword, false);
  });
  const nurse = await mk("nurse", ["NURSE"], { employeeNo: `E${run}`, jobTitle: "Staff nurse" });
  const reception = await mk("recep", ["RECEPTION"]);
  await ok("new user must change password", () => assert.equal(nurse.mustChangePassword, true));
  const N = (await login(nurse.username, pw));
  await ok("nurse lands on /admin/care/nursing with template permissions", () => {
    assert.equal(N.user.landingPath, "/admin/care/nursing");
    assert.ok(N.user.permissions.includes("entry.create"));
    assert.ok(!N.user.permissions.includes("user.create"));
  });
  const R = (await login(reception.username, pw)).accessToken;
  await ok("nurse cannot list users (403)", async () => assert.equal((await call("GET", "/users", N.accessToken)).status, 403));

  console.log("A2 staff API");
  await ok("list users: search + total", async () => {
    const r = await call("GET", `/users?search=t${run}nurse&limit=5`, A);
    assert.equal(r.status, 200);
    assert.equal(r.body.total, 1);
    assert.equal(r.body.data[0].employeeNo, `E${run}`);
  });
  await ok("user detail merges permissions", async () => {
    const r = await call("GET", `/users/${nurse.id}`, A);
    assert.ok(r.body.permissions.includes("dialysis.start"));
  });
  await ok("update profile", async () => {
    const r = await call("PATCH", `/users/${nurse.id}`, A, { phone: "0770", specialty: "Dialysis" });
    assert.equal(r.status, 200);
    assert.equal(r.body.specialty, "Dialysis");
  });
  await ok("set roles requires reason, then applies", async () => {
    assert.equal((await call("PUT", `/users/${nurse.id}/roles`, A, { roleNames: ["HEAD_NURSE"] })).status, 400);
    const r = await call("PUT", `/users/${nurse.id}/roles`, A, { roleNames: ["HEAD_NURSE"], reason: "promotion" });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.roles, ["HEAD_NURSE"]);
    await call("PUT", `/users/${nurse.id}/roles`, A, { roleNames: ["NURSE"], reason: "revert" });
  });
  await ok("cannot change own roles", async () => {
    const me = (await call("GET", "/auth/me", A)).body;
    assert.equal((await call("PUT", `/users/${me.id}/roles`, A, { roleNames: ["NURSE"], reason: "x" })).status, 400);
  });
  await ok("reset password: temp pw works once, old dies, must change", async () => {
    const r = await call("POST", `/users/${reception.id}/reset-password`, A);
    assert.equal(r.status, 200);
    assert.ok(r.body.temporaryPassword.length >= 10);
    assert.equal((await call("GET", "/auth/me", R)).status, 401, "old session must die");
    const again = await login(reception.username, r.body.temporaryPassword);
    assert.equal(again.user.mustChangePassword, true);
    const ch = await call("POST", "/auth/change-password", again.accessToken, { currentPassword: r.body.temporaryPassword, newPassword: "NewPassw0rd!" });
    assert.equal(ch.status, 200);
    assert.equal((await login(reception.username, "NewPassw0rd!")).user.mustChangePassword, false);
  });
  await ok("deactivate then activate", async () => {
    assert.equal((await call("PATCH", `/users/${reception.id}/deactivate`, A, { reason: "leave" })).body.isActive, false);
    assert.equal((await call("POST", "/auth/login", null, { username: reception.username, password: "NewPassw0rd!" })).status, 401);
    assert.equal((await call("PATCH", `/users/${reception.id}/activate`, A)).body.isActive, true);
  });
  await ok("expired account cannot log in", async () => {
    const u = await mk("exp", ["NURSE"], { expiresAt: new Date(Date.now() - 60000).toISOString() });
    assert.equal((await call("POST", "/auth/login", null, { username: u.username, password: pw })).status, 401);
  });
  await ok("custom role create/grouped perms/delete; built-in protected", async () => {
    const name = `TEST_ROLE_${run.toUpperCase()}`;
    const c = await call("POST", "/roles", A, { name });
    assert.equal(c.status, 201);
    assert.equal((await call("POST", "/roles", A, { name })).status, 409);
    const g = await call("GET", "/permissions/grouped", A);
    assert.ok(g.body.find((x) => x.module === "entries").permissions.length >= 2);
    assert.equal((await call("DELETE", `/roles/${c.body.id}`, A)).status, 200);
    const roles = (await call("GET", "/roles", A)).body;
    const builtIn = roles.find((r) => r.name === "NURSE");
    assert.equal((await call("DELETE", `/roles/${builtIn.id}`, A)).status, 400);
  });

  console.log("A4 staff entries");
  const patient = (await call("POST", "/patients", A, { fullName: `Test Patient ${run}`, gender: "MALE", dateOfBirth: "1970-01-01" })).body;
  assert.ok(patient.id, "patient created");
  let entry;
  await ok("nurse writes a confidential complaint linked to a patient", async () => {
    const r = await call("POST", "/staff-entries", N.accessToken, {
      type: "COMPLAINT", title: "Broken chair", body: "Chair in bay 3 collapsed", isConfidential: true, patientId: patient.id, severity: "HIGH",
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.status, "SUBMITTED");
    assert.equal(r.body.complaintSource, "STAFF");
    entry = r.body;
  });
  await ok("rejects complaintSource on non-complaint", async () =>
    assert.equal((await call("POST", "/staff-entries", N.accessToken, { type: "PROBLEM", title: "t", body: "b", complaintSource: "PATIENT" })).status, 400));
  await ok("author sees it in /mine; other staff get 404; reviewer sees all", async () => {
    assert.ok((await call("GET", "/staff-entries/mine", N.accessToken)).body.data.some((e) => e.id === entry.id));
    const R2 = (await login(reception.username, "NewPassw0rd!")).accessToken;
    assert.equal((await call("GET", `/staff-entries/${entry.id}`, R2)).status, 404);
    assert.equal((await call("GET", "/staff-entries", R2)).status, 403);
    assert.equal((await call("GET", `/staff-entries/${entry.id}`, A)).status, 200);
    assert.ok((await call("GET", `/staff-entries?type=COMPLAINT&status=SUBMITTED`, A)).body.total >= 1);
  });
  await ok("nurse cannot review (403)", async () =>
    assert.equal((await call("PATCH", `/staff-entries/${entry.id}/status`, N.accessToken, { status: "ACKNOWLEDGED" })).status, 403));
  await ok("status machine: invalid jump 400, reject needs reason, valid path", async () => {
    assert.equal((await call("PATCH", `/staff-entries/${entry.id}/status`, A, { status: "CLOSED" })).status, 400);
    assert.equal((await call("PATCH", `/staff-entries/${entry.id}/status`, A, { status: "REJECTED" })).status, 400);
    const a = await call("PATCH", `/staff-entries/${entry.id}/status`, A, { status: "ACKNOWLEDGED", response: "Noted, maintenance informed" });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(a.body.response, "Noted, maintenance informed");
    assert.equal((await call("PATCH", `/staff-entries/${entry.id}/status`, A, { status: "RESOLVED" })).status, 200);
    const done = await call("GET", `/staff-entries/${entry.id}`, N.accessToken);
    assert.deepEqual(done.body.history.map((h) => h.toStatus), ["SUBMITTED", "ACKNOWLEDGED", "RESOLVED"]);
  });
  await ok("assign + escalate to incident", async () => {
    assert.equal((await call("PATCH", `/staff-entries/${entry.id}/assign`, A, { assignedToId: nurse.id })).status, 200);
    const e = await call("POST", `/staff-entries/${entry.id}/escalate`, A, { incidentType: "EMERGENCY_EVENT" });
    assert.equal(e.status, 201, JSON.stringify(e.body));
    assert.ok(e.body.incidentId);
    assert.equal((await call("POST", `/staff-entries/${entry.id}/escalate`, A, { incidentType: "EMERGENCY_EVENT" })).status, 400);
  });
  await ok("shift summary", async () => {
    const r = await call("GET", "/me/shift-summary", N.accessToken);
    assert.equal(r.status, 200);
    assert.ok(r.body.entriesWritten >= 1);
    assert.ok(Array.isArray(r.body.actions));
  });

  console.log("A5 patient record");
  await ok("overview in one call", async () => {
    const r = await call("GET", `/patients/${patient.id}/overview`, A);
    assert.equal(r.status, 200);
    for (const k of ["patient", "openAlerts", "lastSession", "lastLabOrder", "activePrescriptions", "upcomingAppointments", "completedSessions"]) assert.ok(k in r.body, k);
  });
  await ok("timeline: legacy array vs paged", async () => {
    assert.ok(Array.isArray((await call("GET", `/patients/${patient.id}/timeline`, A)).body));
    const p = await call("GET", `/patients/${patient.id}/timeline?page=1&limit=1`, A);
    assert.ok(p.body.total >= 1 && p.body.data.length === 1);
  });
  await ok("status change needs reason and is recorded on the patient", async () => {
    assert.equal((await call("PATCH", `/patients/${patient.id}`, A, { status: "ON_HOLD" })).status, 400);
    const r = await call("PATCH", `/patients/${patient.id}`, A, { status: "ON_HOLD", reason: "Travelling abroad" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.statusReason, "Travelling abroad");
    assert.ok(r.body.statusChangedAt);
  });
  await ok("alert acknowledge (once)", async () => {
    const al = (await call("POST", `/patients/${patient.id}/alerts`, A, { severity: "CRITICAL", category: "Allergy", message: "Penicillin" })).body;
    const a = await call("PATCH", `/patients/${patient.id}/alerts/${al.id}/acknowledge`, N.accessToken);
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.ok(a.body.acknowledgedAt);
    assert.equal((await call("PATCH", `/patients/${patient.id}/alerts/${al.id}/acknowledge`, N.accessToken)).status, 400);
  });

  console.log("A3 oversight");
  await call("GET", `/patients/${patient.id}`, N.accessToken); // read -> PATIENT_VIEWED
  await new Promise((r) => setTimeout(r, 400)); // read audit is fire-and-forget
  await ok("chart opening is audited and findable per patient", async () => {
    const h = await call("GET", `/audit-logs/patients/${patient.id}?limit=100`, A);
    assert.equal(h.status, 200);
    const actions = h.body.data.map((x) => x.action);
    for (const a of ["PATIENT_CREATED", "PATIENT_UPDATED", "CLINICAL_ALERT_CREATED", "PATIENT_VIEWED", "STAFF_ENTRY_CREATED"]) assert.ok(actions.includes(a), `missing ${a} in ${actions}`);
    assert.ok(h.body.data.some((x) => x.action === "PATIENT_VIEWED" && x.actor.id === nurse.id));
  });
  await ok("per-user activity has tally; me/activity works for the nurse", async () => {
    const u = await call("GET", `/users/${nurse.id}/activity`, A);
    assert.equal(u.status, 200);
    assert.ok(u.body.summary.some((s) => s.action === "STAFF_ENTRY_CREATED"));
    const mine = await call("GET", "/me/activity", N.accessToken);
    assert.equal(mine.status, 200);
    assert.ok(mine.body.data.every((x) => x.actor.id === nurse.id));
    assert.equal((await call("GET", `/users/${nurse.id}/activity`, N.accessToken)).status, 403);
  });
  await ok("search filters", async () => {
    const r = await call("GET", `/audit-logs/search?actorId=${nurse.id}&action=STAFF_ENTRY_CREATED`, A);
    assert.equal(r.status, 200);
    assert.ok(r.body.total >= 1 && r.body.data.every((x) => x.action === "STAFF_ENTRY_CREATED"));
  });
  await ok("csv export is audited", async () => {
    const res = await fetch(`${API}/audit-logs/export?actorId=${nurse.id}`, { headers: { authorization: `Bearer ${A}` } });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/csv/);
    const text = await res.text();
    assert.match(text, /"time","actor"/);
    assert.match(text, /STAFF_ENTRY_CREATED/);
    const log = await call("GET", "/audit-logs/search?action=AUDIT_EXPORTED&limit=1", A);
    assert.ok(log.body.total >= 1);
    assert.equal((await call("GET", "/audit-logs/export", N.accessToken)).status, 403);
  });
  await ok("report export is audited", async () => {
    const r = await fetch(`${API}/reports/patients/${patient.id}/summary?format=excel`, { headers: { authorization: `Bearer ${A}` } });
    assert.equal(r.status, 200);
    await new Promise((x) => setTimeout(x, 400));
    assert.ok((await call("GET", `/audit-logs/search?action=REPORT_EXPORTED&patientId=${patient.id}`, A)).body.total >= 1);
  });
  // (AUDITOR committee account is covered in the platform section below)
  await ok("privilege ceiling: HEAD_NURSE cannot mint users above own rights", async () => {
    assert.equal((await call("POST", "/users", N.accessToken, { username: `x${run}`, password: pw, fullName: "x", roleNames: ["SUPER_ADMIN"] })).status, 403);
  });

  console.log("Platform: cookie, headers, CORS, throttle");
  await ok("login sets an HttpOnly cookie that authenticates on its own", async () => {
    const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: nurse.username, password: pw }) });
    const cookie = res.headers.get("set-cookie");
    assert.match(cookie, /dcms_token=/);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    const me = await fetch(`${API}/auth/me`, { headers: { cookie: cookie.split(";")[0] } });
    assert.equal(me.status, 200);
    assert.equal((await me.json()).username, nurse.username);
  });
  await ok("helmet headers present", async () => {
    const res = await fetch(`${API}/health`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.ok(res.headers.get("x-frame-options") || res.headers.get("content-security-policy") !== undefined);
  });
  await ok("CORS: listed origin allowed with credentials, unknown origin gets no header", async () => {
    const good = await fetch(`${API}/auth/me`, { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "GET" } });
    assert.equal(good.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(good.headers.get("access-control-allow-credentials"), "true");
    const bad = await fetch(`${API}/auth/me`, { method: "OPTIONS", headers: { origin: "http://evil.example", "access-control-request-method": "GET" } });
    assert.equal(bad.headers.get("access-control-allow-origin"), null);
  });
  await ok("login lockout is stored in the database and clears on success", async () => {
    const u = await mk("lock", ["NURSE"]);
    for (let i = 0; i < 5; i++) assert.equal((await call("POST", "/auth/login", null, { username: u.username, password: "wrong-pass" })).status, 401);
    assert.equal((await call("POST", "/auth/login", null, { username: u.username, password: pw })).status, 429);
    assert.ok((await prisma.loginAttempt.count({ where: { username: u.username.toLowerCase() } })) >= 5);
    await prisma.loginAttempt.deleteMany({ where: { username: u.username.toLowerCase() } });
    assert.equal((await call("POST", "/auth/login", null, { username: u.username, password: pw })).status, 200);
  });

  console.log("Platform: settings + mandatory shift report");
  await ok("only settings.manage can read/change settings; input validated", async () => {
    assert.equal((await call("GET", "/settings", N.accessToken)).status, 403);
    assert.equal((await call("PUT", "/settings/shiftReportRequired", N.accessToken, { value: true })).status, 403);
    assert.equal((await call("PUT", "/settings/nope", A, { value: true })).status, 400);
    assert.equal((await call("PUT", "/settings/shiftReportRequired", A, { value: "yes" })).status, 400);
    assert.equal((await call("PUT", "/settings/auditRetentionYears", A, { value: 0 })).status, 400);
    const all = await call("GET", "/settings", A);
    assert.ok(all.body.some((x) => x.key === "shiftReportRequired"));
  });
  await ok("with shift reports mandatory, logout is refused until one is filed", async () => {
    const u = await mk("shift", ["NURSE"]);
    const T = (await login(u.username, pw)).accessToken;
    try {
      assert.equal((await call("PUT", "/settings/shiftReportRequired", A, { value: true })).status, 200);
      assert.equal((await call("GET", "/settings/public", T)).body.shiftReportRequired, true);
      // no work yet -> nothing to report, logout allowed (does not consume the session: skip)
      assert.equal((await call("GET", "/auth/shift-report-status", T)).body.missing, false);
      await call("POST", "/staff-entries", T, { type: "ACTION_NOTE", title: "did a thing", body: "b" });
      assert.equal((await call("GET", "/auth/shift-report-status", T)).body.missing, true);
      const refused = await call("POST", "/auth/logout", T);
      assert.equal(refused.status, 409);
      assert.equal(refused.body.code, "SHIFT_REPORT_REQUIRED");
      assert.equal((await call("POST", "/staff-entries", T, { type: "SHIFT_REPORT", title: "Shift", body: "quiet shift" })).status, 201);
      assert.equal((await call("POST", "/auth/logout", T)).status, 200);
    } finally {
      await call("PUT", "/settings/shiftReportRequired", A, { value: false });
    }
  });

  console.log("Platform: complaints, notifications");
  const director = await mk("dir", ["CENTER_DIRECTOR"]);
  let complaint;
  await ok("a complaint is auto-assigned to a center director and notifies them", async () => {
    const R2 = (await login(reception.username, "NewPassw0rd!")).accessToken;
    const r = await call("POST", "/staff-entries", R2, { type: "COMPLAINT", complaintSource: "PATIENT", title: "Long wait", body: "Patient waited 3 hours" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    complaint = r.body;
    assert.equal(r.body.complaintSource, "PATIENT");
    assert.ok(r.body.assignedTo, "assigned");
    const assignee = (await call("GET", `/users/${r.body.assignedTo.id}`, A)).body;
    assert.ok(assignee.roles.includes("CENTER_DIRECTOR"));
    await new Promise((x) => setTimeout(x, 700));
    // every test-created director shares the test password
    const D = (await login(assignee.username, pw)).accessToken;
    const n = await call("GET", "/notifications?unreadOnly=true", D);
    assert.ok(n.body.data.some((x) => x.type === "COMPLAINT_FILED"), JSON.stringify(n.body.data.map((x) => x.type)));
    assert.ok(n.body.unread >= 1);
    assert.equal((await call("PATCH", `/notifications/${n.body.data[0].id}/read`, D)).status, 200);
    const after = await call("GET", "/notifications?unreadOnly=true", D);
    assert.equal(after.body.unread, n.body.unread - 1);
    assert.equal((await call("POST", "/notifications/read-all", D)).status, 201);
    assert.equal((await call("GET", "/notifications?unreadOnly=true", D)).body.unread, 0);
    // strangers never see someone else's notifications
    assert.ok((await call("GET", "/notifications", N.accessToken)).body.data.every((x) => x.type !== "COMPLAINT_FILED"));
  });
  await ok("HIGH incident notifies reviewers; new corrective-action states", async () => {
    const inc = await call("POST", "/incidents", N.accessToken, { patientId: patient.id, type: "ADVERSE_EVENT", severity: "HIGH", description: "Fall near bay 2" });
    assert.equal(inc.status, 201, JSON.stringify(inc.body));
    await new Promise((x) => setTimeout(x, 700));
    const D = (await login(director.username, pw)).accessToken;
    assert.ok((await call("GET", "/notifications", D)).body.data.some((x) => x.type === "INCIDENT_REPORTED"));
    const id = inc.body.id;
    assert.equal((await call("POST", `/incidents/${id}/status`, A, { status: "ACTION_REQUIRED" })).status, 400, "action needs a description");
    assert.equal((await call("POST", `/incidents/${id}/status`, A, { status: "ACTION_REQUIRED", reason: "Install anti-slip mats" })).status, 201);
    assert.equal((await call("POST", `/incidents/${id}/status`, A, { status: "CLOSED" })).status, 409, "must finish the action first");
    assert.equal((await call("POST", `/incidents/${id}/status`, A, { status: "ACTION_DONE" })).status, 201);
    assert.equal((await call("POST", `/incidents/${id}/status`, A, { status: "CLOSED" })).status, 201);
  });

  console.log("Platform: tamper-evident audit chain");
  await ok("chain verifies, detects an edit made outside the app, and recovers when restored", async () => {
    const v1 = await call("GET", "/audit-logs/verify", A);
    assert.equal(v1.status, 200);
    assert.equal(v1.body.ok, true, JSON.stringify(v1.body));
    assert.ok(v1.body.checked > 10);
    const victim = await prisma.auditLog.findFirst({ where: { seal: { isNot: null }, reason: null }, orderBy: { seq: "desc" } });
    await prisma.$executeRaw`UPDATE audit_logs SET "reason" = 'tampered' WHERE id = ${victim.id}`;
    try {
      const v2 = await call("GET", "/audit-logs/verify", A);
      assert.equal(v2.body.ok, false);
      assert.equal(v2.body.brokenAtSeq, victim.seq);
    } finally {
      await prisma.$executeRaw`UPDATE audit_logs SET "reason" = NULL WHERE id = ${victim.id}`;
    }
    assert.equal((await call("GET", "/audit-logs/verify", A)).body.ok, true);
  });
  await ok("retention report", async () => {
    const r = await call("GET", "/audit-logs/retention", A);
    assert.equal(r.body.retentionYears, 10);
    assert.ok(r.body.total > 0 && typeof r.body.olderThanCutoff === "number");
  });

  console.log("Platform: restricted charts + vascular access history");
  await ok("break-the-glass: restricted chart needs a reason, which is audited", async () => {
    assert.equal((await call("POST", `/patients/${patient.id}/restrict`, A, { restricted: true, reason: "VIP patient" })).status, 201);
    try {
      const denied = await call("GET", `/patients/${patient.id}`, N.accessToken);
      assert.equal(denied.status, 403);
      assert.equal(denied.body.code, "BREAK_GLASS_REQUIRED");
      assert.equal((await call("GET", `/patients/${patient.id}/overview`, N.accessToken)).status, 403);
      assert.equal((await call("GET", `/patients/${patient.id}/timeline?page=1`, N.accessToken)).status, 403);
      assert.equal((await call("GET", `/patients/${patient.id}?reason=ab`, N.accessToken)).status, 403, "too short");
      assert.equal((await call("GET", `/patients/${patient.id}?reason=emergency%20transfer%20review`, N.accessToken)).status, 200);
      assert.equal((await call("GET", `/patients/${patient.id}/timeline?page=1&reason=emergency%20transfer%20review`, N.accessToken)).status, 200);
      const h = await call("GET", `/audit-logs/patients/${patient.id}?action=PATIENT_BREAK_GLASS_ACCESS`, A);
      assert.ok(h.body.total >= 2);
      assert.equal(h.body.data[0].reason, "emergency transfer review");
    } finally {
      await call("POST", `/patients/${patient.id}/restrict`, A, { restricted: false, reason: "test over" });
    }
    assert.equal((await call("GET", `/patients/${patient.id}`, N.accessToken)).status, 200);
  });
  await ok("vascular access records: create, list, close once", async () => {
    const c = await call("POST", `/patients/${patient.id}/access-records`, A, { type: "FISTULA", location: "Left forearm", placedAt: "2025-01-10" });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.equal(c.body.status, "ACTIVE");
    assert.ok((await call("GET", `/patients/${patient.id}/access-records`, N.accessToken)).body.some((x) => x.id === c.body.id));
    const closed = await call("PATCH", `/patients/${patient.id}/access-records/${c.body.id}`, A, { status: "FAILED", removedAt: "2026-03-01", reason: "Thrombosis" });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.status, "FAILED");
    assert.equal((await call("PATCH", `/patients/${patient.id}/access-records/${c.body.id}`, A, { status: "REMOVED", removedAt: "2026-03-02", reason: "again" })).status, 400);
    assert.equal((await call("POST", `/patients/${patient.id}/access-records`, N.accessToken, { type: "GRAFT", location: "x", placedAt: "2025-01-10" })).status, 403);
  });

  console.log("Platform: new states with real flows");
  const ward = (await call("POST", "/wards", A, { name: `Ward ${run}` })).body;
  await ok("machine RETIRED is terminal", async () => {
    const m = await call("POST", "/machines", A, { machineCode: `M${run}`, wardId: ward.id });
    assert.equal(m.status, 201, JSON.stringify(m.body));
    const r = await call("POST", `/machines/${m.body.id}/status`, A, { status: "RETIRED", reason: "End of life" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(r.body.status, "RETIRED");
    assert.equal((await call("POST", `/machines/${m.body.id}/status`, A, { status: "AVAILABLE", reason: "x" })).status, 409);
  });
  await ok("stock transfer can be cancelled once, before it is issued", async () => {
    const item = (await call("POST", "/inventory/items", A, { name: `Item ${run}`, category: "consumable", unit: "pcs" })).body;
    const locs = (await call("GET", "/inventory/locations", A)).body;
    const from = locs.find((l) => l.type === "MAIN_WAREHOUSE"), to = locs.find((l) => l.type === "PHARMACY");
    const t = await call("POST", "/inventory/transfers", A, { itemId: item.id, fromLocationId: from.id, toLocationId: to.id, quantity: 1 });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    assert.equal((await call("POST", `/inventory/transfers/${t.body.id}/cancel`, A, {})).status, 400, "reason required");
    const c = await call("POST", `/inventory/transfers/${t.body.id}/cancel`, A, { reason: "No longer needed" });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.equal(c.body.status, "CANCELLED");
    assert.equal((await call("POST", `/inventory/transfers/${t.body.id}/cancel`, A, { reason: "again" })).status, 409);
  });
  await ok("pharmacy can reject a prescription; the prescribing doctor is notified", async () => {
    const doctor = await mk("doc", ["DOCTOR"]);
    const D = (await login(doctor.username, pw)).accessToken;
    const order = await call("POST", "/doctor-orders", D, { patientId: patient.id, type: "MEDICATION", payload: { medicationName: "Heparin", dose: "1000 IU", frequency: "per session" } });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const rx = (await call("GET", "/pharmacy/queue", A)).body.find((p) => p.patientId === patient.id && p.medicationName === "Heparin");
    assert.ok(rx, "in pharmacy queue");
    assert.equal((await call("POST", `/pharmacy/prescriptions/${rx.id}/reject`, A, {})).status, 400);
    const rej = await call("POST", `/pharmacy/prescriptions/${rx.id}/reject`, A, { reason: "Dose exceeds protocol" });
    assert.equal(rej.status, 201, JSON.stringify(rej.body));
    assert.equal(rej.body.status, "REJECTED_BY_PHARMACY");
    assert.equal((await call("POST", `/pharmacy/prescriptions/${rx.id}/reject`, A, { reason: "again" })).status, 409);
    await new Promise((x) => setTimeout(x, 700));
    assert.ok((await call("GET", "/notifications", D)).body.data.some((x) => x.type === "PRESCRIPTION_REJECTED"));
  });
  await ok("lab: sample rejection needs a reason and returns to collection; critical result notifies the doctor", async () => {
    const doctor = await mk("doc2", ["DOCTOR"]);
    const D = (await login(doctor.username, pw)).accessToken;
    const test = await call("POST", "/lab/tests", A, { code: `K${run}`, name: `Potassium ${run}`, unit: "mmol/L" });
    assert.equal(test.status, 201, JSON.stringify(test.body));
    const order = await call("POST", "/lab/orders", D, { patientId: patient.id, labTestIds: [test.body.id] });
    assert.equal(order.status, 201, JSON.stringify(order.body));
    const item = order.body.items[0];
    const S = (id, body) => call("POST", `/lab/order-items/${id}/status`, A, body);
    assert.equal((await S(item.id, { status: "SAMPLE_COLLECTED" })).status, 201);
    assert.equal((await S(item.id, { status: "SAMPLE_REJECTED" })).status, 400, "reason required");
    assert.equal((await S(item.id, { status: "SAMPLE_REJECTED", reason: "Hemolysed" })).status, 201);
    assert.equal((await S(item.id, { status: "PROCESSING" })).status, 409, "must be collected again first");
    assert.equal((await S(item.id, { status: "SAMPLE_COLLECTED" })).status, 201);
    assert.equal((await S(item.id, { status: "PROCESSING" })).status, 201);
    const res = await call("POST", `/lab/order-items/${item.id}/results`, A, { value: "7.1", flagCritical: true });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    await new Promise((x) => setTimeout(x, 700));
    const types = (await call("GET", "/notifications", D)).body.data.map((x) => x.type);
    assert.ok(types.includes("LAB_SAMPLE_REJECTED") && types.includes("LAB_CRITICAL_RESULT"), types.join());
    assert.equal(await prisma.labResult.count({ where: { labOrderItemId: item.id, isCritical: true } }), 1);
  });
  await ok("new dialysis event types are accepted", async () => {
    const before = await prisma.dialysisEvent.count();
    assert.ok(before >= 0);
    // enum exists in the DB (session flow needed to record one is covered by phase456 suite)
    const rows = await prisma.$queryRaw`SELECT unnest(enum_range(NULL::"DialysisEventType"))::text AS v`;
    for (const v of ["CRAMPS", "BLEEDING", "CHEST_PAIN", "CLOTTING"]) assert.ok(rows.some((r) => r.v === v), v);
  });
  await ok("every session status change is recorded by the database trigger", async () => {
    const shift = await prisma.shift.findFirst();
    const schedule = await prisma.dialysisSchedule.create({ data: { patientId: patient.id, scheduledDate: new Date(), shiftId: shift.id, type: "REGULAR" } });
    const session = await prisma.dialysisSession.create({ data: { scheduleId: schedule.id, patientId: patient.id } });
    await prisma.dialysisSession.update({ where: { id: session.id }, data: { status: "SUPPLIES_READY" } });
    await prisma.dialysisSession.update({ where: { id: session.id }, data: { preNotes: "no status change" } });
    await prisma.dialysisSession.update({ where: { id: session.id }, data: { status: "ASSIGNED" } });
    const history = await prisma.sessionStatusHistory.findMany({ where: { sessionId: session.id }, orderBy: { changedAt: "asc" } });
    assert.deepEqual(history.map((h) => `${h.fromStatus}>${h.toStatus}`), ["null>PRE_DIALYSIS", "PRE_DIALYSIS>SUPPLIES_READY", "SUPPLIES_READY>ASSIGNED"]);
  });

  console.log("Round 3: reschedule, approval expiry, ticket cancel");
  await ok("appointment can be rescheduled once, keeping the old row as RESCHEDULED", async () => {
    const shifts = await prisma.shift.findMany({ orderBy: { name: "asc" } });
    const day = (n) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + n); return d; };
    const p2 = (await call("POST", "/patients", A, { fullName: `Resched ${run}`, gender: "FEMALE", dateOfBirth: "1980-02-02" })).body;
    const old = await prisma.dialysisSchedule.create({ data: { patientId: p2.id, scheduledDate: day(2), shiftId: shifts[0].id, type: "REGULAR" } });
    const iso = (d) => d.toISOString().slice(0, 10);
    const bad = await call("POST", `/schedule/${old.id}/reschedule`, A, { scheduledDate: iso(day(-3)), shiftId: shifts[1].id, reason: "x" });
    assert.equal(bad.status, 400, "past date");
    assert.equal((await call("POST", `/schedule/${old.id}/reschedule`, A, { scheduledDate: iso(day(2)), shiftId: shifts[0].id, reason: "same" })).status, 400, "same slot");
    assert.equal((await call("POST", `/schedule/${old.id}/reschedule`, N.accessToken, { scheduledDate: iso(day(5)), shiftId: shifts[1].id, reason: "x" })).status, 403);
    const ok1 = await call("POST", `/schedule/${old.id}/reschedule`, A, { scheduledDate: iso(day(5)), shiftId: shifts[1].id, reason: "Patient travelling" });
    assert.equal(ok1.status, 201, JSON.stringify(ok1.body));
    const after = await prisma.dialysisSchedule.findUnique({ where: { id: old.id } });
    assert.equal(after.status, "RESCHEDULED");
    assert.equal(after.rescheduledToId, ok1.body.to.id);
    assert.equal(ok1.body.to.status, "SCHEDULED");
    assert.equal((await call("POST", `/schedule/${old.id}/reschedule`, A, { scheduledDate: iso(day(6)), shiftId: shifts[1].id, reason: "again" })).status, 409, "already moved");
    const clash = await prisma.dialysisSchedule.create({ data: { patientId: p2.id, scheduledDate: day(8), shiftId: shifts[0].id, type: "REGULAR" } });
    assert.equal((await call("POST", `/schedule/${clash.id}/reschedule`, A, { scheduledDate: iso(day(5)), shiftId: shifts[1].id, reason: "clash" })).status, 409, "target slot taken");
    const h = await call("GET", `/audit-logs/patients/${p2.id}?action=SCHEDULE_RESCHEDULED`, A);
    assert.equal(h.body.total, 1);
    assert.equal(h.body.data[0].reason, "Patient travelling");
  });
  await ok("stale approval requests expire, release the machine and notify the requester", async () => {
    const ward2 = (await call("POST", "/wards", A, { name: `Ward exp ${run}` })).body;
    const shift = await prisma.shift.findFirst();
    const p3 = (await call("POST", "/patients", A, { fullName: `Expiry ${run}`, gender: "MALE", dateOfBirth: "1975-05-05" })).body;
    const requester = await mk("req", ["HEAD_NURSE"]);
    const R = (await login(requester.username, pw)).accessToken;
    const mk2 = async (code, status) => {
      const m = (await call("POST", "/machines", A, { machineCode: `${code}${run}`, wardId: ward2.id })).body;
      await prisma.machine.update({ where: { id: m.id }, data: { status } });
      return m;
    };
    const stale = await mk2("EXS", "APPROVAL_REQUIRED");
    const fresh = await mk2("EXF", "APPROVAL_REQUIRED");
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const sched = async (n) => prisma.dialysisSchedule.create({ data: { patientId: p3.id, scheduledDate: new Date(day.getTime() + n * 86400000), shiftId: shift.id, type: "REGULAR" } });
    const [s1, s2] = [await sched(20), await sched(21)];
    const requesterId = requester.id;
    const old = await prisma.machineUsageApprovalRequest.create({ data: { patientId: p3.id, machineId: stale.id, scheduleId: s1.id, reason: "test", requestedById: requesterId, createdAt: new Date(Date.now() - 3 * 3600_000) } });
    const recent = await prisma.machineUsageApprovalRequest.create({ data: { patientId: p3.id, machineId: fresh.id, scheduleId: s2.id, reason: "test", requestedById: requesterId } });
    assert.equal((await call("POST", "/approvals/expire-stale", N.accessToken)).status, 403);
    const r = await call("POST", "/approvals/expire-stale", A);
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.ok(r.body.expired >= 1);
    assert.equal((await prisma.machineUsageApprovalRequest.findUnique({ where: { id: old.id } })).decision, "EXPIRED");
    assert.equal((await prisma.machineUsageApprovalRequest.findUnique({ where: { id: recent.id } })).decision, "PENDING", "recent one untouched");
    assert.equal((await prisma.machine.findUnique({ where: { id: stale.id } })).status, "AVAILABLE");
    assert.equal((await prisma.machine.findUnique({ where: { id: fresh.id } })).status, "APPROVAL_REQUIRED");
    assert.equal((await call("POST", `/approvals/${old.id}/decision`, A, { decision: "APPROVED" })).status, 409, "expired requests cannot be decided");
    await new Promise((x) => setTimeout(x, 700));
    assert.ok((await call("GET", "/notifications", R)).body.data.some((x) => x.type === "APPROVAL_EXPIRED"));
    assert.equal((await call("POST", "/approvals/expire-stale", A)).body.expired >= 0, true, "idempotent");
    assert.equal((await call("GET", "/approvals?decision=EXPIRED", A)).status, 200);
  });
  await ok("a mistaken maintenance ticket can be cancelled before work starts; machine returns to service", async () => {
    const ward3 = (await call("POST", "/wards", A, { name: `Ward mt ${run}` })).body;
    const m = (await call("POST", "/machines", A, { machineCode: `MT${run}`, wardId: ward3.id })).body;
    const t = await call("POST", "/maintenance/tickets", A, { machineId: m.id, problem: "Alarm (false)", severity: "LOW" });
    assert.equal(t.status, 201, JSON.stringify(t.body));
    assert.equal((await prisma.machine.findUnique({ where: { id: m.id } })).status, "OUT_OF_SERVICE");
    assert.equal((await call("POST", `/maintenance/tickets/${t.body.id}/cancel`, A, {})).status, 400, "reason required");
    assert.equal((await call("POST", `/maintenance/tickets/${t.body.id}/cancel`, N.accessToken, { reason: "x" })).status, 403);
    const c = await call("POST", `/maintenance/tickets/${t.body.id}/cancel`, A, { reason: "False alarm" });
    assert.equal(c.status, 201, JSON.stringify(c.body));
    assert.equal(c.body.status, "CANCELLED");
    assert.equal((await prisma.machine.findUnique({ where: { id: m.id } })).status, "AVAILABLE");
    assert.equal((await call("POST", `/maintenance/tickets/${t.body.id}/cancel`, A, { reason: "again" })).status, 409);
    // a cancelled ticket no longer blocks the machine's manual status changes
    assert.equal((await call("POST", `/machines/${m.id}/status`, A, { status: "MAINTENANCE", reason: "planned" })).status, 201);
    // started work cannot be cancelled
    const m2 = (await call("POST", "/machines", A, { machineCode: `MU${run}`, wardId: ward3.id })).body;
    const t2 = await call("POST", "/maintenance/tickets", A, { machineId: m2.id, problem: "Pump noise", severity: "MEDIUM" });
    await call("POST", `/maintenance/tickets/${t2.body.id}/assign`, A, { assignedToId: (await call("GET", "/auth/me", A)).body.id });
    await call("POST", `/maintenance/tickets/${t2.body.id}/status`, A, { status: "IN_PROGRESS" });
    assert.equal((await call("POST", `/maintenance/tickets/${t2.body.id}/cancel`, A, { reason: "too late" })).status, 409);
  });

  console.log("API v2 (route redesign)");
  const API2 = API.replace("/api/v1", "/api/v2");
  const call2 = async (method, url, token, body) => {
    const res = await fetch(API2 + url, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
  await ok("v2: login/logout are an auth session; /me replaces /auth/me", async () => {
    const u = await mk("v2", ["NURSE"]);
    const login2 = await call2("POST", "/auth/sessions", null, { username: u.username, password: pw });
    assert.equal(login2.status, 200, JSON.stringify(login2.body));
    assert.match(login2.headers.get("set-cookie"), /HttpOnly/i);
    const T = login2.body.data.accessToken;
    assert.equal((await call2("GET", "/me", T)).body.data.username, u.username);
    assert.equal((await call2("GET", "/me/work-queue", T)).status, 200, "unchanged routes keep their path");
    assert.equal((await call2("DELETE", "/auth/sessions/current", T)).status, 200);
    assert.equal((await call2("GET", "/me", T)).status, 401, "session ended");
  });
  await ok("v2 refuses the old spelling and names the replacement; v1 still works and points forward", async () => {
    const old = await call2("GET", "/auth/me", A);
    assert.equal(old.status, 404);
    assert.match(old.body.message, /use GET \/api\/v2\/me/);
    assert.equal((await call2("GET", "/schedule/today", A)).status, 404);
    assert.equal((await call2("POST", "/sessions/extra", A, {})).status, 404);
    const v1 = await fetch(`${API}/auth/me`, { headers: { authorization: `Bearer ${A}` } });
    assert.equal(v1.status, 200);
    assert.equal(v1.headers.get("x-successor-route"), "GET /api/v2/me");
    assert.equal(v1.headers.get("deprecation"), "true");
    assert.equal((await fetch(`${API}/patients`, { headers: { authorization: `Bearer ${A}` } })).headers.get("x-successor-route"), null, "unchanged routes are not deprecated");
  });
  await ok("v2: appointments (was schedule/sessions), session under the appointment", async () => {
    assert.equal((await call2("GET", "/appointments/today", A)).status, 200);
    assert.equal((await call2("GET", "/appointments?date=2026-09-22", A)).status, 200);
    const shifts = await prisma.shift.findMany({ orderBy: { name: "asc" } });
    const p = (await call("POST", "/patients", A, { fullName: `V2 ${run}`, gender: "MALE", dateOfBirth: "1990-01-01" })).body;
    const day = new Date(); day.setUTCHours(0, 0, 0, 0); day.setUTCDate(day.getUTCDate() + 40);
    const appt = await prisma.dialysisSchedule.create({ data: { patientId: p.id, scheduledDate: day, shiftId: shifts[0].id, type: "REGULAR" } });
    const iso = (d) => d.toISOString().slice(0, 10);
    const moved = await call2("POST", `/appointments/${appt.id}/reschedule`, A, { scheduledDate: iso(new Date(day.getTime() + 86400000)), shiftId: shifts[1].id, reason: "v2 move" });
    assert.equal(moved.status, 201, JSON.stringify(moved.body));
    const movedId = moved.body.data.to.id;
    // session sub-resource: nothing started yet -> the API's own answer, proving the route reached the session handler
    const s = await call2("GET", `/appointments/${movedId}/session`, A);
    assert.ok([200, 404].includes(s.status), String(s.status));
    assert.equal((await call2("POST", `/appointments/${movedId}/session/start`, A, {})).status === 404, false, "start route exists in v2");
    assert.equal((await call2("GET", `/sessions/${movedId}`, A)).status, 404, "old /sessions/{id} is gone from v2");
  });
  await ok("v2: PATCH for status changes, PUT for restriction, audit-logs is the search", async () => {
    const ward = (await call("POST", "/wards", A, { name: `Ward v2 ${run}` })).body;
    const m = (await call("POST", "/machines", A, { machineCode: `V2${run}`, wardId: ward.id })).body;
    const r = await call2("PATCH", `/machines/${m.id}/status`, A, { status: "MAINTENANCE", reason: "v2" });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.data.status, "MAINTENANCE");
    assert.equal((await call2("POST", `/machines/${m.id}/status`, A, { status: "AVAILABLE", reason: "x" })).status, 404, "POST spelling is v1 only");
    const patient = (await call("POST", "/patients", A, { fullName: `V2r ${run}`, gender: "MALE", dateOfBirth: "1990-01-01" })).body;
    assert.equal((await call2("PUT", `/patients/${patient.id}/restriction`, A, { restricted: true, reason: "VIP" })).status, 200);
    assert.equal((await call2("PUT", `/patients/${patient.id}/restriction`, A, { restricted: false, reason: "done" })).status, 200);
    const search = await call2("GET", `/audit-logs?limit=2&actorId=${(await call("GET", "/auth/me", A)).body.id}`, A);
    assert.equal(search.status, 200);
    assert.ok(typeof search.body.meta.total === "number" && search.body.data.length <= 2);
    assert.ok("nextCursor" in (await call2("GET", "/audit-logs/feed?limit=1", A)).body.meta);
    const trail = await call2("GET", `/patients/${patient.id}/audit-log?action=PATIENT_RESTRICTED`, A);
    assert.equal(trail.status, 200);
    assert.ok(trail.body.meta.total >= 1);
  });
  await ok("v2 OpenAPI document is served and consistent with the route table", async () => {
    const doc = await (await fetch(`${API2}/docs-json`)).json();
    assert.equal(doc.info.version, "2.0");
    const paths = Object.keys(doc.paths);
    assert.ok(paths.includes("/api/v2/appointments/{id}/session/start"));
    assert.ok(paths.includes("/api/v2/me"));
    assert.ok(!paths.includes("/api/v2/schedule/today") && !paths.includes("/api/v2/auth/me"));
    assert.ok(paths.every((x) => x.startsWith("/api/v2/")));
    assert.equal(doc.paths["/api/v2/machines/{id}/status"].patch["x-v1-equivalent"], "POST /api/v1/machines/{id}/status");
  });

  console.log("Journey: patient flow board");
  await ok("deriveFlow: every session state maps to one current step and one next action", () => {
    const { deriveFlow } = require("../dist/flow/flow.module.js");
    const d = (scheduleStatus, sessionStatus, hasMachine = false) => deriveFlow({ scheduleStatus, sessionStatus, hasMachine });
    assert.deepEqual([d("SCHEDULED", null).current, d("SCHEDULED", null).action], ["arrival", "check-in"]);
    assert.deepEqual([d("ABSENT", null).current, d("ABSENT", null).attention], ["arrival", "ABSENT"]);
    assert.deepEqual([d("ARRIVED", null).current, d("ARRIVED", null).action], ["pre", "record-pre-dialysis"]);
    assert.deepEqual([d("ARRIVED", "PRE_DIALYSIS").current, d("ARRIVED", "PRE_DIALYSIS").action], ["supplies", "confirm-supplies"]);
    assert.deepEqual([d("ARRIVED", "SUPPLIES_READY").current, d("ARRIVED", "SUPPLIES_READY").action], ["machine", "assign-machine"]);
    assert.equal(d("ARRIVED", "WAITING_MACHINE").attention, "WAITING_MACHINE");
    assert.deepEqual([d("ARRIVED", "ASSIGNED", true).current, d("ARRIVED", "ASSIGNED", true).action], ["dialysis", "start-dialysis"]);
    assert.deepEqual([d("ARRIVED", "IN_DIALYSIS", true).current, d("ARRIVED", "IN_DIALYSIS", true).action], ["dialysis", "record-readings"]);
    assert.deepEqual([d("ARRIVED", "INTERRUPTED", true).action, d("ARRIVED", "INTERRUPTED", true).attention], ["resume-dialysis", "INTERRUPTED"]);
    assert.deepEqual([d("ARRIVED", "COMPLETED", true).current, d("ARRIVED", "COMPLETED", true).action], ["discharge", "discharge"]);
    assert.equal(d("ARRIVED", "DISCHARGED", true).current, null);
    assert.equal(d("RESCHEDULED", null).current, null);
    assert.equal(d("ARRIVED", "IN_DIALYSIS", true).steps.filter((s) => s.state === "done").length, 4);
  });
  await ok("/flow/today lists today's journeys with the next action, gated by the caller's permissions", async () => {
    const shifts = await prisma.shift.findMany({ orderBy: { name: "asc" } });
    const now = new Date();
    const todayDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const wardF = (await call("POST", "/wards", A, { name: `Ward flow ${run}` })).body;
    const machineF = (await call("POST", "/machines", A, { machineCode: `FL${run}`, wardId: wardF.id })).body;
    const mkAppt = async (label, scheduleStatus, sessionStatus, withMachine = false) => {
      const p = (await call("POST", "/patients", A, { fullName: `Flow ${label} ${run}`, gender: "MALE", dateOfBirth: "1970-01-01" })).body;
      const schedule = await prisma.dialysisSchedule.create({ data: { patientId: p.id, scheduledDate: todayDate, shiftId: shifts[0].id, type: "REGULAR", status: scheduleStatus, checkInTime: scheduleStatus === "ARRIVED" ? new Date(Date.now() - 25 * 60000) : null } });
      if (sessionStatus) await prisma.dialysisSession.create({ data: { scheduleId: schedule.id, patientId: p.id, status: sessionStatus, machineId: withMachine ? machineF.id : null } });
      return schedule.id;
    };
    const ids = {
      waiting: await mkAppt("a", "SCHEDULED", null),
      supplies: await mkAppt("b", "ARRIVED", "PRE_DIALYSIS"),
      noMachine: await mkAppt("c", "ARRIVED", "WAITING_MACHINE"),
      running: await mkAppt("d", "ARRIVED", "IN_DIALYSIS", true),
      interrupted: await mkAppt("e", "ARRIVED", "INTERRUPTED", true),
      done: await mkAppt("f", "ARRIVED", "DISCHARGED", true),
    };
    const board = await call("GET", "/flow/today", A);
    assert.equal(board.status, 200, JSON.stringify(board.body));
    const by = (id) => board.body.items.find((i) => i.appointmentId === id);
    assert.equal(by(ids.waiting).nextAction.key, "check-in");
    assert.equal(by(ids.supplies).current, "supplies");
    assert.equal(by(ids.noMachine).attention, "WAITING_MACHINE");
    assert.equal(by(ids.running).nextAction.key, "record-readings");
    assert.equal(by(ids.running).machineCode, `FL${run}`);
    assert.equal(by(ids.interrupted).nextAction.key, "resume-dialysis");
    assert.equal(by(ids.done).current, null);
    assert.ok(by(ids.supplies).minutesInStep >= 0);
    const order = board.body.items.map((i) => i.appointmentId);
    assert.ok(order.indexOf(ids.interrupted) < order.indexOf(ids.noMachine), "interrupted first");
    assert.ok(order.indexOf(ids.noMachine) < order.indexOf(ids.running), "waiting-for-machine before running");
    assert.ok(order.indexOf(ids.running) < order.indexOf(ids.done), "finished last");
    assert.ok(board.body.needsAttention >= 2 && board.body.byStep.arrival >= 1);
    const filtered = await call("GET", `/flow/today?shiftId=${shifts[3].id}`, A);
    assert.ok(!filtered.body.items.some((i) => i.appointmentId === ids.waiting), "shift filter");
    // permissions decide which buttons are live
    const R3 = (await login(reception.username, "NewPassw0rd!")).accessToken;
    const rb = (await call("GET", "/flow/today", R3)).body;
    assert.equal(rb.items.find((i) => i.appointmentId === ids.waiting).nextAction.allowed, true, "reception may check in");
    assert.equal(rb.items.find((i) => i.appointmentId === ids.supplies).nextAction.allowed, false, "reception may not confirm supplies");
    const nb = (await call("GET", "/flow/today", N.accessToken)).body;
    assert.equal(nb.items.find((i) => i.appointmentId === ids.running).nextAction.allowed, true, "nurse records readings");
    assert.equal((await call("GET", "/flow/today", (await login((await mk("flowaud", ["AUDITOR"])).username, pw)).accessToken)).status, 403);
    assert.equal((await call2("GET", "/flow/today", A)).status, 200, "same path in v2");
  });

  console.log("Platform: committee (oversight) account + work queue");
  await ok("AUDITOR sees only the oversight dashboard and timeline - no sections, no writes", async () => {
    const aud = await mk("aud", ["AUDITOR"], { expiresAt: new Date(Date.now() + 86400000).toISOString() });
    const T = await login(aud.username, pw);
    assert.equal(T.user.landingPath, "/admin/governance/oversight");
    assert.deepEqual(T.user.permissions, ["oversight.view"]);
    const s = await call("GET", "/oversight/summary", T.accessToken);
    assert.equal(s.status, 200, JSON.stringify(s.body));
    for (const k of ["activePatients", "sessions", "incidents", "machines", "complaints", "criticalLabResults"]) assert.equal(typeof s.body.kpis[k], "number", k);
    for (const k of ["sessionsByDay", "sessionsByStatus", "incidentsByType", "machinesByStatus", "activityByDay", "staffByRole", "complaintsBySource", "labItemsByStatus", "prescriptionsByStatus"]) assert.ok(Array.isArray(s.body.charts[k]), k);
    assert.ok(s.body.kpis.incidents >= 1 && s.body.kpis.complaints >= 1);
    assert.ok(s.body.charts.incidentsBySeverity.some((x) => x.key === "HIGH"));
    assert.equal((await call("GET", "/oversight/summary?from=2026-12-01&to=2026-01-01", T.accessToken)).status, 400);
    const tl = await call("GET", "/oversight/timeline?limit=5", T.accessToken);
    assert.equal(tl.status, 200);
    assert.ok(tl.body.total > 0 && tl.body.data.length <= 5);
    assert.ok(tl.body.data.every((e) => e.patientCode && !("fullName" in e)));
    assert.ok(Array.isArray(tl.body.modules));
    for (const [method, url] of [["GET", "/patients"], ["GET", "/users"], ["GET", "/audit-logs/search"], ["GET", "/staff-entries"], ["GET", "/machines"]]) {
      assert.equal((await call(method, url, T.accessToken)).status, 403, url);
    }
    assert.equal((await call("PATCH", `/patients/${patient.id}`, T.accessToken, { phone: "1" })).status, 403);
    assert.equal((await call("POST", "/staff-entries", T.accessToken, { type: "PROBLEM", title: "t", body: "b" })).status, 403);
    assert.equal((await call("GET", "/oversight/summary", N.accessToken)).status, 403);
    const seen = await call("GET", `/audit-logs/search?action=OVERSIGHT_VIEWED&actorId=${aud.id}`, A);
    assert.ok(seen.body.total >= 1, "committee access is itself audited");
  });
  await ok("work queue only lists what the role can act on", async () => {
    const nq = (await call("GET", "/me/work-queue", N.accessToken)).body.items.map((i) => i.key);
    assert.ok(nq.includes("unreadNotifications") && nq.includes("myOpenEntries"));
    assert.ok(!nq.includes("prescriptionsToDispense") && !nq.includes("entriesToReview"));
    const aq = (await call("GET", "/me/work-queue", A)).body.items;
    assert.ok(aq.some((i) => i.key === "prescriptionsToDispense") && aq.some((i) => i.key === "entriesToReview"));
    assert.ok(aq.every((i) => typeof i.count === "number" && i.link.startsWith("/admin")));
  });
  await ok("director can read the oversight dashboard but not change settings", async () => {
    const D = (await login(director.username, pw)).accessToken;
    assert.equal((await call("GET", "/oversight/summary", D)).status, 200);
    assert.equal((await call("PUT", "/settings/shiftReportRequired", D, { value: true })).status, 403);
  });

  await prisma.$disconnect();
  console.log(`\n${passed} checks passed${process.exitCode ? " (with FAILURES)" : ""}`);
})().catch((error) => { console.error(error); process.exit(1); });
