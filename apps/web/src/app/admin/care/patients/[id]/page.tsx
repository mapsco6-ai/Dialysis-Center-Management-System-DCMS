"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { TIMELINE_LABELS } from "@/lib/timelineLabels";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import {
  DialysisPlanEntry,
  InventoryItem,
  Patient,
  PatientSupplyProfileEntry,
  PatientTimelineEvent,
  Shift,
  Weekday,
} from "@/lib/types";

const severityStyles: Record<string, string> = {
  CRITICAL: "bg-red-50 border-red-300 text-red-800",
  IMPORTANT: "bg-amber-50 border-amber-300 text-amber-800",
  INFORMATION: "bg-slate-50 border-slate-300 text-slate-700",
};

const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function InfoField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm text-slate-800">{value ?? "-"}</p>
    </div>
  );
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
    apiFetch(`/patients/${params.id}/dialysis-plan`).then(setPlan).catch(() => setPlan([]));
    apiFetch(`/patients/${params.id}/supply-profile`).then(setSupplyProfile).catch(() => setSupplyProfile([]));
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
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  if (patientError) {
    return <main className="p-8 text-red-600">{patientError}</main>;
  }

  if (!patient) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">{patient.fullName}</h1>
          <p className="text-sm text-slate-500">
            {patient.patientCode} &middot; {patient.barcode}
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {patientStatusLabel[patient.status]}
        </span>
      </div>

      {patient.alerts && patient.alerts.filter((a) => !a.resolvedAt).length > 0 && (
        <div className="mt-4 space-y-2">
          {patient.alerts
            .filter((a) => !a.resolvedAt)
            .map((alert) => (
              <div
                key={alert.id}
                className={`rounded-md border px-4 py-2 text-sm ${severityStyles[alert.severity]}`}
              >
                <span className="font-semibold">[{severityLabel[alert.severity]}]</span> {alert.category}: {alert.message}
              </div>
            ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6 md:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-500">{t("البيانات الأساسية", "Basic information")}</h2>
          <div className="grid grid-cols-2 gap-4">
            <InfoField label={t("الجنس", "Sex")} value={patient.gender === "MALE" ? t("ذكر", "Male") : t("أنثى", "Female")} />
            <InfoField label={t("تاريخ الميلاد", "Date of birth")} value={formatDate(patient.dateOfBirth, { timeZone: "UTC" })} />
            <InfoField label={t("الهاتف", "Phone")} value={patient.phone} />
            <InfoField label={t("العنوان", "Address")} value={patient.address} />
            <InfoField label={t("رقم الإضبارة", "File number")} value={patient.fileNumber} />
            <InfoField label={t("تاريخ بدء الديلزة", "Dialysis start date")} value={patient.dialysisStartDate ? formatDate(patient.dialysisStartDate, { timeZone: "UTC" }) : null} />
            <InfoField label={t("الوزن الجاف", "Dry weight")} value={patient.dryWeight != null ? formatNumber(Number(patient.dryWeight)) : null} />
            <InfoField label={t("نوع الوصول الوعائي", "Vascular access type")} value={patient.vascularAccessType ? vascularAccessLabel[patient.vascularAccessType] : null} />
            <InfoField label={t("الحساسية", "Allergies")} value={patient.allergies} />
            <InfoField label={t("الأمراض المزمنة", "Chronic conditions")} value={patient.chronicDiseases?.join(", ")} />
          </div>
          {patient.medicalNotes && (
            <div className="mt-4">
              <InfoField label={t("ملاحظات طبية", "Medical notes")} value={patient.medicalNotes} />
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">{t("التنبيهات السريرية", "Clinical alerts")}</h2>
            {user.permissions.includes("patient.alert.manage") && (
              <button
                onClick={() => setShowAlertForm((v) => !v)}
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                {t("+ تنبيه", "+ Add alert")}
              </button>
            )}
          </div>

          {showAlertForm && (
            <form onSubmit={handleCreateAlert} className="mt-3 space-y-2 rounded-md border border-slate-200 p-3">
              <select name="severity" required className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                <option value="CRITICAL">{severityLabel.CRITICAL}</option>
                <option value="IMPORTANT">{severityLabel.IMPORTANT}</option>
                <option value="INFORMATION">{severityLabel.INFORMATION}</option>
              </select>
              <input
                name="category"
                required
                placeholder={t("التصنيف (مثال: Drug Allergy)", "Category (e.g. Drug allergy)")}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <textarea
                name="message"
                required
                placeholder={t("نص التنبيه", "Alert message")}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                rows={2}
              />
              <ErrorNote message={alertError} />
              <button
                type="submit"
                className="w-full rounded-md bg-slate-800 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              >
                {t("حفظ التنبيه", "Save alert")}
              </button>
            </form>
          )}

          <ul className="mt-3 space-y-2">
            {(patient.alerts ?? []).map((alert) => (
              <li key={alert.id} className="text-xs text-slate-600">
                <span className="font-semibold">{severityLabel[alert.severity]}</span> - {alert.category}
                {alert.resolvedAt && <span className="text-slate-400"> {t("(محلول)", "(Resolved)")}</span>}
              </li>
            ))}
            {(patient.alerts ?? []).length === 0 && (
              <li className="text-xs text-slate-400">{t("لا توجد تنبيهات", "No alerts")}</li>
            )}
          </ul>
        </section>
      </div>

      {user.permissions.includes("scheduling.manage") && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">{t("خطة الغسيل الأسبوعية", "Weekly dialysis plan")}</h2>
            {!editingPlan && (
              <button onClick={startEditingPlan} className="text-xs font-medium text-slate-600 hover:underline">
                {t("تعديل الخطة", "Edit plan")}
              </button>
            )}
          </div>

          {!editingPlan && (
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.length === 0 && <p className="text-xs text-slate-400">{t("لا توجد خطة غسيل مسجّلة", "No dialysis plan recorded")}</p>}
              {plan.map((entry) => (
                <span
                  key={entry.id}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {WEEKDAY_LABELS[entry.weekday]} - {shiftLabel[entry.shift.name] ?? entry.shift.name}
                </span>
              ))}
            </div>
          )}

          {editingPlan && (
            <div className="mt-3 space-y-2">
              {planDraft.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={entry.weekday}
                    onChange={(e) =>
                      setPlanDraft((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, weekday: e.target.value as Weekday } : row)),
                      )
                    }
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    {WEEKDAYS.map((day) => (
                      <option key={day} value={day}>
                        {WEEKDAY_LABELS[day]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={entry.shiftId}
                    onChange={(e) =>
                      setPlanDraft((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, shiftId: e.target.value } : row)),
                      )
                    }
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    {shifts.map((shift) => (
                      <option key={shift.id} value={shift.id}>
                        {shiftLabel[shift.name] ?? shift.name} ({shift.dialysisStart}-{shift.dialysisEnd})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setPlanDraft((prev) => prev.filter((_, i) => i !== index))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {t("حذف", "Remove")}
                  </button>
                </div>
              ))}

              {planDraft.length < 4 && (
                <button
                  onClick={() =>
                    setPlanDraft((prev) => [...prev, { weekday: "SUN", shiftId: shifts[0]?.id ?? "" }])
                  }
                  className="text-xs font-medium text-slate-600 hover:underline"
                >
                  {t("+ إضافة يوم", "+ Add day")}
                </button>
              )}

              <ErrorNote message={planError} />

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSavePlan}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  {t("حفظ الخطة", "Save plan")}
                </button>
                <button
                  onClick={() => setEditingPlan(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  {t("إلغاء", "Cancel")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {(user.permissions.includes("inventory.view") || user.permissions.includes("inventory.manage")) && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">{t("مستلزمات الجلسة الافتراضية", "Default session supplies")}</h2>
            {!editingSupplyProfile && user.permissions.includes("inventory.manage") && (
              <button
                onClick={startEditingSupplyProfile}
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                {t("تعديل", "Edit")}
              </button>
            )}
          </div>

          {!editingSupplyProfile && (
            <div className="mt-3 flex flex-wrap gap-2">
              {supplyProfile.length === 0 && <p className="text-xs text-slate-400">{t("لا يوجد ملف مستلزمات مسجّل", "No supply profile recorded")}</p>}
              {supplyProfile.map((entry) => (
                <span key={entry.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {entry.item.name} &times; {formatNumber(Number(entry.defaultQuantity))} {entry.item.unit}
                </span>
              ))}
            </div>
          )}

          {editingSupplyProfile && (
            <div className="mt-3 space-y-2">
              {supplyProfileDraft.map((entry, index) => (
                <div key={index} className="flex items-center gap-2">
                  <select
                    value={entry.itemId}
                    onChange={(e) =>
                      setSupplyProfileDraft((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, itemId: e.target.value } : row)),
                      )
                    }
                    className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  >
                    {inventoryItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.unit})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={entry.defaultQuantity}
                    onChange={(e) =>
                      setSupplyProfileDraft((prev) =>
                        prev.map((row, i) => (i === index ? { ...row, defaultQuantity: Number(e.target.value) } : row)),
                      )
                    }
                    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm"
                  />
                  <button
                    onClick={() => setSupplyProfileDraft((prev) => prev.filter((_, i) => i !== index))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    {t("حذف", "Remove")}
                  </button>
                </div>
              ))}

              <button
                onClick={() =>
                  setSupplyProfileDraft((prev) => [...prev, { itemId: inventoryItems[0]?.id ?? "", defaultQuantity: 1 }])
                }
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                {t("+ إضافة مادة", "+ Add item")}
              </button>

              <ErrorNote message={supplyProfileError} />

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveSupplyProfile}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  {t("حفظ", "Save")}
                </button>
                <button
                  onClick={() => setEditingSupplyProfile(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  {t("إلغاء", "Cancel")}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-500">{t("السجل الزمني (Timeline)", "Patient timeline")}</h2>
        {timeline.length === 0 && <p className="text-sm text-slate-400">{t("لا توجد أحداث بعد", "No events yet")}</p>}
        <ol className="space-y-3 border-s-2 border-slate-100 ps-4">
          {timeline.map((event) => (
            <li key={event.id} className="text-sm">
              <p className="font-medium text-slate-700">{TIMELINE_LABELS[event.type] ? t(...TIMELINE_LABELS[event.type]) : event.type}</p>
              <p className="text-xs text-slate-400">
                {formatDate(event.performedAt, { dateStyle: "medium", timeStyle: "short" })} &middot;{" "}
                {event.performedBy?.fullName ?? t("النظام", "System")}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </AdminShell>
  );
}
