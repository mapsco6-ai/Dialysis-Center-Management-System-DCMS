"use client";

import { useI18n } from "@/lib/i18n";

// V1.1 + §11.1 of docs/COMPREHENSIVE-DEVELOPMENT-PLAN-V1.md: one registry
// gives every enum value a single fixed tone and bilingual label, so the same
// state never appears in different colors on different screens. Unknown
// values render neutral with their raw value instead of crashing.
type Tone = "neutral" | "muted" | "success" | "warning" | "danger" | "info";
type BadgeDef = { ar: string; en: string; tone: Tone };

const GROUPS = {
  patient: {
    ACTIVE: { ar: "نشط", en: "Active", tone: "success" },
    INACTIVE: { ar: "غير نشط", en: "Inactive", tone: "muted" },
    DECEASED: { ar: "متوفى", en: "Deceased", tone: "neutral" },
    TRANSFERRED: { ar: "منقول", en: "Transferred", tone: "info" },
    ON_HOLD: { ar: "موقوف مؤقتاً", en: "On hold", tone: "warning" },
    TRANSPLANTED: { ar: "زراعة كلية", en: "Transplanted", tone: "success" },
  },
  entry: {
    SUBMITTED: { ar: "مُقدَّم", en: "Submitted", tone: "info" },
    ACKNOWLEDGED: { ar: "مُستلم", en: "Acknowledged", tone: "info" },
    IN_PROGRESS: { ar: "قيد المعالجة", en: "In progress", tone: "warning" },
    RESOLVED: { ar: "محلول", en: "Resolved", tone: "success" },
    CLOSED: { ar: "مغلق", en: "Closed", tone: "muted" },
    REJECTED: { ar: "مرفوض", en: "Rejected", tone: "danger" },
  },
  flowAttention: {
    INTERRUPTED: { ar: "جلسة مقاطَعة", en: "Interrupted", tone: "danger" },
    WAITING_MACHINE: { ar: "بانتظار جهاز", en: "Waiting for a machine", tone: "danger" },
    ABSENT: { ar: "غائب", en: "Absent", tone: "neutral" },
    LATE: { ar: "متأخر", en: "Late", tone: "warning" },
  },
  schedule: {
    SCHEDULED: { ar: "مجدول", en: "Scheduled", tone: "info" },
    ARRIVED: { ar: "وصل", en: "Arrived", tone: "success" },
    LATE: { ar: "متأخر", en: "Late", tone: "warning" },
    ABSENT: { ar: "غائب", en: "Absent", tone: "neutral" },
    CANCELLED: { ar: "ملغى", en: "Cancelled", tone: "muted" },
    EXTRA: { ar: "إضافي", en: "Extra", tone: "info" },
    EMERGENCY: { ar: "طارئ", en: "Emergency", tone: "danger" },
    RESCHEDULED: { ar: "أُعيدت جدولته", en: "Rescheduled", tone: "muted" },
  },
  session: {
    PRE_DIALYSIS: { ar: "قبل الديلزة", en: "Pre-dialysis", tone: "info" },
    SUPPLIES_READY: { ar: "المستلزمات جاهزة", en: "Supplies ready", tone: "info" },
    WAITING_MACHINE: { ar: "بانتظار جهاز", en: "Waiting machine", tone: "warning" },
    ASSIGNED: { ar: "جهاز مُسند", en: "Assigned", tone: "info" },
    IN_DIALYSIS: { ar: "قيد الديلزة", en: "In dialysis", tone: "success" },
    POST_DIALYSIS: { ar: "ما بعد الديلزة", en: "Post-dialysis", tone: "warning" },
    COMPLETED: { ar: "مكتملة", en: "Completed", tone: "success" },
    DISCHARGED: { ar: "مُخرج", en: "Discharged", tone: "muted" },
    INTERRUPTED: { ar: "مُقاطَعة", en: "Interrupted", tone: "danger" },
  },
  machine: {
    AVAILABLE: { ar: "متاح", en: "Available", tone: "success" },
    IN_USE: { ar: "قيد الاستخدام", en: "In use", tone: "info" },
    RESERVED: { ar: "محجوز", en: "Reserved", tone: "warning" },
    EMERGENCY_RESERVED: { ar: "حجز طارئ", en: "Emergency reserved", tone: "danger" },
    APPROVAL_REQUIRED: { ar: "بحاجة موافقة", en: "Approval required", tone: "warning" },
    WAITING_CLEANING: { ar: "بانتظار التعفير", en: "Waiting cleaning", tone: "warning" },
    CLEANING: { ar: "قيد التعفير", en: "Cleaning", tone: "info" },
    MAINTENANCE: { ar: "صيانة", en: "Maintenance", tone: "danger" },
    OUT_OF_SERVICE: { ar: "خارج الخدمة", en: "Out of service", tone: "danger" },
    RETIRED: { ar: "مُستبعد نهائياً", en: "Retired", tone: "muted" },
  },
  labOrderItem: {
    ORDERED: { ar: "بانتظار سحب العينة", en: "Awaiting sample", tone: "info" },
    SAMPLE_COLLECTED: { ar: "تم سحب العينة", en: "Sample collected", tone: "success" },
    PROCESSING: { ar: "قيد المعالجة", en: "Processing", tone: "warning" },
    RESULT_ENTERED: { ar: "أُدخلت النتيجة", en: "Result entered", tone: "info" },
    FINAL: { ar: "نهائية", en: "Final", tone: "success" },
    AMENDED: { ar: "مُعدَّلة", en: "Amended", tone: "warning" },
    CANCELLED: { ar: "ملغاة", en: "Cancelled", tone: "muted" },
    SAMPLE_REJECTED: { ar: "عينة مرفوضة", en: "Sample rejected", tone: "danger" },
  },
  labFlag: {
    NORMAL: { ar: "طبيعي", en: "Normal", tone: "success" },
    LOW: { ar: "منخفض", en: "Low", tone: "warning" },
    HIGH: { ar: "مرتفع", en: "High", tone: "warning" },
    CRITICAL_LOW: { ar: "حرج منخفض", en: "Critical low", tone: "danger" },
    CRITICAL_HIGH: { ar: "حرج مرتفع", en: "Critical high", tone: "danger" },
  },
  prescription: {
    ACTIVE: { ar: "سارية", en: "Active", tone: "success" },
    DISPENSING: { ar: "قيد الصرف", en: "Dispensing", tone: "warning" },
    DISPENSED: { ar: "مُصرَّفة", en: "Dispensed", tone: "success" },
    MODIFIED: { ar: "مُعدَّلة", en: "Modified", tone: "warning" },
    STOPPED: { ar: "موقوفة", en: "Stopped", tone: "muted" },
    REJECTED_BY_PHARMACY: { ar: "رفضتها الصيدلية", en: "Rejected by pharmacy", tone: "danger" },
  },
  doctorOrder: {
    ACTIVE: { ar: "سارية", en: "Active", tone: "success" },
    MODIFIED: { ar: "مُعدَّلة", en: "Modified", tone: "warning" },
    STOPPED: { ar: "موقوفة", en: "Stopped", tone: "muted" },
    EXECUTED: { ar: "منفَّذة", en: "Executed", tone: "success" },
  },
  task: {
    OPEN: { ar: "مفتوحة", en: "Open", tone: "info" },
    IN_PROGRESS: { ar: "قيد التنفيذ", en: "In progress", tone: "warning" },
    DONE: { ar: "منجزة", en: "Done", tone: "success" },
    CANCELLED: { ar: "ملغاة", en: "Cancelled", tone: "muted" },
  },
  maintenanceTicket: {
    OPEN: { ar: "مفتوح", en: "Open", tone: "info" },
    ASSIGNED: { ar: "مُسند", en: "Assigned", tone: "info" },
    IN_PROGRESS: { ar: "قيد التنفيذ", en: "In progress", tone: "warning" },
    WAITING_PART: { ar: "بانتظار قطعة", en: "Waiting part", tone: "warning" },
    COMPLETED: { ar: "مكتمل", en: "Completed", tone: "success" },
    CLOSED: { ar: "مغلق", en: "Closed", tone: "muted" },
    CANCELLED: { ar: "ملغى", en: "Cancelled", tone: "muted" },
  },
  incidentSeverity: {
    LOW: { ar: "منخفضة", en: "Low", tone: "muted" },
    MEDIUM: { ar: "متوسطة", en: "Medium", tone: "warning" },
    HIGH: { ar: "عالية", en: "High", tone: "warning" },
    CRITICAL: { ar: "حرجة", en: "Critical", tone: "danger" },
  },
  incident: {
    OPEN: { ar: "مفتوح", en: "Open", tone: "warning" },
    UNDER_REVIEW: { ar: "قيد المراجعة", en: "Under review", tone: "info" },
    ACTION_REQUIRED: { ar: "إجراء تصحيحي مطلوب", en: "Action required", tone: "danger" },
    ACTION_DONE: { ar: "نُفّذ الإجراء", en: "Action done", tone: "success" },
    CLOSED: { ar: "مغلق", en: "Closed", tone: "muted" },
  },
  approval: {
    PENDING: { ar: "بانتظار القرار", en: "Pending", tone: "warning" },
    APPROVED: { ar: "موافق عليه", en: "Approved", tone: "success" },
    REJECTED: { ar: "مرفوض", en: "Rejected", tone: "danger" },
    EXPIRED: { ar: "انتهت المهلة", en: "Expired", tone: "muted" },
  },
  supplyIssue: {
    ISSUED: { ar: "مُصدر", en: "Issued", tone: "success" },
    UNAVAILABLE: { ar: "غير متوفر", en: "Unavailable", tone: "danger" },
    SUBSTITUTED: { ar: "بديل", en: "Substituted", tone: "warning" },
  },
  clinicalSeverity: {
    CRITICAL: { ar: "حرج", en: "Critical", tone: "danger" },
    IMPORTANT: { ar: "مهم", en: "Important", tone: "warning" },
    INFORMATION: { ar: "معلومات", en: "Information", tone: "info" },
  },
  stockTransfer: {
    REQUESTED: { ar: "مطلوب", en: "Requested", tone: "info" },
    APPROVED: { ar: "معتمد", en: "Approved", tone: "info" },
    ISSUED: { ar: "صادر", en: "Issued", tone: "warning" },
    RECEIVED: { ar: "مُستلم", en: "Received", tone: "success" },
    REJECTED: { ar: "مرفوض", en: "Rejected", tone: "danger" },
    CANCELLED: { ar: "ملغى", en: "Cancelled", tone: "muted" },
  },
} satisfies Record<string, Record<string, BadgeDef>>;

export type BadgeGroup = keyof typeof GROUPS;

export function StatusBadge({ group, value }: { group: BadgeGroup; value: string }) {
  const { t } = useI18n();
  const def: BadgeDef = (GROUPS[group] as Record<string, BadgeDef>)[value] ?? { ar: value, en: value, tone: "neutral" };
  return <span className={`status-badge tone-${def.tone}`}>{t(def.ar, def.en)}</span>;
}