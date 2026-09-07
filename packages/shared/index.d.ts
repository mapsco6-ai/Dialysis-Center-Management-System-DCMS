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
];

export type Role = (typeof ROLES)[number];

export interface PermissionSeed {
  key: string;
  module: string;
  description: string;
}

export declare const PERMISSIONS: PermissionSeed[];
