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
];

module.exports = { ROLES, PERMISSIONS };
