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
  machineId: string | null;
}

export type MachineStatus =
  | "AVAILABLE"
  | "IN_USE"
  | "RESERVED"
  | "EMERGENCY_RESERVED"
  | "APPROVAL_REQUIRED"
  | "WAITING_CLEANING"
  | "CLEANING"
  | "MAINTENANCE"
  | "OUT_OF_SERVICE";

export type ApprovalDecision = "PENDING" | "APPROVED" | "REJECTED";

export interface Ward {
  id: string;
  name: string;
}

export interface Machine {
  id: string;
  machineCode: string;
  wardId: string;
  ward?: Ward;
  serialNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  status: MachineStatus;
  isEmergencyDedicated: boolean;
  isProtected: boolean;
}

export interface MachineUsageApprovalRequest {
  id: string;
  patientId: string;
  patient?: { id: string; fullName: string; patientCode: string };
  machineId: string;
  machine?: Machine;
  scheduleId: string;
  reason: string;
  requestedById: string;
  requestedBy?: { id: string; fullName: string };
  decision: ApprovalDecision;
  decidedById: string | null;
  decidedBy?: { id: string; fullName: string } | null;
  decidedAt: string | null;
  createdAt: string;
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

export type StockLocationType = "MAIN_WAREHOUSE" | "PHARMACY" | "LABORATORY_STOCK" | "WARD_STOCK";

export interface StockLocation {
  id: string;
  type: StockLocationType;
  name: string | null;
}

export type StockTransferStatus = "REQUESTED" | "APPROVED" | "ISSUED" | "RECEIVED" | "REJECTED";

export interface StockTransfer {
  id: string;
  itemId: string;
  item?: InventoryItem;
  fromLocationId: string;
  fromLocation?: StockLocation;
  toLocationId: string;
  toLocation?: StockLocation;
  quantity: string;
  status: StockTransferStatus;
  reason: string | null;
  requestedBy?: { id: string; fullName: string };
  approvedBy?: { id: string; fullName: string } | null;
  issuedBy?: { id: string; fullName: string } | null;
  receivedBy?: { id: string; fullName: string } | null;
  rejectionReason: string | null;
  requestedAt: string;
}

export interface InventoryBatch {
  id: string;
  itemId: string;
  item?: InventoryItem;
  locationId: string;
  location?: StockLocation;
  batchNumber: string;
  quantity: string;
  expiryDate: string;
}

export interface LowStockAlert {
  itemId: string;
  itemName: string;
  available: number;
  minimumStock: number;
  level: "LOW" | "CRITICAL";
}

export interface ExpiryAlerts {
  expired: InventoryBatch[];
  expiringSoon: InventoryBatch[];
  withinDays: number;
}

export interface DaysRemaining {
  itemId: string;
  itemName: string;
  available: number;
  lookbackDays: number;
  totalConsumed: number;
  averageDailyConsumption: number;
  daysOfStockRemaining: number | null;
}

export interface SessionCost {
  scheduleId: string;
  sessionId: string | null;
  consumablesCost: number;
  medicationCost: number;
  labConsumablesCost: number;
  totalCost: number;
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

export type DialysisSessionStatus =
  | "PRE_DIALYSIS"
  | "SUPPLIES_READY"
  | "WAITING_MACHINE"
  | "ASSIGNED"
  | "IN_DIALYSIS"
  | "POST_DIALYSIS"
  | "COMPLETED"
  | "DISCHARGED"
  | "INTERRUPTED";

export type DialysisEventType =
  | "NORMAL"
  | "HYPOTENSION"
  | "ACCESS_ISSUE"
  | "MACHINE_ISSUE"
  | "MEDICATION_GIVEN"
  | "PHYSICIAN_CALLED"
  | "SESSION_INTERRUPTED"
  | "OTHER";

export interface DialysisSession {
  id: string;
  scheduleId: string;
  patientId: string;
  machineId: string | null;
  machine?: Machine | null;
  wardId: string | null;
  ward?: Ward | null;
  nurseId: string | null;
  nurse?: { id: string; fullName: string } | null;
  status: DialysisSessionStatus;
  preWeight: string | null;
  preBP: string | null;
  prePulse: number | null;
  preTemperature: string | null;
  preGlucose: string | null;
  dryWeight: string | null;
  preNotes: string | null;
  dialyzerType: string | null;
  bloodLineType: string | null;
  prescribedDurationMinutes: number | null;
  requiredUF: string | null;
  accessInfo: Record<string, unknown> | null;
  startTime: string | null;
  postWeight: string | null;
  postBP: string | null;
  postPulse: number | null;
  actualUF: string | null;
  actualDurationMinutes: number | null;
  complications: string | null;
  finalNote: string | null;
  endTime: string | null;
}

export interface SessionOverview extends DialysisScheduleEntry {
  session: DialysisSession | null;
}

export interface DialysisReading {
  id: string;
  sessionId: string;
  time: string;
  bp: string | null;
  pulse: number | null;
  arterialPressure: string | null;
  venousPressure: string | null;
  tmp: string | null;
  bloodFlow: string | null;
  uf: string | null;
  enteredById: string;
  enteredBy?: { id: string; fullName: string };
  amendedFromId: string | null;
}

export interface DialysisEvent {
  id: string;
  sessionId: string;
  type: DialysisEventType;
  note: string | null;
  recordedById: string;
  recordedBy?: { id: string; fullName: string };
  recordedAt: string;
}

export interface WardDashboardMachineSession {
  id: string;
  status: DialysisSessionStatus;
  patientId: string;
  patient: { id: string; fullName: string; patientCode: string };
  nurseId: string | null;
  nurse: { id: string; fullName: string } | null;
  startTime: string | null;
  lastReadingAt: string | null;
  minutesSinceLastReading: number | null;
  openAlertsCount: number;
  openAlerts: { id: string; severity: AlertSeverity; category: string; message: string; createdAt: string }[];
  recentEvents: { id: string; type: DialysisEventType; note: string | null; recordedAt: string }[];
  activeDoctorOrders: {
    id: string;
    type: DoctorOrderType;
    payload: Record<string, unknown>;
    doctor: { id: string; fullName: string };
    createdAt: string;
  }[];
}

export interface WardDashboardMachine {
  id: string;
  machineCode: string;
  status: MachineStatus;
  isProtected: boolean;
  isEmergencyDedicated: boolean;
  session: WardDashboardMachineSession | null;
}

export interface WardDashboard {
  ward: { id: string; name: string };
  date: string;
  machines: WardDashboardMachine[];
}

export interface NursingAssignment {
  id: string;
  wardId: string;
  ward: Ward;
  shiftId: string;
  shift: Shift;
  date: string;
  nurseId: string;
  nurse: { id: string; fullName: string };
  patients: {
    id: string;
    patientId: string;
    patient: { id: string; fullName: string; patientCode: string };
  }[];
}

export type DoctorOrderType =
  | "MEDICATION"
  | "LAB_REQUEST"
  | "NURSING_INSTRUCTION"
  | "DRY_WEIGHT_CHANGE"
  | "EXTRA_SESSION_REQUEST"
  | "PHARMACY_RECOMMENDATION";

export type DoctorOrderStatus = "ACTIVE" | "MODIFIED" | "STOPPED";
export type PrescriptionStatus = "ACTIVE" | "DISPENSING" | "DISPENSED" | "MODIFIED" | "STOPPED";

export interface DoctorOrder {
  id: string;
  patientId: string;
  doctorId: string;
  doctor?: { id: string; fullName: string };
  type: DoctorOrderType;
  payload: Record<string, unknown>;
  status: DoctorOrderStatus;
  previousOrderId: string | null;
  reason: string | null;
  prescriptionId: string | null;
  createdAt: string;
}

export interface MedicationAdministration {
  id: string;
  prescriptionId: string;
  administeredById: string;
  administeredBy?: { id: string; fullName: string };
  administeredAt: string;
  doseGiven: string;
  sessionId: string | null;
}

export interface Prescription {
  id: string;
  patientId: string;
  patient?: { id: string; fullName: string; patientCode: string };
  doctorId: string;
  doctor?: { id: string; fullName: string };
  medicationName: string;
  dose: string;
  frequency: string;
  duration: string | null;
  linkedSessionId: string | null;
  status: PrescriptionStatus;
  previousPrescriptionId: string | null;
  createdAt: string;
  administrations?: MedicationAdministration[];
  orders?: { id: string; status: DoctorOrderStatus }[];
  dispenses?: PrescriptionDispense[];
}

export interface PrescriptionDispense {
  id: string;
  prescriptionId: string;
  itemId: string;
  item?: InventoryItem;
  dispensedById: string;
  dispensedBy?: { id: string; fullName: string };
  quantity: string;
  linkedSessionId: string | null;
  dispensedAt: string;
}

export interface MedicationHistoryEntry {
  id: string;
  medicationName: string;
  dose: string;
  frequency: string;
  duration: string | null;
  status: PrescriptionStatus;
  prescribedAt: string;
  prescribedBy: { id: string; fullName: string };
  dispenses: PrescriptionDispense[];
  administrations: MedicationAdministration[];
}

export interface ClinicalNote {
  id: string;
  patientId: string;
  authorId: string;
  author?: { id: string; fullName: string };
  sessionId: string | null;
  text: string;
  createdAt: string;
}

export interface LabTest {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  referenceRangeLow: string | null;
  referenceRangeHigh: string | null;
}

export interface LabPanel {
  id: string;
  name: string;
  tests: { labTestId: string; labTest: LabTest }[];
}

export type LabOrderItemStatus =
  | "ORDERED"
  | "SAMPLE_COLLECTED"
  | "PROCESSING"
  | "RESULT_ENTERED"
  | "FINAL"
  | "AMENDED"
  | "CANCELLED";

export interface LabResult {
  id: string;
  labOrderItemId: string;
  value: string;
  isFinal: boolean;
  enteredById: string;
  amendedFromId: string | null;
  amendReason: string | null;
  createdAt: string;
}

export interface LabOrderItem {
  id: string;
  labOrderId: string;
  labTestId: string;
  labTest: LabTest;
  status: LabOrderItemStatus;
  results: LabResult[];
  createdAt: string;
}

export interface LabOrder {
  id: string;
  episodeCode: string;
  patientId: string;
  patient?: { id: string; fullName: string; patientCode: string };
  orderedByDoctorId: string;
  orderedByDoctor?: { id: string; fullName: string };
  orderedAt: string;
  items: LabOrderItem[];
}

export interface LabQueueItem extends LabOrderItem {
  labOrder: LabOrder;
}

export interface LabTrendPoint {
  episodeCode: string;
  date: string;
  value: string;
}
