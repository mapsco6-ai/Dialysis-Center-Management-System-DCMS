"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { TIMELINE_LABELS } from "@/lib/timelineLabels";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { FilterSelect } from "@/components/FilterSelect";
import { ErrorNote } from "@/components/ErrorNote";
import { toast } from "@/components/Toaster";
import {
  DialysisPlanEntry,
  InventoryItem,
  Patient,
  PatientSupplyProfileEntry,
  PatientTimelineEvent,
  Shift,
  Weekday,
} from "@/lib/types";

const severityBadgeTone: Record<string, string> = {
  CRITICAL: "tone-danger",
  IMPORTANT: "tone-warning",
  INFORMATION: "tone-info",
};

const severityTone: Record<string, string> = {
  CRITICAL: "pt-sev-critical",
  IMPORTANT: "pt-sev-important",
  INFORMATION: "pt-sev-information",
};

const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

type TabKey = "general" | "plan" | "supplies" | "timeline";

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="pt-detail">
      <dt>{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}

function ageFrom(dateOfBirth: string) {
  const birth = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDelta = now.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age;
}

export default function PatientProfilePage() {
  const { t, formatDate, formatNumber } = useI18n();
  const patientStatusLabel = {
    ACTIVE: t("نشط", "Active"),
    INACTIVE: t("غير نشط", "Inactive"),
    DECEASED: t("متوفى", "Deceased"),
    TRANSFERRED: t("منقول", "Transferred"),
    ON_HOLD: t("موقوف مؤقتاً", "On hold"),
    TRANSPLANTED: t("زراعة كلية", "Transplanted"),
  };
  const severityLabel = {
    CRITICAL: t("حرج", "Critical"),
    IMPORTANT: t("مهم", "Important"),
    INFORMATION: t("معلومات", "Information"),
  };
  const vascularAccessLabel = {
    FISTULA: t("ناسور", "Fistula"),
    CATHETER: t("قسطرة", "Catheter"),
    GRAFT: t("وصلة وعائية", "Graft"),
  };
  const shiftLabel: Record<string, string> = {
    SHIFT_1: t("الشفت الأول", "Shift 1"),
    SHIFT_2: t("الشفت الثاني", "Shift 2"),
    SHIFT_3: t("الشفت الثالث", "Shift 3"),
    SHIFT_4: t("الشفت الرابع", "Shift 4"),
  };
  const WEEKDAY_LABELS: Record<Weekday, string> = {
    SUN: t("الأحد", "Sunday"),
    MON: t("الاثنين", "Monday"),
    TUE: t("الثلاثاء", "Tuesday"),
    WED: t("الأربعاء", "Wednesday"),
    THU: t("الخميس", "Thursday"),
    FRI: t("الجمعة", "Friday"),
    SAT: t("السبت", "Saturday"),
  };

  const params = useParams<{ id: string }>();
  const user = useCurrentUser();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [patientError, setPatientError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<PatientTimelineEvent[]>([]);
  const [showAlertForm, setShowAlertForm] = useState(false);
  const [alertError, setAlertError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("general");

  const [plan, setPlan] = useState<DialysisPlanEntry[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [editingPlan, setEditingPlan] = useState(false);
  const [planDraft, setPlanDraft] = useState<{ weekday: Weekday; shiftId: string }[]>([]);
  const [planError, setPlanError] = useState<string | null>(null);

  const [supplyProfile, setSupplyProfile] = useState<PatientSupplyProfileEntry[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [editingSupplyProfile, setEditingSupplyProfile] = useState(false);
  const [supplyProfileDraft, setSupplyProfileDraft] = useState<{ itemId: string; defaultQuantity: number }[]>([]);
  const [supplyProfileError, setSupplyProfileError] = useState<string | null>(null);

  function refresh() {
    setPatientError(null);
    apiFetch(`/patients/${params.id}`)
      .then(setPatient)
      .catch((err) => setPatientError(err instanceof Error ? err.message : t("تعذر تحميل ملف المريض", "Unable to load patient record")));
    apiFetch(`/patients/${params.id}/timeline`).then(setTimeline).catch(() => setTimeline([]));
    if (user?.permissions.includes("scheduling.manage")) {
      apiFetch(`/patients/${params.id}/dialysis-plan`).then(setPlan).catch(() => setPlan([]));
    }
    if (user?.permissions.includes("inventory.view")) {
      apiFetch(`/patients/${params.id}/supply-profile`).then(setSupplyProfile).catch(() => setSupplyProfile([]));
    }
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    if (user.permissions.includes("scheduling.manage")) {
      apiFetch("/shifts").then(setShifts).catch(() => setShifts([]));
    }
    if (user.permissions.includes("inventory.manage")) {
      apiFetch("/inventory/items").then(setInventoryItems).catch(() => setInventoryItems([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  function startEditingSupplyProfile() {
    setSupplyProfileDraft(
      supplyProfile.length > 0
        ? supplyProfile.map((entry) => ({ itemId: entry.itemId, defaultQuantity: Number(entry.defaultQuantity) }))
        : [{ itemId: inventoryItems[0]?.id ?? "", defaultQuantity: 1 }],
    );
    setSupplyProfileError(null);
    setEditingSupplyProfile(true);
  }

  async function handleSaveSupplyProfile() {
    setSupplyProfileError(null);
    try {
      await apiFetch(`/patients/${params.id}/supply-profile`, {
        method: "PUT",
        body: JSON.stringify({ entries: supplyProfileDraft }),
      });
      setEditingSupplyProfile(false);
      refresh();
    } catch (err) {
      setSupplyProfileError(err instanceof Error ? err.message : t("تعذر حفظ ملف المستلزمات", "Unable to save supply profile"));
    }
  }

  function startEditingPlan() {
    setPlanDraft(
      plan.length > 0
        ? plan.map((entry) => ({ weekday: entry.weekday, shiftId: entry.shiftId }))
        : [{ weekday: "SUN", shiftId: shifts[0]?.id ?? "" }],
    );
    setPlanError(null);
    setEditingPlan(true);
  }

  async function handleSavePlan() {
    setPlanError(null);
    try {
      await apiFetch(`/patients/${params.id}/dialysis-plan`, {
        method: "POST",
        body: JSON.stringify({ entries: planDraft }),
      });
      setEditingPlan(false);
      refresh();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : t("تعذر حفظ الخطة", "Unable to save plan"));
    }
  }

  async function handleCreateAlert(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAlertError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch(`/patients/${params.id}/alerts`, {
        method: "POST",
        body: JSON.stringify({
          severity: form.get("severity"),
          category: form.get("category"),
          message: form.get("message"),
        }),
      });
      setShowAlertForm(false);
      refresh();
    } catch (err) {
      setAlertError(err instanceof Error ? err.message : t("تعذر إضافة التنبيه", "Unable to add alert"));
    }
  }

  if (!user) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  if (patientError) {
    return <main className="p-8 text-danger">{patientError}</main>;
  }

  if (!patient) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const canPlan = user.permissions.includes("scheduling.manage");
  const canSupplies = user.permissions.includes("inventory.view") || user.permissions.includes("inventory.manage");
  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: t("البيانات العامة", "General") },
    ...(canPlan ? [{ key: "plan" as TabKey, label: t("خطة الغسيل", "Dialysis plan") }] : []),
    ...(canSupplies ? [{ key: "supplies" as TabKey, label: t("المستلزمات", "Supplies") }] : []),
    { key: "timeline", label: t("السجل الزمني", "Timeline") },
  ];
  const activeTab = tabs.some((item) => item.key === tab) ? tab : "general";
  const initials = patient.fullName.trim().split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join("");
  const openAlerts = (patient.alerts ?? []).filter((a) => !a.resolvedAt);

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/care/patients" className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-muted">
          <svg className="dir-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t("المرضى", "Patients")}
        </Link>
        {user.permissions.includes("patient.alert.manage") && (
          <button onClick={() => setShowAlertForm((v) => !v)} className="bg-accent px-4 text-sm text-white">
            {showAlertForm ? t("إلغاء", "Cancel") : t("+ تنبيه سريري", "+ Clinical alert")}
          </button>
        )}
      </div>

      {openAlerts.length > 0 && (
        <div className="mt-4 space-y-2">
          {openAlerts.map((alert) => (
            <div key={alert.id} className={`status-badge whitespace-normal px-4 py-2 text-sm ${severityBadgeTone[alert.severity] ?? "tone-neutral"}`}>
              <span className="font-semibold">[{severityLabel[alert.severity]}]</span> {alert.category}: {alert.message}
            </div>
          ))}
        </div>
      )}

      {showAlertForm && (
        <form onSubmit={handleCreateAlert} className="mt-4 rounded-lg border border-border bg-surface p-4">
          <h2>{t("تنبيه سريري جديد", "New clinical alert")}</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("الخطورة", "Severity")}
              <FilterSelect
                name="severity"
                required
                defaultValue="CRITICAL"
                className="min-w-[10rem]"
                aria-label={t("الخطورة", "Severity")}
                options={[
                  { id: "CRITICAL", label: severityLabel.CRITICAL },
                  { id: "IMPORTANT", label: severityLabel.IMPORTANT },
                  { id: "INFORMATION", label: severityLabel.INFORMATION },
                ]}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t("التصنيف", "Category")}
              <input name="category" required placeholder={t("مثال: حساسية دواء", "e.g. Drug allergy")} className="border border-border" />
            </label>
            <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs font-medium">
              {t("نص التنبيه", "Message")}
              <input name="message" required className="border border-border" />
            </label>
            <button type="submit" className="bg-accent px-4 text-sm text-white">{t("حفظ التنبيه", "Save alert")}</button>
          </div>
          <ErrorNote message={alertError} />
        </form>
      )}

      <div className="mt-5 pt-layout">
        <div className="grid gap-4">
          <section className="rounded-lg border border-border bg-surface p-5 pt-identity">
            <span className="pt-avatar" aria-hidden="true">{initials}</span>
            <h1 className="pt-name">{patient.fullName}</h1>
            <p className="pt-code">{patient.patientCode}</p>
            <p className={`mt-2 status-badge ${patient.status === "ACTIVE" ? "tone-success" : "tone-muted"}`}>
              {patientStatusLabel[patient.status]}
            </p>
            <dl className="pt-facts">
              <div className="pt-fact"><dt>{t("الجنس", "Gender")}</dt><dd>{patient.gender === "MALE" ? t("ذكر", "Male") : t("أنثى", "Female")}</dd></div>
              <div className="pt-fact"><dt>{t("العمر", "Age")}</dt><dd>{formatNumber(ageFrom(patient.dateOfBirth))}</dd></div>
              <div className="pt-fact"><dt>{t("الهاتف", "Phone")}</dt><dd>{patient.phone || "—"}</dd></div>
              <div className="pt-fact"><dt>{t("رقم الإضبارة", "File no.")}</dt><dd>{patient.fileNumber || "—"}</dd></div>
              <div className="pt-fact"><dt>{t("الوزن الجاف", "Dry weight")}</dt><dd>{patient.dryWeight != null ? formatNumber(Number(patient.dryWeight)) : "—"}</dd></div>
              <div className="pt-fact"><dt>{t("الوصول الوعائي", "Access")}</dt><dd>{patient.vascularAccessType ? vascularAccessLabel[patient.vascularAccessType] : "—"}</dd></div>
            </dl>
            {(patient.chronicDiseases ?? []).length > 0 && (
              <div className="pt-tags">
                {(patient.chronicDiseases ?? []).map((condition) => <span key={condition} className="pt-tag">#{condition}</span>)}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-surface p-5">
            <h2>{t("التنبيهات السريرية", "Clinical alerts")}</h2>
            <div className="mt-3 pt-list">
              {(patient.alerts ?? []).map((alert) => (
                <div key={alert.id} className="pt-list-row">
                  <b>{alert.category}</b>
                  <span className={`pt-sev ${alert.resolvedAt ? "pt-sev-resolved" : severityTone[alert.severity]}`}>
                    {alert.resolvedAt ? t("محلول", "Resolved") : severityLabel[alert.severity]}
                  </span>
                </div>
              ))}
              {(patient.alerts ?? []).length === 0 && <p className="text-xs text-muted">{t("لا توجد تنبيهات", "No alerts")}</p>}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-5">
            <h2>{t("الحساسية والملاحظات", "Allergies & notes")}</h2>
            <div className="mt-3 pt-list">
              <div><p className="text-xs text-muted">{t("الحساسية", "Allergies")}</p><p className="mt-1 text-xs font-semibold text-foreground">{patient.allergies || t("لا توجد حساسية مسجّلة", "None recorded")}</p></div>
              <div><p className="text-xs text-muted">{t("ملاحظات طبية", "Medical notes")}</p><p className="mt-1 text-xs font-semibold text-foreground">{patient.medicalNotes || t("لا توجد ملاحظات", "No notes")}</p></div>
            </div>
          </section>
        </div>

        <div>
          <div className="pt-tabs" role="tablist">
            {tabs.map((item) => (
              <button key={item.key} role="tab" aria-selected={activeTab === item.key} className="pt-tab" onClick={() => setTab(item.key)}>
                {item.label}
              </button>
            ))}
          </div>

          <div className="pt-pane" role="tabpanel">
            {activeTab === "general" && (
              <>
                <p className="pt-section-label">{t("البيانات الشخصية", "Personal details")}</p>
                <dl className="pt-details">
                  <Detail label={t("الاسم الكامل", "Full name")} value={patient.fullName} />
                  <Detail label={t("رمز المريض", "Patient code")} value={patient.patientCode} />
                  <Detail
                    label={t("الباركود", "Barcode")}
                    value={
                      <button
                        type="button"
                        className="cursor-copy hover:text-accent"
                        title={t("انقر للنسخ", "Click to copy")}
                        onClick={() => navigator.clipboard.writeText(patient.barcode).then(
                          () => toast.success(t("تم نسخ الباركود", "Barcode copied")),
                          () => toast.error(t("تعذر نسخ الباركود", "Unable to copy the barcode")),
                        )}
                      >
                        {patient.barcode}
                      </button>
                    }
                  />
                  <Detail label={t("تاريخ الميلاد", "Date of birth")} value={formatDate(patient.dateOfBirth, { timeZone: "UTC" })} />
                  <Detail label={t("الجنس", "Gender")} value={patient.gender === "MALE" ? t("ذكر", "Male") : t("أنثى", "Female")} />
                  <Detail label={t("الهاتف", "Phone")} value={patient.phone} />
                  <Detail label={t("العنوان", "Address")} value={patient.address} />
                  <Detail label={t("رقم الإضبارة", "File number")} value={patient.fileNumber} />
                </dl>

                <p className="pt-section-label mt-8">{t("البيانات السريرية", "Clinical details")}</p>
                <dl className="pt-details">
                  <Detail label={t("تاريخ بدء الديلزة", "Dialysis start date")} value={patient.dialysisStartDate ? formatDate(patient.dialysisStartDate, { timeZone: "UTC" }) : null} />
                  <Detail label={t("الوزن الجاف", "Dry weight")} value={patient.dryWeight != null ? formatNumber(Number(patient.dryWeight)) : null} />
                  <Detail label={t("نوع الوصول الوعائي", "Vascular access type")} value={patient.vascularAccessType ? vascularAccessLabel[patient.vascularAccessType] : null} />
                  <Detail label={t("الحساسية", "Allergies")} value={patient.allergies} />
                  <Detail label={t("الأمراض المزمنة", "Chronic conditions")} value={patient.chronicDiseases?.join("، ")} />
                  <Detail label={t("الحالة", "Status")} value={patientStatusLabel[patient.status]} />
                </dl>

                {patient.medicalNotes && (
                  <>
                    <p className="pt-section-label mt-8">{t("ملاحظات طبية", "Medical notes")}</p>
                    <p className="text-sm text-foreground">{patient.medicalNotes}</p>
                  </>
                )}
              </>
            )}

            {activeTab === "plan" && canPlan && (
              <>
                <div className="flex items-center justify-between">
                  <p className="pt-section-label" style={{ marginBottom: 0 }}>{t("خطة الغسيل الأسبوعية", "Weekly dialysis plan")}</p>
                  {!editingPlan && (
                    <button onClick={startEditingPlan} className="text-xs font-semibold text-muted hover:underline">
                      {t("تعديل الخطة", "Edit plan")}
                    </button>
                  )}
                </div>

                {!editingPlan && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {plan.length === 0 && <p className="text-xs text-muted">{t("لا توجد خطة غسيل مسجّلة", "No dialysis plan recorded")}</p>}
                    {plan.map((entry) => (
                      <span key={entry.id} className="pt-tag">
                        {WEEKDAY_LABELS[entry.weekday]} · {shiftLabel[entry.shift.name] ?? entry.shift.name}
                      </span>
                    ))}
                  </div>
                )}

                {editingPlan && (
                  <div className="mt-4 space-y-2">
                    {planDraft.map((entry, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <FilterSelect
                          className="min-w-[10rem]"
                          aria-label={t("اليوم", "Weekday")}
                          value={entry.weekday}
                          onChange={(weekday) => setPlanDraft((prev) => prev.map((row, i) => (i === index ? { ...row, weekday: weekday as Weekday } : row)))}
                          options={WEEKDAYS.map((day) => ({ id: day, label: WEEKDAY_LABELS[day] }))}
                        />
                        <FilterSelect
                          className="min-w-[10rem]"
                          aria-label={t("الوردية", "Shift")}
                          value={entry.shiftId}
                          onChange={(shiftId) => setPlanDraft((prev) => prev.map((row, i) => (i === index ? { ...row, shiftId } : row)))}
                          options={shifts.map((shift) => ({
                            id: shift.id,
                            label: `${shiftLabel[shift.name] ?? shift.name} (${shift.dialysisStart}-${shift.dialysisEnd})`,
                          }))}
                        />
                        <button onClick={() => setPlanDraft((prev) => prev.filter((_, i) => i !== index))} className="text-xs font-semibold text-danger hover:underline">
                          {t("حذف", "Remove")}
                        </button>
                      </div>
                    ))}

                    {planDraft.length < 4 && (
                      <button onClick={() => setPlanDraft((prev) => [...prev, { weekday: "SUN", shiftId: shifts[0]?.id ?? "" }])} className="text-xs font-semibold text-muted hover:underline">
                        {t("+ إضافة يوم", "+ Add day")}
                      </button>
                    )}

                    <ErrorNote message={planError} />

                    <div className="flex gap-2 pt-2">
                      <button onClick={handleSavePlan} className="bg-accent px-4 text-xs text-accent-foreground">{t("حفظ الخطة", "Save plan")}</button>
                      <button onClick={() => setEditingPlan(false)} className="rounded-md border border-border px-4 text-xs text-muted">{t("إلغاء", "Cancel")}</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "supplies" && canSupplies && (
              <>
                <div className="flex items-center justify-between">
                  <p className="pt-section-label" style={{ marginBottom: 0 }}>{t("مستلزمات الجلسة الافتراضية", "Default session supplies")}</p>
                  {!editingSupplyProfile && user.permissions.includes("inventory.manage") && (
                    <button onClick={startEditingSupplyProfile} className="text-xs font-semibold text-muted hover:underline">
                      {t("تعديل", "Edit")}
                    </button>
                  )}
                </div>

                {!editingSupplyProfile && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {supplyProfile.length === 0 && <p className="text-xs text-muted">{t("لا يوجد ملف مستلزمات مسجّل", "No supply profile recorded")}</p>}
                    {supplyProfile.map((entry) => (
                      <span key={entry.id} className="pt-tag">
                        {entry.item.name} × {formatNumber(Number(entry.defaultQuantity))} {entry.item.unit}
                      </span>
                    ))}
                  </div>
                )}

                {editingSupplyProfile && (
                  <div className="mt-4 space-y-2">
                    {supplyProfileDraft.map((entry, index) => (
                      <div key={index} className="flex flex-wrap items-center gap-2">
                        <FilterSelect
                          className="min-w-[10rem]"
                          aria-label={t("المادة", "Item")}
                          value={entry.itemId}
                          onChange={(itemId) => setSupplyProfileDraft((prev) => prev.map((row, i) => (i === index ? { ...row, itemId } : row)))}
                          options={inventoryItems.map((item) => ({ id: item.id, label: `${item.name} (${item.unit})` }))}
                        />
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={entry.defaultQuantity}
                          onChange={(e) => setSupplyProfileDraft((prev) => prev.map((row, i) => (i === index ? { ...row, defaultQuantity: Number(e.target.value) } : row)))}
                          className="w-24 border border-border text-sm"
                        />
                        <button onClick={() => setSupplyProfileDraft((prev) => prev.filter((_, i) => i !== index))} className="text-xs font-semibold text-danger hover:underline">
                          {t("حذف", "Remove")}
                        </button>
                      </div>
                    ))}

                    <button onClick={() => setSupplyProfileDraft((prev) => [...prev, { itemId: inventoryItems[0]?.id ?? "", defaultQuantity: 1 }])} className="text-xs font-semibold text-muted hover:underline">
                      {t("+ إضافة مادة", "+ Add item")}
                    </button>

                    <ErrorNote message={supplyProfileError} />

                    <div className="flex gap-2 pt-2">
                      <button onClick={handleSaveSupplyProfile} className="bg-accent px-4 text-xs text-accent-foreground">{t("حفظ", "Save")}</button>
                      <button onClick={() => setEditingSupplyProfile(false)} className="rounded-md border border-border px-4 text-xs text-muted">{t("إلغاء", "Cancel")}</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {activeTab === "timeline" && (
              <>
                <p className="pt-section-label">{t("السجل الزمني", "Patient timeline")}</p>
                {timeline.length === 0 && <p className="text-sm text-muted">{t("لا توجد أحداث بعد", "No events yet")}</p>}
                <ol className="space-y-3 border-s-2 border-border ps-4">
                  {timeline.map((event) => (
                    <li key={event.id} className="text-sm">
                      <p className="font-semibold text-foreground">{TIMELINE_LABELS[event.type] ? t(...TIMELINE_LABELS[event.type]) : event.type}</p>
                      <p className="text-xs text-muted">
                        {formatDate(event.performedAt, { dateStyle: "medium", timeStyle: "short" })} · {event.performedBy?.fullName ?? t("النظام", "System")}
                      </p>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
