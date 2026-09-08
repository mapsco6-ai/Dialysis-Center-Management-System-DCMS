"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
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

const WEEKDAY_LABELS: Record<Weekday, string> = {
  SUN: "الأحد",
  MON: "الاثنين",
  TUE: "الثلاثاء",
  WED: "الأربعاء",
  THU: "الخميس",
  FRI: "الجمعة",
  SAT: "السبت",
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
      .catch((err) => setPatientError(err instanceof Error ? err.message : "تعذر تحميل ملف المريض"));
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
      setSupplyProfileError(err instanceof Error ? err.message : "تعذر حفظ ملف المستلزمات");
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
      setPlanError(err instanceof Error ? err.message : "تعذر حفظ الخطة");
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
      setAlertError(err instanceof Error ? err.message : "تعذر إضافة التنبيه");
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  if (patientError) {
    return <main className="p-8 text-red-600">{patientError}</main>;
  }

  if (!patient) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
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
          {patient.status}
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
                <span className="font-semibold">[{alert.severity}]</span> {alert.category}: {alert.message}
              </div>
            ))}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-6 md:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-500">البيانات الأساسية</h2>
          <div className="grid grid-cols-2 gap-4">
            <InfoField label="الجنس" value={patient.gender === "MALE" ? "ذكر" : "أنثى"} />
            <InfoField label="تاريخ الميلاد" value={patient.dateOfBirth?.slice(0, 10)} />
            <InfoField label="الهاتف" value={patient.phone} />
            <InfoField label="العنوان" value={patient.address} />
            <InfoField label="رقم الإضبارة" value={patient.fileNumber} />
            <InfoField label="تاريخ بدء الديلزة" value={patient.dialysisStartDate?.slice(0, 10)} />
            <InfoField label="الوزن الجاف" value={patient.dryWeight} />
            <InfoField label="نوع الوصول الوعائي" value={patient.vascularAccessType} />
            <InfoField label="الحساسية" value={patient.allergies} />
            <InfoField label="الأمراض المزمنة" value={patient.chronicDiseases?.join(", ")} />
          </div>
          {patient.medicalNotes && (
            <div className="mt-4">
              <InfoField label="ملاحظات طبية" value={patient.medicalNotes} />
            </div>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">التنبيهات السريرية</h2>
            {user.permissions.includes("patient.alert.manage") && (
              <button
                onClick={() => setShowAlertForm((v) => !v)}
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                + تنبيه
              </button>
            )}
          </div>

          {showAlertForm && (
            <form onSubmit={handleCreateAlert} className="mt-3 space-y-2 rounded-md border border-slate-200 p-3">
              <select name="severity" required className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm">
                <option value="CRITICAL">CRITICAL</option>
                <option value="IMPORTANT">IMPORTANT</option>
                <option value="INFORMATION">INFORMATION</option>
              </select>
              <input
                name="category"
                required
                placeholder="التصنيف (مثال: Drug Allergy)"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
              />
              <textarea
                name="message"
                required
                placeholder="نص التنبيه"
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                rows={2}
              />
              {alertError && <p className="text-xs text-red-600">{alertError}</p>}
              <button
                type="submit"
                className="w-full rounded-md bg-slate-800 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
              >
                حفظ التنبيه
              </button>
            </form>
          )}

          <ul className="mt-3 space-y-2">
            {(patient.alerts ?? []).map((alert) => (
              <li key={alert.id} className="text-xs text-slate-600">
                <span className="font-semibold">{alert.severity}</span> - {alert.category}
                {alert.resolvedAt && <span className="text-slate-400"> (محلول)</span>}
              </li>
            ))}
            {(patient.alerts ?? []).length === 0 && (
              <li className="text-xs text-slate-400">لا توجد تنبيهات</li>
            )}
          </ul>
        </section>
      </div>

      {user.permissions.includes("scheduling.manage") && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">خطة الغسيل الأسبوعية</h2>
            {!editingPlan && (
              <button onClick={startEditingPlan} className="text-xs font-medium text-slate-600 hover:underline">
                تعديل الخطة
              </button>
            )}
          </div>

          {!editingPlan && (
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.length === 0 && <p className="text-xs text-slate-400">لا توجد خطة غسيل مسجّلة</p>}
              {plan.map((entry) => (
                <span
                  key={entry.id}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {WEEKDAY_LABELS[entry.weekday]} - {entry.shift.name}
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
                        {shift.name} ({shift.dialysisStart}-{shift.dialysisEnd})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setPlanDraft((prev) => prev.filter((_, i) => i !== index))}
                    className="text-xs text-red-600 hover:underline"
                  >
                    حذف
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
                  + إضافة يوم
                </button>
              )}

              {planError && <p className="text-xs text-red-600">{planError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSavePlan}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  حفظ الخطة
                </button>
                <button
                  onClick={() => setEditingPlan(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {(user.permissions.includes("inventory.view") || user.permissions.includes("inventory.manage")) && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">مستلزمات الجلسة الافتراضية</h2>
            {!editingSupplyProfile && user.permissions.includes("inventory.manage") && (
              <button
                onClick={startEditingSupplyProfile}
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                تعديل
              </button>
            )}
          </div>

          {!editingSupplyProfile && (
            <div className="mt-3 flex flex-wrap gap-2">
              {supplyProfile.length === 0 && <p className="text-xs text-slate-400">لا يوجد ملف مستلزمات مسجّل</p>}
              {supplyProfile.map((entry) => (
                <span key={entry.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {entry.item.name} &times; {entry.defaultQuantity} {entry.item.unit}
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
                    حذف
                  </button>
                </div>
              ))}

              <button
                onClick={() =>
                  setSupplyProfileDraft((prev) => [...prev, { itemId: inventoryItems[0]?.id ?? "", defaultQuantity: 1 }])
                }
                className="text-xs font-medium text-slate-600 hover:underline"
              >
                + إضافة مادة
              </button>

              {supplyProfileError && <p className="text-xs text-red-600">{supplyProfileError}</p>}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveSupplyProfile}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
                >
                  حفظ
                </button>
                <button
                  onClick={() => setEditingSupplyProfile(false)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-500">السجل الزمني (Timeline)</h2>
        {timeline.length === 0 && <p className="text-sm text-slate-400">لا توجد أحداث بعد</p>}
        <ol className="space-y-3 border-r-2 border-slate-100 pr-4">
          {timeline.map((event) => (
            <li key={event.id} className="text-sm">
              <p className="font-medium text-slate-700">{event.type}</p>
              <p className="text-xs text-slate-400">
                {new Date(event.performedAt).toLocaleString("ar")} &middot;{" "}
                {event.performedBy?.fullName ?? "النظام"}
              </p>
            </li>
          ))}
        </ol>
      </section>
    </AdminShell>
  );
}
