"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import {
  ClinicalNote,
  DoctorOrder,
  DoctorOrderType,
  Patient,
  PatientTimelineEvent,
  Prescription,
} from "@/lib/types";

const TABS = [
  { key: "overview", label: "نظرة عامة" },
  { key: "dialysis", label: "الديلزة" },
  { key: "labs", label: "المختبر" },
  { key: "medications", label: "الأدوية" },
  { key: "orders", label: "الأوامر الطبية" },
  { key: "notes", label: "الملاحظات" },
  { key: "timeline", label: "السجل الزمني" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const orderTypeLabel: Record<DoctorOrderType, string> = {
  MEDICATION: "دواء",
  LAB_REQUEST: "طلب تحليل",
  NURSING_INSTRUCTION: "تعليمات للممرض",
  DRY_WEIGHT_CHANGE: "تغيير الوزن الجاف",
  EXTRA_SESSION_REQUEST: "طلب جلسة إضافية",
  PHARMACY_RECOMMENDATION: "توصية للصيدلي",
};

export default function DoctorPage() {
  const user = useCurrentUser();
  const [code, setCode] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [orders, setOrders] = useState<DoctorOrder[]>([]);
  const [notes, setNotes] = useState<ClinicalNote[]>([]);
  const [timeline, setTimeline] = useState<PatientTimelineEvent[]>([]);

  async function loadPatientData(p: Patient) {
    apiFetch(`/patients/${p.id}/prescriptions`).then(setPrescriptions).catch(() => setPrescriptions([]));
    apiFetch(`/doctor-orders?patientId=${p.id}`).then(setOrders).catch(() => setOrders([]));
    apiFetch(`/patients/${p.id}/clinical-notes`).then(setNotes).catch(() => setNotes([]));
    apiFetch(`/patients/${p.id}/timeline`).then(setTimeline).catch(() => setTimeline([]));
  }

  async function handleScan(e: FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setPatient(null);
    try {
      const found = await apiFetch(`/patients/barcode/${encodeURIComponent(value)}`);
      setPatient(found);
      setTab("overview");
      await loadPatientData(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : "لم يتم العثور على المريض");
    } finally {
      setLoading(false);
    }
  }

  function refreshAll() {
    if (patient) loadPatientData(patient);
  }

  function refreshPatient() {
    if (!patient) return;
    apiFetch(`/patients/${patient.id}`).then(setPatient).catch(() => undefined);
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  const canOrder = user.permissions.includes("prescription.create");
  const canModify = user.permissions.includes("prescription.modify");
  const canAdminister = user.permissions.includes("medication.administer");
  const canAlert = user.permissions.includes("patient.alert.manage");

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">واجهة الطبيب — مسح المريض</h1>

      <form onSubmit={handleScan} className="mt-4 flex max-w-md gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="امسح الباركود أو أدخله..."
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" disabled={loading} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          بحث
        </button>
      </form>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {patient && (
        <>
          <div className="mt-6 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{patient.fullName}</h2>
              <p className="text-sm text-slate-500">{patient.patientCode}</p>
            </div>
            <Link href={`/admin/patients/${patient.id}`} className="text-xs text-slate-500 hover:underline">
              الملف الكامل
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-t-md px-3 py-2 text-sm font-medium ${
                  tab === t.key ? "border-b-2 border-slate-800 text-slate-800" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "overview" && (
              <OverviewTab patient={patient} canOrder={canOrder} canAlert={canAlert} onChanged={() => { refreshPatient(); refreshAll(); }} />
            )}
            {tab === "dialysis" && <DialysisTab patientId={patient.id} />}
            {tab === "labs" && (
              <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-400">
                غير متاح بعد - سيُبنى في الفيز 9 (المختبر).
              </p>
            )}
            {tab === "medications" && (
              <MedicationsTab
                patientId={patient.id}
                prescriptions={prescriptions}
                canOrder={canOrder}
                canModify={canModify}
                canAdminister={canAdminister}
                onChanged={refreshAll}
              />
            )}
            {tab === "orders" && (
              <OrdersTab patientId={patient.id} orders={orders} canOrder={canOrder} canModify={canModify} onChanged={refreshAll} />
            )}
            {tab === "notes" && <NotesTab patientId={patient.id} notes={notes} canWrite={canOrder} onChanged={refreshAll} />}
            {tab === "timeline" && <TimelineTab timeline={timeline} />}
          </div>
        </>
      )}
    </AdminShell>
  );
}

function OverviewTab({
  patient,
  canOrder,
  canAlert,
  onChanged,
}: {
  patient: Patient;
  canOrder: boolean;
  canAlert: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDryWeight, setShowDryWeight] = useState(false);
  const [showAlert, setShowAlert] = useState(false);

  async function handleDryWeight(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/doctor-orders", {
        method: "POST",
        body: JSON.stringify({
          patientId: patient.id,
          type: "DRY_WEIGHT_CHANGE",
          payload: { newDryWeight: Number(form.get("newDryWeight")) },
          reason: form.get("reason") || undefined,
        }),
      });
      setShowDryWeight(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تغيير الوزن الجاف");
    } finally {
      setBusy(false);
    }
  }

  async function handleAlert(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/patients/${patient.id}/alerts`, {
        method: "POST",
        body: JSON.stringify({ severity: form.get("severity"), category: form.get("category"), message: form.get("message") }),
      });
      setShowAlert(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إضافة التنبيه");
    } finally {
      setBusy(false);
    }
  }

  const openAlerts = (patient.alerts ?? []).filter((a) => !a.resolvedAt);

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <div><span className="text-slate-400">الجنس:</span> {patient.gender === "MALE" ? "ذكر" : "أنثى"}</div>
          <div><span className="text-slate-400">الوزن الجاف:</span> {patient.dryWeight ?? "-"}</div>
          <div><span className="text-slate-400">نوع الوصول الوعائي:</span> {patient.vascularAccessType ?? "-"}</div>
          <div><span className="text-slate-400">الأمراض المزمنة:</span> {(patient.chronicDiseases ?? []).join("، ") || "-"}</div>
          <div><span className="text-slate-400">الحساسية:</span> {patient.allergies ?? "-"}</div>
          <div><span className="text-slate-400">التشخيص:</span> {patient.diagnoses ?? "-"}</div>
        </div>
        {canOrder && (
          <div className="mt-3">
            {!showDryWeight ? (
              <button onClick={() => setShowDryWeight(true)} className="text-xs font-medium text-slate-600 hover:underline">
                تغيير الوزن الجاف
              </button>
            ) : (
              <form onSubmit={handleDryWeight} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                <input name="newDryWeight" type="number" step="0.1" required placeholder="الوزن الجاف الجديد" className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <input name="reason" placeholder="السبب (اختياري)" className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">حفظ</button>
                <button type="button" onClick={() => setShowDryWeight(false)} className="text-xs text-slate-400">إلغاء</button>
              </form>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">التنبيهات السريرية المفتوحة</h2>
        {openAlerts.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد تنبيهات مفتوحة</p>
        ) : (
          <ul className="space-y-1">
            {openAlerts.map((a) => (
              <li key={a.id} className={`rounded-md border px-3 py-1.5 text-xs ${a.severity === "CRITICAL" ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
                [{a.severity}] {a.category}: {a.message}
              </li>
            ))}
          </ul>
        )}
        {canAlert && (
          <div className="mt-3">
            {!showAlert ? (
              <button onClick={() => setShowAlert(true)} className="text-xs font-medium text-slate-600 hover:underline">
                + إضافة تنبيه سريري
              </button>
            ) : (
              <form onSubmit={handleAlert} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                <select name="severity" className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="IMPORTANT">IMPORTANT</option>
                  <option value="INFORMATION">INFORMATION</option>
                </select>
                <input name="category" required placeholder="التصنيف" className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <input name="message" required placeholder="الرسالة" className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">حفظ</button>
                <button type="button" onClick={() => setShowAlert(false)} className="text-xs text-slate-400">إلغاء</button>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DialysisTab({ patientId }: { patientId: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
      <p>راجع جدول الديلزة والجلسات النشطة لهذا المريض من الشاشات المخصصة:</p>
      <div className="mt-2 flex gap-4">
        <Link href="/admin/schedule" className="text-slate-700 hover:underline">الجدول اليومي</Link>
        <Link href={`/admin/patients/${patientId}`} className="text-slate-700 hover:underline">ملف المريض</Link>
      </div>
    </div>
  );
}

function MedicationsTab({
  patientId,
  prescriptions,
  canOrder,
  canModify,
  canAdminister,
  onChanged,
}: {
  patientId: string;
  prescriptions: Prescription[];
  canOrder: boolean;
  canModify: boolean;
  canAdminister: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [modifyingId, setModifyingId] = useState<string | null>(null);
  const [administeringId, setAdministeringId] = useState<string | null>(null);

  const current = prescriptions.filter((p) => p.status === "ACTIVE");
  const history = prescriptions.filter((p) => p.status !== "ACTIVE");

  function activeOrderId(p: Prescription) {
    return p.orders?.find((o) => o.status === "ACTIVE")?.id;
  }

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/doctor-orders", {
        method: "POST",
        body: JSON.stringify({
          patientId,
          type: "MEDICATION",
          payload: {
            medicationName: form.get("medicationName"),
            dose: form.get("dose"),
            frequency: form.get("frequency"),
            duration: form.get("duration") || undefined,
          },
        }),
      });
      setShowAdd(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إضافة الدواء");
    } finally {
      setBusy(false);
    }
  }

  async function handleStop(orderId: string, reason: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/doctor-orders/${orderId}/stop`, { method: "POST", body: JSON.stringify({ reason }) });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إيقاف الدواء");
    } finally {
      setBusy(false);
    }
  }

  async function handleModify(e: FormEvent<HTMLFormElement>, orderId: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/doctor-orders/${orderId}/modify`, {
        method: "POST",
        body: JSON.stringify({ reason: form.get("reason"), payload: { dose: form.get("newDose") } }),
      });
      setModifyingId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تعديل الجرعة");
    } finally {
      setBusy(false);
    }
  }

  async function handleAdminister(e: FormEvent<HTMLFormElement>, prescriptionId: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/prescriptions/${prescriptionId}/administrations`, {
        method: "POST",
        body: JSON.stringify({ doseGiven: form.get("doseGiven") }),
      });
      setAdministeringId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل الإعطاء");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">الأدوية الحالية (PRESCRIBED)</h2>
          {canOrder && (
            <button onClick={() => setShowAdd((v) => !v)} className="text-xs font-medium text-slate-600 hover:underline">
              + إضافة دواء
            </button>
          )}
        </div>
        {showAdd && (
          <form onSubmit={handleAdd} className="mt-2 space-y-2 rounded-md bg-slate-50 p-3">
            <input name="medicationName" required placeholder="اسم الدواء" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input name="dose" required placeholder="الجرعة" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input name="frequency" required placeholder="التكرار" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input name="duration" placeholder="المدة (اختياري)" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">حفظ</button>
          </form>
        )}

        <ul className="mt-3 space-y-2">
          {current.map((p) => {
            const orderId = activeOrderId(p);
            return (
              <li key={p.id} className="rounded-md border border-slate-100 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    <span className="font-medium text-slate-800">{p.medicationName}</span> — {p.dose} / {p.frequency}
                    {p.duration ? ` / ${p.duration}` : ""}
                  </span>
                  <div className="flex gap-2">
                    {canModify && orderId && (
                      <button onClick={() => setModifyingId(modifyingId === p.id ? null : p.id)} className="text-xs text-slate-500 hover:underline">
                        تعديل الجرعة
                      </button>
                    )}
                    {canModify && orderId && (
                      <button onClick={() => handleStop(orderId, "أوقفه الطبيب")} className="text-xs text-red-600 hover:underline">
                        إيقاف
                      </button>
                    )}
                    {canAdminister && (
                      <button onClick={() => setAdministeringId(administeringId === p.id ? null : p.id)} className="text-xs text-emerald-600 hover:underline">
                        تسجيل إعطاء
                      </button>
                    )}
                  </div>
                </div>
                {modifyingId === p.id && orderId && (
                  <form onSubmit={(e) => handleModify(e, orderId)} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                    <input name="newDose" required placeholder="الجرعة الجديدة" className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <input name="reason" required placeholder="سبب التعديل" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">حفظ</button>
                  </form>
                )}
                {administeringId === p.id && (
                  <form onSubmit={(e) => handleAdminister(e, p.id)} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 p-2">
                    <input name="doseGiven" required placeholder="الجرعة المُعطاة فعلياً" className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <button type="submit" disabled={busy} className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50">تأكيد</button>
                  </form>
                )}
                {(p.administrations ?? []).length > 0 && (
                  <p className="mt-1 text-xs text-slate-400">
                    آخر إعطاء: {new Date(p.administrations![0].administeredAt).toLocaleString()} بواسطة {p.administrations![0].administeredBy?.fullName ?? "-"}
                  </p>
                )}
              </li>
            );
          })}
          {current.length === 0 && <li className="text-sm text-slate-400">لا توجد أدوية حالية</li>}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">السابقة / الموقوفة</h2>
        <ul className="space-y-1 text-sm">
          {history.map((p) => (
            <li key={p.id} className="text-slate-500">
              <span className={p.status === "STOPPED" ? "text-red-500" : "text-amber-500"}>[{p.status}]</span>{" "}
              {p.medicationName} — {p.dose} / {p.frequency}
            </li>
          ))}
          {history.length === 0 && <li className="text-slate-400">لا يوجد سجل بعد</li>}
        </ul>
      </section>
    </div>
  );
}

function OrdersTab({
  patientId,
  orders,
  canOrder,
  canModify,
  onChanged,
}: {
  patientId: string;
  orders: DoctorOrder[];
  canOrder: boolean;
  canModify: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [orderType, setOrderType] = useState<DoctorOrderType>("NURSING_INSTRUCTION");

  async function handleAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    let payload: Record<string, unknown> = {};
    if (orderType === "NURSING_INSTRUCTION") payload = { instruction: form.get("detail") };
    else payload = { details: form.get("detail") };

    setBusy(true);
    setError(null);
    try {
      await apiFetch("/doctor-orders", {
        method: "POST",
        body: JSON.stringify({ patientId, type: orderType, payload }),
      });
      setShowAdd(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إضافة الأمر");
    } finally {
      setBusy(false);
    }
  }

  async function handleStop(orderId: string) {
    const reason = window.prompt("سبب الإيقاف؟");
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/doctor-orders/${orderId}/stop`, { method: "POST", body: JSON.stringify({ reason }) });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إيقاف الأمر");
    } finally {
      setBusy(false);
    }
  }

  const nonMedicationTypes: DoctorOrderType[] = [
    "NURSING_INSTRUCTION",
    "LAB_REQUEST",
    "EXTRA_SESSION_REQUEST",
    "PHARMACY_RECOMMENDATION",
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">كل الأوامر الطبية</h2>
        {canOrder && (
          <button onClick={() => setShowAdd((v) => !v)} className="text-xs font-medium text-slate-600 hover:underline">
            + أمر جديد
          </button>
        )}
      </div>
      {showAdd && (
        <form onSubmit={handleAdd} className="mt-2 space-y-2 rounded-md bg-slate-50 p-3">
          <select value={orderType} onChange={(e) => setOrderType(e.target.value as DoctorOrderType)} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs">
            {nonMedicationTypes.map((t) => (
              <option key={t} value={t}>{orderTypeLabel[t]}</option>
            ))}
          </select>
          <textarea name="detail" required placeholder="التفاصيل" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" rows={2} />
          <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">حفظ</button>
        </form>
      )}

      <ul className="mt-3 space-y-2 text-sm">
        {orders.map((o) => (
          <li key={o.id} className="rounded-md border border-slate-100 p-2">
            <div className="flex items-center justify-between">
              <span>
                <span className="font-medium text-slate-700">[{orderTypeLabel[o.type]}]</span>{" "}
                <span className={o.status === "STOPPED" ? "text-red-500" : o.status === "MODIFIED" ? "text-amber-500" : "text-emerald-600"}>
                  {o.status}
                </span>{" "}
                — {new Date(o.createdAt).toLocaleString()} — {o.doctor?.fullName}
              </span>
              {canModify && o.status === "ACTIVE" && (
                <button onClick={() => handleStop(o.id)} className="text-xs text-red-600 hover:underline">إيقاف</button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{JSON.stringify(o.payload)}</p>
            {o.reason && <p className="text-xs text-slate-400">السبب: {o.reason}</p>}
          </li>
        ))}
        {orders.length === 0 && <li className="text-slate-400">لا توجد أوامر بعد</li>}
      </ul>
    </section>
  );
}

function NotesTab({
  patientId,
  notes,
  canWrite,
  onChanged,
}: {
  patientId: string;
  notes: ClinicalNote[];
  canWrite: boolean;
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/patients/${patientId}/clinical-notes`, { method: "POST", body: JSON.stringify({ text: text.trim() }) });
      setText("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ الملاحظة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {canWrite && (
        <form onSubmit={handleSubmit} className="mb-4 flex items-start gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="ملاحظة طبية..." className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
          <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">حفظ</button>
        </form>
      )}
      <ul className="space-y-2 text-sm">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border border-slate-100 p-2">
            <p className="text-slate-700">{n.text}</p>
            <p className="mt-1 text-xs text-slate-400">{n.author?.fullName} — {new Date(n.createdAt).toLocaleString()}</p>
          </li>
        ))}
        {notes.length === 0 && <li className="text-slate-400">لا توجد ملاحظات بعد</li>}
      </ul>
    </section>
  );
}

function TimelineTab({ timeline }: { timeline: PatientTimelineEvent[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <ul className="space-y-2 text-sm">
        {timeline.map((t) => (
          <li key={t.id} className="border-b border-slate-50 pb-2">
            <span className="font-medium text-slate-700">{t.type}</span>{" "}
            <span className="text-xs text-slate-400">— {new Date(t.performedAt).toLocaleString()} — {t.performedBy?.fullName ?? "النظام"}</span>
          </li>
        ))}
        {timeline.length === 0 && <li className="text-slate-400">لا يوجد سجل بعد</li>}
      </ul>
    </section>
  );
}
