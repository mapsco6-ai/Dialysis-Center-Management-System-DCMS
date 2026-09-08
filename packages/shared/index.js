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
];

module.exports = { ROLES, PERMISSIONS };
