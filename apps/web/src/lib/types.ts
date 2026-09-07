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
