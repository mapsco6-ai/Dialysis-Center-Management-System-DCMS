export interface AuthenticatedUser {
  id: string;
  username: string;
  fullName: string;
  roles: string[];
  permissions: string[];
}

export type Gender = "MALE" | "FEMALE";
export type PatientStatus = "ACTIVE" | "INACTIVE" | "DECEASED" | "TRANSFERRED";
export type VascularAccessType = "FISTULA" | "CATHETER" | "GRAFT";
export type AlertSeverity = "CRITICAL" | "IMPORTANT" | "INFORMATION";

export interface Patient {
  id: string;
  patientCode: string;
  barcode: string;
  fullName: string;
  gender: Gender;
  dateOfBirth: string;
  phone: string | null;
  address: string | null;
  fileNumber: string | null;
  registeredAt: string;
  status: PatientStatus;
  dialysisStartDate: string | null;
  dryWeight: string | null;
  vascularAccessType: VascularAccessType | null;
  vascularAccessLocation: string | null;
  diagnoses: string | null;
  chronicDiseases: string[] | null;
  allergies: string | null;
  medicalNotes: string | null;
  specialInstructions: string | null;
  alerts?: ClinicalAlert[];
}

export interface ClinicalAlert {
  id: string;
  patientId: string;
  severity: AlertSeverity;
  category: string;
  message: string;
  createdById: string;
  resolvedAt: string | null;
  createdAt: string;
}

export interface PatientTimelineEvent {
  id: string;
  patientId: string;
  type: string;
  payload: unknown;
  performedById: string | null;
  performedBy: { id: string; username: string; fullName: string } | null;
  performedAt: string;
  sourceModule: string;
}

export type Weekday = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
export type ScheduleStatus = "SCHEDULED" | "ARRIVED" | "LATE" | "ABSENT" | "CANCELLED" | "EXTRA" | "EMERGENCY";
export type ScheduleType = "REGULAR" | "EXTRA" | "EMERGENCY";

export interface Shift {
  id: string;
  name: "SHIFT_1" | "SHIFT_2" | "SHIFT_3" | "SHIFT_4";
  dialysisStart: string;
  dialysisEnd: string;
  cleaningStart: string;
  cleaningEnd: string;
  nominalCapacity: number;
  reservedCapacity: number;
  lateThresholdMinutes: number;
}

export interface DialysisPlanEntry {
  id: string;
  patientId: string;
  weekday: Weekday;
  shiftId: string;
  shift: Shift;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface DialysisScheduleEntry {
  id: string;
  patientId: string;
  patient: { id: string; fullName: string; patientCode: string; barcode: string; fileNumber: string | null };
  scheduledDate: string;
  shiftId: string;
  shift: Shift;
  status: ScheduleStatus;
  type: ScheduleType;
  extraReason: string | null;
  emergencySourceHospital: string | null;
  emergencyReason: string | null;
  checkInTime: string | null;
  checkInStationId: string | null;
  lateMinutes: number | null;
  absentMarkedAt: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  barcode: string | null;
  minimumStock: string;
  cost: string;
  requiresBatchTracking: boolean;
  quantityInStock: string;
}

export interface PatientSupplyProfileEntry {
  id: string;
  patientId: string;
  itemId: string;
  item: InventoryItem;
  defaultQuantity: string;
}

export type SupplyIssueStatus = "ISSUED" | "UNAVAILABLE" | "SUBSTITUTED";

export interface SessionSupplyIssueItem {
  id: string;
  scheduleId: string;
  itemId: string;
  item: InventoryItem;
  quantityRequested: string;
  quantityIssued: string;
  status: SupplyIssueStatus;
  substituteForItemId: string | null;
  substituteForItem: InventoryItem | null;
  reason: string | null;
}

export interface SessionSupplyPendingLine {
  itemId: string;
  quantity: number;
  isOverridden: boolean;
  item: InventoryItem;
}

export interface SessionSuppliesResponse {
  pending: SessionSupplyPendingLine[];
  issued: SessionSupplyIssueItem[];
}
