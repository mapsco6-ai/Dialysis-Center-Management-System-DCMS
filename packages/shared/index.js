/**
 * Shared constants used by both apps/api (seeding, guards) and apps/web (role-aware UI).
 * Kept dependency-free and pre-built (no compile step) so every workspace can require it directly.
 */

const ROLES = [
  "SUPER_ADMIN",
  "CENTER_DIRECTOR",
  "MEDICAL_DIRECTOR",
  "DOCTOR",
  "HEAD_NURSE",
  "NURSE",
  "PHARMACIST",
  "WAREHOUSE",
  "LAB_TECHNICIAN",
  "RECEPTION",
  "MAINTENANCE",
  "ACCOUNTANT",
  "AUDITOR",
];

// Phase 0 (Foundation) permission set. Later phases append their own
// module-scoped permissions here (e.g. patient.view, dialysis.start).
const PERMISSIONS = [
  { key: "user.view", module: "users", description: "View user accounts" },
  { key: "user.create", module: "users", description: "Create user accounts" },
  { key: "user.edit", module: "users", description: "Edit user accounts" },
  { key: "user.deactivate", module: "users", description: "Deactivate user accounts" },
  { key: "role.manage", module: "rbac", description: "Manage roles" },
  { key: "permission.manage", module: "rbac", description: "Manage role-permission assignments" },
  { key: "audit.view", module: "audit", description: "View audit log" },

  // Phase 1 (Patient Registry)
  { key: "patient.view", module: "patients", description: "View patient records" },
  { key: "patient.create", module: "patients", description: "Register new patients" },
  { key: "patient.edit", module: "patients", description: "Edit patient records" },
  { key: "patient.alert.manage", module: "patients", description: "Create/resolve clinical alerts" },

  // Phase 2 (Scheduling)
  { key: "scheduling.manage", module: "scheduling", description: "Manage dialysis plans and view the daily schedule" },
  { key: "dialysis.emergency.create", module: "scheduling", description: "Create emergency dialysis sessions" },
  { key: "shift.manage", module: "scheduling", description: "Edit shift capacity configuration" },

  // Phase 3 (Reception)
  { key: "attendance.checkin", module: "attendance", description: "Scan patients in and record check-in" },

  // Phase 4 (Inventory Supplies)
  { key: "inventory.view", module: "inventory", description: "View inventory catalog, stock, and supply profiles" },
  { key: "inventory.manage", module: "inventory", description: "Manage inventory catalog, stock levels, and patient supply profiles" },
  { key: "inventory.issue", module: "inventory", description: "Confirm and issue session supplies" },

  // Phase 5 (Machines)
  { key: "machine.view", module: "machines", description: "View wards, machines, and their live status" },
  { key: "machine.manage", module: "machines", description: "Manage wards/machine catalog and non-assignment status changes" },
  { key: "machine.assign", module: "machines", description: "Assign machines to sessions (automatic or manual override)" },
  { key: "approval.machine.decide", module: "machines", description: "Approve or reject protected/emergency machine usage requests" },

  // Phase 6 (Dialysis Session)
  { key: "dialysis.session.view", module: "dialysis", description: "View dialysis sessions, readings, and events" },
  { key: "dialysis.pre.record", module: "dialysis", description: "Record Pre-Dialysis assessment and confirm supplies ready" },
  { key: "dialysis.start", module: "dialysis", description: "Start a dialysis session (nursing/medical only)" },
  { key: "dialysis.reading.create", module: "dialysis", description: "Record and amend DialysisReading entries during a session" },
  { key: "dialysis.event.create", module: "dialysis", description: "Record DialysisEvent entries during a session" },
  { key: "dialysis.end", module: "dialysis", description: "End a dialysis session and record discharge" },

  // Phase 7 (Nursing)
  { key: "nursing.assign", module: "nursing", description: "Create and manage nurse-to-patient ward assignments" },
  { key: "nursing.ward.view", module: "nursing", description: "View the ward dashboard, filtered to assigned patients" },
  { key: "nursing.ward.view.all", module: "nursing", description: "View the full ward dashboard regardless of assignment" },

  // Phase 8 (Doctor PWA)
  { key: "prescription.create", module: "doctor", description: "Create doctor orders (medication, lab request, nursing instruction, dry weight change, extra session request, pharmacy recommendation) and clinical notes" },
  { key: "prescription.modify", module: "doctor", description: "Stop or modify an existing doctor order/prescription" },
  { key: "medication.administer", module: "doctor", description: "Record that a prescribed medication was actually given to a patient" },

  // Phase 9 (Laboratory)
  { key: "lab.catalog.manage", module: "laboratory", description: "Define the LabTest/LabPanel catalog" },
  { key: "lab.request", module: "laboratory", description: "Order a lab test or panel for a patient" },
  { key: "lab.queue.view", module: "laboratory", description: "View the pending lab order queue" },
  { key: "lab.result.create", module: "laboratory", description: "Advance lab order item status, enter results, and amend a final result" },

  // Phase 10 (Pharmacy)
  { key: "pharmacy.dispense", module: "pharmacy", description: "View the pharmacy queue and dispense prescriptions against pharmacy stock" },

  // Phase 11 (Advanced Warehouse)
  { key: "inventory.batch.manage", module: "inventory", description: "Receive and manage batch/expiry lots at a stock location" },
  { key: "inventory.transfer.request", module: "inventory", description: "Request a stock transfer between locations" },
  { key: "inventory.transfer.approve", module: "inventory", description: "Approve or reject a requested stock transfer" },
  { key: "inventory.transfer.issue", module: "inventory", description: "Issue (debit) an approved stock transfer from its source location" },
  { key: "inventory.transfer.receive", module: "inventory", description: "Receive (credit) an issued stock transfer at its destination location" },

  // Phase 12 (Maintenance)
  { key: "machine.fault.report", module: "machines", description: "Report a machine fault, taking it out of service and opening a maintenance ticket" },
  { key: "maintenance.manage", module: "maintenance", description: "Assign, progress, and close maintenance tickets" },

  // Phase 15 (Quality & Safety)
  { key: "incident.report", module: "quality", description: "Report a quality/safety incident against a patient, session, or machine" },
  { key: "incident.view", module: "quality", description: "View incident reports and the quality incident report" },
  { key: "incident.review", module: "quality", description: "Review and close incident reports" },
  { key: "quality.audit.view", module: "quality", description: "View the combined clinical audit trail (audit log + timeline) for a patient" },
  { key: "user.reset_password", module: "users", description: "Reset another user's password or PIN" },
  { key: "audit.export", module: "audit", description: "Export the audit trail (CSV) for oversight bodies" },
  { key: "entry.create", module: "entries", description: "Write action notes, shift reports, problems, complaints" },
  { key: "entry.review", module: "entries", description: "Review, assign, respond to and escalate staff entries" },
  { key: "settings.manage", module: "settings", description: "Change system-wide settings (e.g. mandatory shift reports)" },
  { key: "oversight.view", module: "oversight", description: "Read-only oversight dashboard and record timeline for inspection committees" },

  // Manager-initiated tasks (routed to a named employee or a whole role)
  { key: "task.create", module: "tasks", description: "Create tasks and route them to a staff member or a role" },
  { key: "task.manage", module: "tasks", description: "View and manage every task, regardless of who it is assigned to" },
];

// Default permissions per role, applied by the seed ONLY to roles that hold
// no permissions yet - so a director's later edits are never overwritten.
// landingPath: where /auth/me sends the user right after login.
const READ_ONLY_CLINICAL = ["patient.view", "dialysis.session.view", "machine.view", "inventory.view", "lab.queue.view", "incident.view", "quality.audit.view"];
const ROLE_TEMPLATES = {
  CENTER_DIRECTOR: { landingPath: "/admin", permissions: [...READ_ONLY_CLINICAL, "oversight.view", "user.view", "audit.view", "audit.export", "scheduling.manage", "shift.manage", "incident.review", "maintenance.manage", "machine.manage", "inventory.manage", "entry.create", "entry.review", "task.create", "task.manage"] },
  MEDICAL_DIRECTOR: { landingPath: "/admin", permissions: [...READ_ONLY_CLINICAL, "oversight.view", "patient.edit", "patient.alert.manage", "prescription.create", "prescription.modify", "lab.request", "incident.report", "incident.review", "audit.view", "entry.create", "entry.review", "task.create"] },
  DOCTOR: { landingPath: "/admin/care/doctor", permissions: ["patient.view", "patient.edit", "patient.alert.manage", "prescription.create", "prescription.modify", "medication.administer", "lab.request", "lab.queue.view", "dialysis.session.view", "dialysis.emergency.create", "incident.report", "entry.create"] },
  HEAD_NURSE: { landingPath: "/admin/care/nursing", permissions: ["patient.view", "nursing.assign", "nursing.ward.view", "nursing.ward.view.all", "dialysis.session.view", "dialysis.pre.record", "dialysis.start", "dialysis.reading.create", "dialysis.event.create", "dialysis.end", "medication.administer", "machine.view", "machine.assign", "machine.fault.report", "incident.report", "inventory.view", "inventory.issue", "entry.create", "entry.review"] },
  NURSE: { landingPath: "/admin/care/nursing", permissions: ["patient.view", "nursing.ward.view", "dialysis.session.view", "dialysis.pre.record", "dialysis.start", "dialysis.reading.create", "dialysis.event.create", "dialysis.end", "medication.administer", "machine.view", "machine.fault.report", "incident.report", "entry.create"] },
  PHARMACIST: { landingPath: "/admin/care/pharmacy", permissions: ["patient.view", "pharmacy.dispense", "inventory.view", "inventory.issue", "inventory.transfer.request", "inventory.transfer.receive", "entry.create"] },
  WAREHOUSE: { landingPath: "/admin/facility/inventory", permissions: ["inventory.view", "inventory.manage", "inventory.issue", "inventory.batch.manage", "inventory.transfer.request", "inventory.transfer.approve", "inventory.transfer.issue", "inventory.transfer.receive", "entry.create"] },
  LAB_TECHNICIAN: { landingPath: "/admin/care/lab", permissions: ["patient.view", "lab.queue.view", "lab.result.create", "lab.catalog.manage", "inventory.view", "entry.create"] },
  RECEPTION: { landingPath: "/admin/care/reception", permissions: ["patient.view", "patient.create", "attendance.checkin", "scheduling.manage", "entry.create"] },
  MAINTENANCE: { landingPath: "/admin/facility/maintenance", permissions: ["machine.view", "machine.manage", "machine.fault.report", "maintenance.manage", "entry.create"] },
  ACCOUNTANT: { landingPath: "/admin/governance/reports", permissions: ["inventory.view", "patient.view", "entry.create"] },
  // Health-authority / committee account: sees only the aggregated dashboard
  // (interactive charts) and the record timeline - no sections, no forms.
  // Meant to be time-limited (User.expiresAt); can never change data.
  AUDITOR: { landingPath: "/admin/governance/oversight", permissions: ["oversight.view"] },
  SUPER_ADMIN: { landingPath: "/admin", permissions: [] },
};

module.exports = { ROLES, PERMISSIONS, ROLE_TEMPLATES };
