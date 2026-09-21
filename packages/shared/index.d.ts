export declare const ROLES: readonly [
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

export type Role = (typeof ROLES)[number];

export interface PermissionSeed {
  key: string;
  module: string;
  description: string;
}

export declare const PERMISSIONS: PermissionSeed[];

export declare const ROLE_TEMPLATES: Record<string, { landingPath: string; permissions: string[] }>;
