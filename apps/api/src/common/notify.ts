import type { EventEmitter2 } from "@nestjs/event-emitter";

export const NOTIFY_EVENT = "notify";

// Recipients: explicit users and/or everyone holding a permission.
export interface NotifyEvent {
  userIds?: string[];
  permission?: string;
  excludeUserId?: string;
  type: string;
  title: string;
  body?: string;
  titleAr?: string;
  bodyAr?: string;
  link?: string;
}

// [Arabic, English] words for codes that end up inside notification text.
// ponytail: duplicates a slice of apps/web/src/lib/labels.ts; move both into
// packages/shared if more server-side text needs them.
export const CODE_WORDS: Record<string, [string, string]> = {
  LOW: ["منخفضة", "Low"], MEDIUM: ["متوسطة", "Medium"], HIGH: ["عالية", "High"], CRITICAL: ["حرجة", "Critical"],
  ADVERSE_EVENT: ["حدث ضار", "adverse event"], INFECTION: ["عدوى", "infection"], VASCULAR_ACCESS_EVENT: ["حدث وصول وعائي", "vascular access event"],
  HOSPITAL_TRANSFER: ["نقل لمستشفى", "hospital transfer"], EMERGENCY_EVENT: ["حدث طارئ", "emergency"], REPEATED_HYPOTENSION: ["هبوط ضغط متكرر", "repeated hypotension"], MACHINE_INCIDENT: ["حادث جهاز", "machine incident"],
  SUPER_ADMIN: ["مدير النظام", "System administrator"], CENTER_DIRECTOR: ["مدير المركز", "Center director"], MEDICAL_DIRECTOR: ["المدير الطبي", "Medical director"],
  DOCTOR: ["طبيب", "Doctor"], HEAD_NURSE: ["رئيس التمريض", "Head nurse"], NURSE: ["ممرض", "Nurse"], PHARMACIST: ["صيدلي", "Pharmacist"],
  WAREHOUSE: ["أمين المستودع", "Warehouse"], LAB_TECHNICIAN: ["فني مختبر", "Lab technician"], RECEPTION: ["الاستقبال", "Reception"],
  MAINTENANCE: ["الصيانة", "Maintenance"], ACCOUNTANT: ["محاسب", "Accountant"], AUDITOR: ["مدقق", "Auditor"],
};
export const word = (code: string | undefined, lang: "ar" | "en") => (code && CODE_WORDS[code]?.[lang === "ar" ? 0 : 1]) ?? code ?? "";

export const emitNotification = (emitter: EventEmitter2, event: NotifyEvent) => emitter.emit(NOTIFY_EVENT, event);
