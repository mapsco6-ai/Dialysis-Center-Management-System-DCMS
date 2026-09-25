# Dialysis Session Patient Flow — End-to-End Check

Date: 2026-09-25 · Scope: appointment → check-in → pre-dialysis → supplies → machine → dialysis → end → discharge → machine back to pool.

> **Status (2026-09-26): #1–#7 fixed** except "schedule stays ARRIVED after discharge" (deferred, needs a new enum value) and "`schedule.machineId` never cleared" (kept on purpose: it records the machine actually used, and cancel clears it). Re-verified live on a throwaway DB:
> - races: exactly one 201, one audit row and one timeline row per step
> - an unrostered nurse gets 403 on every write
> - assign before check-in → 409
> - cancel frees the machine
> - an event after end → 201
> - the ward dashboard links by `scheduleId`
>
> Unit tests: `sessions`, `machines` and `flow` specs. Existing phase456 and reception integration suites: 65/65 pass.

## How it was tested

- Code read: `scheduling.service.ts`, `sessions.service.ts`, `machines.service.ts`, `flow.module.ts`, `session-supplies.service.ts`, web `care/flow`, `care/sessions/[id]`, `care/sessions/[id]/supplies`, `care/appointments`, `care/nursing`.
- Live run: current source API started on port 13901 against a throwaway DB (`dcms_flowtest`, migrated + seeded, dropped afterwards). All calls went through `/api/v2`, the same routes the web UI uses. Real local DB (`dcms`) was not touched.

## Happy path — works

| Step | Call | Result |
|---|---|---|
| Appointment | `POST /appointments/extra` | 201, flow `arrival / check-in` |
| Check-in | `POST /appointments/{id}/check-in` | 201 `ARRIVED`, lateMinutes 24 (threshold 30). Repeat → 409 |
| Pre-dialysis | `PUT …/session/pre-dialysis` | 200 `PRE_DIALYSIS`. Before check-in → 409 |
| Supplies | `POST …/session/supplies-ready` | 201. Absorbed pre-assigned machine → `ASSIGNED` |
| Machine | `POST …/session/machine` | 201 auto-assign, machine `RESERVED` |
| Start | `POST …/session/start` | 201 `IN_DIALYSIS`, machine `IN_USE`. Start before machine → 409 |
| Readings / amend / events | | 201. Reading while `INTERRUPTED` → 409 |
| Interrupt → reassign | `…/interrupt`, `PUT …/session/machine` | `INTERRUPTED` → `IN_DIALYSIS`, old machine `OUT_OF_SERVICE`, new `IN_USE` |
| End | `POST …/session/end` | 201 `COMPLETED`, machine `WAITING_CLEANING` |
| Discharge | `POST …/session/discharge` | 201 `DISCHARGED`. Repeat → 409. Flow shows closed |
| Machine back | `PATCH /machines/{id}/status` | `WAITING_CLEANING → AVAILABLE` blocked (409); `→ CLEANING → AVAILABLE` OK |

Sequence guards, the absence of any way to skip a step, and `session_status_history` (DB trigger) all behave correctly on the single-request path.

## Findings

Severity: 🔴 high · 🟠 medium · 🟡 low. "Live" = reproduced against the running API. "Code" = confirmed by reading the code.

### 🔴 1. Session transitions race: double start / end / discharge all succeed (live)
`start`, `end`, `discharge`, `resume`, `interrupt`, `confirmSuppliesReady` read the status and then do an unconditional `update`. Check-in and approvals already use the safe pattern (`updateMany where status = expected`, then check `count`). These transitions don't.
Repro: 4 parallel `start` calls → **3× 201**. 4 parallel `end` → **4× 201**. 3 parallel `discharge` → **3× 201**.
Effect: 3 `DIALYSIS_STARTED` + 4 `DIALYSIS_ENDED` + 3 `DIALYSIS_DISCHARGED` audit rows, and 4 `DIALYSIS_COMPLETED` timeline events for one session. Duplicate machine-history rows. `end` recomputes `endTime` and `actualDurationMinutes`, so the last writer wins. This happens on a double-click or a flaky network retry.
Fix: `sessions.service.ts` — in each transition, do `tx.dialysisSession.updateMany({ where: { id, status: <expected> } })` and throw 409 when `count === 0`, as `checkIn` does.

### 🔴 2. Nurse roster check skipped on every state change (live)
`enforceNursingAssignment` runs only for overview, readings and events. A `NURSE` who has **no roster** for the patient:
- `GET session` → 403 ✅, `POST readings` → 403 ✅
- `pre-dialysis` 200, `supplies-ready` 201, `start` 201, `interrupt` 201, `resume` 201, `end` 201, `discharge` 201 ❌

This is the same leak as DCMS-006/058: the nurse can't view the session but can run it end to end.
Fix: call `enforceNursingAssignmentForSession` (or `enforceNursingAssignment` for pre-dialysis) in `preDialysis`, `confirmSuppliesReady`, `start`, `end`, `discharge`, `interrupt`, `resume`, `reassignMachine`.

### 🔴 3. No way to abort a session before it starts; the machine stays locked (live)
If a patient arrives and gets a machine, then leaves or is transferred before start:
- `reschedule` → 409 (`ARRIVED` isn't allowed)
- `interrupt` → 409 (only from `IN_DIALYSIS`)
- The schedule status `CANCELLED` exists but nothing sets it. No cancel endpoint exists.
- `setStatus` refuses to release a `RESERVED` machine (it's "tied to an active assignment").

The machine stays `RESERVED` for good. The only way out is `OUT_OF_SERVICE`, which is false and triggers the maintenance flow.
Fix: add one `cancel` action for `PRE_DIALYSIS`/`SUPPLIES_READY`/`WAITING_MACHINE`/`ASSIGNED` that takes a reason. It should set the schedule to `CANCELLED`, release the machine to `AVAILABLE` and clear `schedule.machineId`.

### 🟠 4. A machine can be assigned before the patient arrives, and an absence never releases it (live + code)
`assignMachine` doesn't check the schedule status. It returned 201 for a `SCHEDULED` patient and the machine went `RESERVED`. If that patient never shows, `ensureAbsencesMarked` flips the schedule to `ABSENT` but leaves the machine `RESERVED`. That is the same dead end as #3.
Fix: in `assignMachine`, require the schedule to be `ARRIVED`/`LATE` (the supplies service already does this).

### 🟠 5. An approval decision can overwrite a machine that is already assigned (code)
`decideApproval(APPROVED)` does `dialysisSchedule.update({ machineId })` without checking `schedule.machineId IS NULL`. Scenario: an approval is pending on machine A → staff auto/manual-assign machine B (allowed, because `schedule.machineId` is still null) → someone approves A. The schedule now points at A, and B stays `RESERVED` with no session.
Fix: inside the tx, `updateMany({ where: { id: scheduleId, machineId: null } })` and throw 409 when `count === 0`.

### 🟠 6. UI dead ends in the journey (code)
- **Interrupted session:** the page shows only "interrupted" text. It has no Resume, End or Reassign button, although the API allows all three. The Journey board's "Resume session" button links to this page. Interrupt also has no button anywhere, so the UI can't reach this state, but other clients or the API can.
- **Assign machine:** the Journey board's `assign-machine` action links to `/admin/care/sessions/{id}`, which only says "awaiting machine assignment". The Assign button lives on `/admin/care/appointments`.
- **Supplies:** the board's `confirm-supplies` links to `…/supplies`. That page has no "Confirm supplies ready" button and no link back. The button is on the session page.
- **Nursing ward page:** "Open session" links to `/admin/care/sessions/${m.session.id}`, which is the **DialysisSession id**. The route expects the **appointment (schedule) id**. Live: `GET /appointments/<sessionId>/session` → 404 "Schedule entry not found". Every link from the ward dashboard is broken.
  Fix: `ward-dashboard.service.ts` should also return `scheduleId`, and `nursing/page.tsx:228` should link with it.

### 🟡 7. Smaller gaps
- **`POST_DIALYSIS` is never set.** `end` goes `IN_DIALYSIS → COMPLETED`, so the allowance in `addEvent` for `POST_DIALYSIS` is dead. Live: an event after end → 409, so a post-session complication (e.g. bleeding at the access site) can't be logged. Either set `POST_DIALYSIS` on end, or allow events while `COMPLETED`.
- **Event types are out of sync.** The UI `DialysisEventType` and its labels lack `CRAMPS`, `BLEEDING`, `CHEST_PAIN` and `CLOTTING`, which the API accepts (`lib/types.ts:295`, `sessions/[id]/page.tsx:15`).
- **The patient timeline is incomplete.** There are no timeline events for pre-dialysis, supplies-ready or discharge (live timeline: `…STARTED, …COMPLETED` and nothing after). Pre-dialysis, supplies-ready, discharge and resume also write their audit log outside a transaction.
- **`schedule.machineId` is never cleared** after end or discharge. After cleaning, the machine is `AVAILABLE` but the old appointment still points at it, and the appointments page still shows "Machine assigned".
- **Schedule status stays `ARRIVED` after discharge.** Attendance reports can't tell "arrived and treated" apart from "arrived, never treated".
- **Reschedule is inconsistent.** It allows `LATE` but rejects `ARRIVED`, and both mean "checked in".
- **Pre-dialysis vitals can't be edited from the UI.** The form shows only when no session exists. The API allows it (upsert while `PRE_DIALYSIS`).
- **There are no tests** for `SessionsService`, `SchedulingService` or `deriveFlow` (`flow.module.ts` says "pure so it can be unit-checked", but no check exists).

## Priority

1. #1 race and #2 roster: small, local changes in `sessions.service.ts`; data integrity and an authorization hole.
2. #3 cancel action and #4 assign guard: machines can currently leak permanently.
3. #6 nursing link and the Journey board hrefs: one-line fixes that unblock the UI flow.
4. #5, then #7.
