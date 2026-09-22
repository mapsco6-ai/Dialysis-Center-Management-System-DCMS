"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { TIMELINE_LABELS } from "@/lib/timelineLabels";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import { LabTrendView } from "@/components/LabTrendView";
import {
  ClinicalNote,
  DoctorOrder,
  DoctorOrderType,
  LabOrder,
  LabPanel,
  LabTest,
  LabTrend,
  Patient,
  PatientTimelineEvent,
  Prescription,
} from "@/lib/types";

const getTabs = (t: (arabic: string, english: string) => string) => ([
  { key: "overview", label: t("نظرة عامة", "Overview") },
  { key: "dialysis", label: t("الديلزة", "Dialysis") },
  { key: "labs", label: t("المختبر", "Laboratory") },
  { key: "medications", label: t("الأدوية", "Medications") },
  { key: "orders", label: t("الأوامر الطبية", "Medical orders") },
  { key: "notes", label: t("الملاحظات", "Notes") },
  { key: "timeline", label: t("السجل الزمني", "Timeline") },
] as const);
type TabKey = ReturnType<typeof getTabs>[number]["key"];

const getOrderTypeLabels = (t: (arabic: string, english: string) => string): Record<DoctorOrderType, string> => ({
  MEDICATION: t("دواء", "Medication"),
  LAB_REQUEST: t("طلب تحليل", "Lab request"),
  NURSING_INSTRUCTION: t("تعليمات للممرض", "Nursing instruction"),
  DRY_WEIGHT_CHANGE: t("تغيير الوزن الجاف", "Change dry weight"),
  EXTRA_SESSION_REQUEST: t("طلب جلسة إضافية", "Additional session request"),
  PHARMACY_RECOMMENDATION: t("توصية للصيدلي", "Pharmacy recommendation"),
});

const getClinicalLabels = (t: (arabic: string, english: string) => string): Record<string, string> => ({
  CRITICAL: t("حرج", "Critical"),
  IMPORTANT: t("مهم", "Important"),
  INFORMATION: t("معلومات", "Information"),
  FISTULA: t("ناسور", "Fistula"),
  CATHETER: t("قسطرة", "Catheter"),
  GRAFT: t("وصلة وعائية", "Graft"),
  ACTIVE: t("نشط", "Active"),
  MODIFIED: t("معدّل", "Modified"),
  STOPPED: t("موقوف", "Stopped"),
  DISPENSING: t("قيد الصرف", "Dispensing"),
  DISPENSED: t("تم الصرف", "Dispensed"),
});

export default function DoctorPage() {
  const { t } = useI18n();
  const TABS = getTabs(t);
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
  const [labOrders, setLabOrders] = useState<LabOrder[]>([]);
  const [labTests, setLabTests] = useState<LabTest[]>([]);
  const [labPanels, setLabPanels] = useState<LabPanel[]>([]);

  async function loadPatientData(p: Patient) {
    apiFetch(`/patients/${p.id}/prescriptions`).then(setPrescriptions).catch(() => setPrescriptions([]));
    apiFetch(`/doctor-orders?patientId=${p.id}`).then(setOrders).catch(() => setOrders([]));
    apiFetch(`/patients/${p.id}/clinical-notes`).then(setNotes).catch(() => setNotes([]));
    apiFetch(`/patients/${p.id}/timeline`).then(setTimeline).catch(() => setTimeline([]));
    apiFetch(`/lab/orders?patientId=${p.id}`).then(setLabOrders).catch(() => setLabOrders([]));
    apiFetch("/lab/tests").then(setLabTests).catch(() => setLabTests([]));
    apiFetch("/lab/panels").then(setLabPanels).catch(() => setLabPanels([]));
  }

  async function handleScan(e: FormEvent) {
    e.preventDefault();
    const value = code.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    setPatient(null);
    try {
      const found = await apiFetch(`/patients/by-barcode/${encodeURIComponent(value)}`);
      setPatient(found);
      setTab("overview");
      await loadPatientData(found);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("لم يتم العثور على المريض", "Patient not found"));
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
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const canOrder = user.permissions.includes("prescription.create");
  const canModify = user.permissions.includes("prescription.modify");
  const canAdminister = user.permissions.includes("medication.administer");
  const canAlert = user.permissions.includes("patient.alert.manage");

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">{t("واجهة الطبيب — مسح المريض", "Doctor workspace — Patient scan")}</h1>

      <form onSubmit={handleScan} className="mt-4 flex max-w-md gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("امسح الباركود أو أدخله...", "Scan or enter a barcode...")}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" disabled={loading} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          {t("بحث", "Search")}
        </button>
      </form>
      <ErrorNote message={error} className="mt-3" />

      {patient && (
        <>
          <div className="mt-6 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{patient.fullName}</h2>
              <p className="text-sm text-slate-500">{patient.patientCode}</p>
            </div>
            <Link href={`/admin/care/patients/${patient.id}`} className="text-xs text-slate-500 hover:underline">
              {t("الملف الكامل", "Full patient record")}
            </Link>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-200">
            {TABS.map((entry) => (
              <button
                key={entry.key}
                onClick={() => setTab(entry.key)}
                className={`rounded-t-md px-3 py-2 text-sm font-medium ${
                  tab === entry.key ? "border-b-2 border-slate-800 text-slate-800" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>

          <div className="mt-4">
            {tab === "overview" && (
              <OverviewTab patient={patient} canOrder={canOrder} canAlert={canAlert} onChanged={() => { refreshPatient(); refreshAll(); }} />
            )}
            {tab === "dialysis" && <DialysisTab patientId={patient.id} />}
            {tab === "labs" && (
              <LabsTab
                patientId={patient.id}
                labOrders={labOrders}
                labTests={labTests}
                labPanels={labPanels}
                canRequest={user.permissions.includes("lab.request")}
                onChanged={refreshAll}
              />
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
  const { t, formatNumber } = useI18n();
  const clinicalLabels = getClinicalLabels(t);
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
      setError(err instanceof Error ? err.message : t("تعذر تغيير الوزن الجاف", "Unable to change dry weight"));
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
      setError(err instanceof Error ? err.message : t("تعذر إضافة التنبيه", "Unable to add alert"));
    } finally {
      setBusy(false);
    }
  }

  const openAlerts = (patient.alerts ?? []).filter((a) => !a.resolvedAt);

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />
      <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          <div><span className="text-slate-400">{t("الجنس:", "Sex:")}</span> {patient.gender === "MALE" ? t("ذكر", "Male") : t("أنثى", "Female")}</div>
          <div><span className="text-slate-400">{t("الوزن الجاف:", "Dry weight:")}</span> {patient.dryWeight != null ? formatNumber(Number(patient.dryWeight)) : "-"}</div>
          <div><span className="text-slate-400">{t("نوع الوصول الوعائي:", "Vascular access type:")}</span> {patient.vascularAccessType ? clinicalLabels[patient.vascularAccessType] ?? patient.vascularAccessType : "-"}</div>
          <div><span className="text-slate-400">{t("الأمراض المزمنة:", "Chronic conditions:")}</span> {(patient.chronicDiseases ?? []).join(t("، ", ", ")) || "-"}</div>
          <div><span className="text-slate-400">{t("الحساسية:", "Allergies:")}</span> {patient.allergies ?? "-"}</div>
          <div><span className="text-slate-400">{t("التشخيص:", "Diagnosis:")}</span> {patient.diagnoses ?? "-"}</div>
        </div>
        {canOrder && (
          <div className="mt-3">
            {!showDryWeight ? (
              <button onClick={() => setShowDryWeight(true)} className="text-xs font-medium text-slate-600 hover:underline">
                {t("تغيير الوزن الجاف", "Change dry weight")}
              </button>
            ) : (
              <form onSubmit={handleDryWeight} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                <input name="newDryWeight" type="number" step="0.1" required placeholder={t("الوزن الجاف الجديد", "New dry weight")} className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <input name="reason" placeholder={t("السبب (اختياري)", "Reason (optional)")} className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">{t("حفظ", "Save")}</button>
                <button type="button" onClick={() => setShowDryWeight(false)} className="text-xs text-slate-400">{t("إلغاء", "Cancel")}</button>
              </form>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">{t("التنبيهات السريرية المفتوحة", "Open clinical alerts")}</h2>
        {openAlerts.length === 0 ? (
          <p className="text-sm text-slate-400">{t("لا توجد تنبيهات مفتوحة", "No open alerts")}</p>
        ) : (
          <ul className="space-y-1">
            {openAlerts.map((a) => (
              <li key={a.id} className={`rounded-md border px-3 py-1.5 text-xs ${a.severity === "CRITICAL" ? "border-red-300 bg-red-50 text-red-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
                [{clinicalLabels[a.severity] ?? a.severity}] {a.category}: {a.message}
              </li>
            ))}
          </ul>
        )}
        {canAlert && (
          <div className="mt-3">
            {!showAlert ? (
              <button onClick={() => setShowAlert(true)} className="text-xs font-medium text-slate-600 hover:underline">
                {t("+ إضافة تنبيه سريري", "+ Add clinical alert")}
              </button>
            ) : (
              <form onSubmit={handleAlert} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                <select name="severity" className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                  <option value="CRITICAL">{clinicalLabels.CRITICAL}</option>
                  <option value="IMPORTANT">{clinicalLabels.IMPORTANT}</option>
                  <option value="INFORMATION">{clinicalLabels.INFORMATION}</option>
                </select>
                <input name="category" required placeholder={t("التصنيف", "Category")} className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <input name="message" required placeholder={t("الرسالة", "Message")} className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">{t("حفظ", "Save")}</button>
                <button type="button" onClick={() => setShowAlert(false)} className="text-xs text-slate-400">{t("إلغاء", "Cancel")}</button>
              </form>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function DialysisTab({ patientId }: { patientId: string }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
      <p>{t("راجع جدول الديلزة والجلسات النشطة لهذا المريض من الشاشات المخصصة:", "View this patient's dialysis schedule and active sessions in the following pages:")}</p>
      <div className="mt-2 flex gap-4">
        <Link href="/admin/care/appointments" className="text-slate-700 hover:underline">{t("الجدول اليومي", "Daily schedule")}</Link>
        <Link href={`/admin/care/patients/${patientId}`} className="text-slate-700 hover:underline">{t("ملف المريض", "Patient record")}</Link>
      </div>
    </div>
  );
}

const getLabItemStatusLabels = (t: (arabic: string, english: string) => string): Record<string, string> => ({
  ORDERED: t("بانتظار سحب العينة", "Awaiting sample"),
  SAMPLE_COLLECTED: t("تم سحب العينة", "Sample collected"),
  PROCESSING: t("قيد المعالجة", "Processing"),
  RESULT_ENTERED: t("أُدخلت النتيجة", "Result entered"),
  FINAL: t("نهائية", "Final"),
  AMENDED: t("مُعدَّلة", "Amended"),
  CANCELLED: t("ملغاة", "Cancelled"),
});

function LabsTab({
  patientId,
  labOrders,
  labTests,
  labPanels,
  canRequest,
  onChanged,
}: {
  patientId: string;
  labOrders: LabOrder[];
  labTests: LabTest[];
  labPanels: LabPanel[];
  canRequest: boolean;
  onChanged: () => void;
}) {
  const { t, formatDate, formatNumber } = useI18n();
  const labItemStatusLabel = getLabItemStatusLabels(t);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const [mode, setMode] = useState<"panel" | "tests">("panel");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [trendTestId, setTrendTestId] = useState("");
  const [trend, setTrend] = useState<LabTrend | null>(null);

  async function handleRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { patientId };
      if (mode === "panel") body.labPanelId = form.get("labPanelId");
      else body.labTestIds = selectedTestIds;
      await apiFetch("/lab/orders", { method: "POST", body: JSON.stringify(body) });
      setShowRequest(false);
      setSelectedTestIds([]);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إنشاء طلب التحليل", "Unable to create lab request"));
    } finally {
      setBusy(false);
    }
  }

  async function loadTrend(testId: string) {
    setTrendTestId(testId);
    if (!testId) {
      setTrend(null);
      return;
    }
    try {
      const data = await apiFetch(`/lab/tests/${testId}/trend?patientId=${patientId}&limit=5`);
      setTrend(data);
    } catch {
      setTrend(null);
    }
  }

  function toggleTest(id: string) {
    setSelectedTestIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">{t("حلقات التحاليل (Lab Episodes)", "Lab episodes")}</h2>
          {canRequest && (
            <button onClick={() => setShowRequest((v) => !v)} className="text-xs font-medium text-slate-600 hover:underline">
              {t("+ طلب تحليل", "+ Request lab test")}
            </button>
          )}
        </div>

        {showRequest && (
          <form onSubmit={handleRequest} className="mt-2 space-y-2 rounded-md bg-slate-50 p-3">
            <div className="flex gap-3 text-xs">
              <label className="flex items-center gap-1">
                <input type="radio" checked={mode === "panel"} onChange={() => setMode("panel")} /> {t("مجموعة تحاليل", "Test panel")}
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={mode === "tests"} onChange={() => setMode("tests")} /> {t("تحاليل منفردة", "Individual tests")}
              </label>
            </div>
            {mode === "panel" ? (
              <select name="labPanelId" required className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs">
                <option value="">{t("اختر المجموعة...", "Select a panel...")}</option>
                {labPanels.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({formatNumber(p.tests.length)} {t("تحليل)", "tests)")}</option>
                ))}
              </select>
            ) : (
              <div className="max-h-32 overflow-y-auto rounded-md border border-slate-100 p-2">
                {labTests.map((entry) => (
                  <label key={entry.id} className="flex items-center gap-2 py-0.5 text-xs">
                    <input type="checkbox" checked={selectedTestIds.includes(entry.id)} onChange={() => toggleTest(entry.id)} />
                    {entry.code} — {entry.name}
                  </label>
                ))}
              </div>
            )}
            <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">{t("إرسال الطلب", "Submit request")}</button>
          </form>
        )}

        <ul className="mt-3 space-y-2 text-sm">
          {labOrders.map((order) => (
            <li key={order.id} className="rounded-md border border-slate-100 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">
                {order.episodeCode} — {formatDate(order.orderedAt, { dateStyle: "medium", timeStyle: "short" })} — {order.orderedByDoctor?.fullName}
              </p>
              <ul className="space-y-1">
                {order.items.map((item) => (
                  <li key={item.id} className="flex items-center justify-between text-xs">
                    <span>
                      {item.labTest.name}: {item.results[0] ? item.results[0].value : "-"}{" "}
                      <span className="text-slate-400">[{labItemStatusLabel[item.status] ?? item.status}]</span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {labOrders.length === 0 && <li className="text-slate-400">{t("لا توجد طلبات تحاليل بعد", "No lab requests yet")}</li>}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">{t("اتجاه القيمة عبر الزمن (Trend)", "Result trend over time")}</h2>
        <select value={trendTestId} onChange={(e) => loadTrend(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
          <option value="">{t("اختر تحليلاً...", "Select a test...")}</option>
          {labTests.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.name}</option>
          ))}
        </select>
        {trend && <LabTrendView trend={trend} testName={labTests.find((tst) => tst.id === trendTestId)?.name ?? ""} />}
      </section>
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
  const { t, formatDate, formatNumber } = useI18n();
  const clinicalLabels = getClinicalLabels(t);
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
      setError(err instanceof Error ? err.message : t("تعذر إضافة الدواء", "Unable to add medication"));
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
      setError(err instanceof Error ? err.message : t("تعذر إيقاف الدواء", "Unable to stop medication"));
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
      setError(err instanceof Error ? err.message : t("تعذر تعديل الجرعة", "Unable to change dose"));
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
      setError(err instanceof Error ? err.message : t("تعذر تسجيل الإعطاء", "Unable to record administration"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ErrorNote message={error} />

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500">{t("الأدوية الحالية (PRESCRIBED)", "Current prescriptions")}</h2>
          {canOrder && (
            <button onClick={() => setShowAdd((v) => !v)} className="text-xs font-medium text-slate-600 hover:underline">
              {t("+ إضافة دواء", "+ Add medication")}
            </button>
          )}
        </div>
        {showAdd && (
          <form onSubmit={handleAdd} className="mt-2 space-y-2 rounded-md bg-slate-50 p-3">
            <input name="medicationName" required placeholder={t("اسم الدواء", "Medication name")} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input name="dose" required placeholder={t("الجرعة", "Dose")} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input name="frequency" required placeholder={t("التكرار", "Frequency")} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input name="duration" placeholder={t("المدة (اختياري)", "Duration (optional)")} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">{t("حفظ", "Save")}</button>
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
                        {t("تعديل الجرعة", "Change dose")}
                      </button>
                    )}
                    {canModify && orderId && (
                      <button onClick={() => handleStop(orderId, "أوقفه الطبيب")} className="text-xs text-red-600 hover:underline">
                        {t("إيقاف", "Stop")}
                      </button>
                    )}
                    {canAdminister && (
                      <button onClick={() => setAdministeringId(administeringId === p.id ? null : p.id)} className="text-xs text-emerald-600 hover:underline">
                        {t("تسجيل إعطاء", "Record administration")}
                      </button>
                    )}
                  </div>
                </div>
                {modifyingId === p.id && orderId && (
                  <form onSubmit={(e) => handleModify(e, orderId)} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                    <input name="newDose" required placeholder={t("الجرعة الجديدة", "New dose")} className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <input name="reason" required placeholder={t("سبب التعديل", "Reason for amendment")} className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">{t("حفظ", "Save")}</button>
                  </form>
                )}
                {administeringId === p.id && (
                  <form onSubmit={(e) => handleAdminister(e, p.id)} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 p-2">
                    <input name="doseGiven" required placeholder={t("الجرعة المُعطاة فعلياً", "Actual dose administered")} className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                    <button type="submit" disabled={busy} className="rounded bg-emerald-600 px-3 py-1 text-xs text-white disabled:opacity-50">{t("تأكيد", "Confirm")}</button>
                  </form>
                )}
                {(p.dispenses ?? []).length > 0 && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t("آخر صرف:", "Last dispensed:")} {p.dispenses![0].item?.name} × {formatNumber(Number(p.dispenses![0].quantity))} {t("بواسطة", "by")} {p.dispenses![0].dispensedBy?.fullName ?? "-"} ({formatDate(p.dispenses![0].dispensedAt, { dateStyle: "medium", timeStyle: "short" })})
                  </p>
                )}
                {(p.administrations ?? []).length > 0 && (
                  <p className="mt-1 text-xs text-slate-400">
                    {t("آخر إعطاء:", "Last administered:")} {formatDate(p.administrations![0].administeredAt, { dateStyle: "medium", timeStyle: "short" })} {t("بواسطة", "by")} {p.administrations![0].administeredBy?.fullName ?? "-"}
                  </p>
                )}
              </li>
            );
          })}
          {current.length === 0 && <li className="text-sm text-slate-400">{t("لا توجد أدوية حالية", "No current medications")}</li>}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">{t("السابقة / الموقوفة", "Previous / stopped")}</h2>
        <ul className="space-y-1 text-sm">
          {history.map((p) => (
            <li key={p.id} className="text-slate-500">
              <span className={p.status === "STOPPED" ? "text-red-500" : "text-amber-500"}>[{clinicalLabels[p.status] ?? p.status}]</span>{" "}
              {p.medicationName} — {p.dose} / {p.frequency}
            </li>
          ))}
          {history.length === 0 && <li className="text-slate-400">{t("لا يوجد سجل بعد", "No history yet")}</li>}
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
  const { t, formatDate } = useI18n();
  const clinicalLabels = getClinicalLabels(t);
  const orderTypeLabel = getOrderTypeLabels(t);
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
      setError(err instanceof Error ? err.message : t("تعذر إضافة الأمر", "Unable to add order"));
    } finally {
      setBusy(false);
    }
  }

  async function handleStop(orderId: string) {
    const reason = window.prompt(t("سبب الإيقاف؟", "Reason for stopping?"));
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/doctor-orders/${orderId}/stop`, { method: "POST", body: JSON.stringify({ reason }) });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إيقاف الأمر", "Unable to stop order"));
    } finally {
      setBusy(false);
    }
  }

  const nonMedicationTypes: DoctorOrderType[] = [
    "NURSING_INSTRUCTION",
    "EXTRA_SESSION_REQUEST",
    "PHARMACY_RECOMMENDATION",
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <ErrorNote message={error} className="mb-2" />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">{t("كل الأوامر الطبية", "All medical orders")}</h2>
        {canOrder && (
          <button onClick={() => setShowAdd((v) => !v)} className="text-xs font-medium text-slate-600 hover:underline">
            {t("+ أمر جديد", "+ New order")}
          </button>
        )}
      </div>
      {showAdd && (
        <form onSubmit={handleAdd} className="mt-2 space-y-2 rounded-md bg-slate-50 p-3">
          <select value={orderType} onChange={(e) => setOrderType(e.target.value as DoctorOrderType)} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs">
            {nonMedicationTypes.map((entry) => (
              <option key={entry} value={entry}>{orderTypeLabel[entry]}</option>
            ))}
          </select>
          <textarea name="detail" required placeholder={t("التفاصيل", "Details")} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" rows={2} />
          <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">{t("حفظ", "Save")}</button>
        </form>
      )}

      <ul className="mt-3 space-y-2 text-sm">
        {orders.map((o) => (
          <li key={o.id} className="rounded-md border border-slate-100 p-2">
            <div className="flex items-center justify-between">
              <span>
                <span className="font-medium text-slate-700">[{orderTypeLabel[o.type]}]</span>{" "}
                <span className={o.status === "STOPPED" ? "text-red-500" : o.status === "MODIFIED" ? "text-amber-500" : "text-emerald-600"}>
                  {clinicalLabels[o.status] ?? o.status}
                </span>{" "}
                — {formatDate(o.createdAt, { dateStyle: "medium", timeStyle: "short" })} — {o.doctor?.fullName}
              </span>
              {canModify && o.status === "ACTIVE" && (
                <button onClick={() => handleStop(o.id)} className="text-xs text-red-600 hover:underline">{t("إيقاف", "Stop")}</button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">{JSON.stringify(o.payload)}</p>
            {o.reason && <p className="text-xs text-slate-400">{t("السبب:", "Reason:")} {o.reason}</p>}
          </li>
        ))}
        {orders.length === 0 && <li className="text-slate-400">{t("لا توجد أوامر بعد", "No orders yet")}</li>}
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
  const { t, formatDate } = useI18n();
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
      setError(err instanceof Error ? err.message : t("تعذر حفظ الملاحظة", "Unable to save note"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <ErrorNote message={error} className="mb-2" />
      {canWrite && (
        <form onSubmit={handleSubmit} className="mb-4 flex items-start gap-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={t("ملاحظة طبية...", "Clinical note...")} className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm" rows={2} />
          <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">{t("حفظ", "Save")}</button>
        </form>
      )}
      <ul className="space-y-2 text-sm">
        {notes.map((n) => (
          <li key={n.id} className="rounded-md border border-slate-100 p-2">
            <p className="text-slate-700">{n.text}</p>
            <p className="mt-1 text-xs text-slate-400">{n.author?.fullName} — {formatDate(n.createdAt, { dateStyle: "medium", timeStyle: "short" })}</p>
          </li>
        ))}
        {notes.length === 0 && <li className="text-slate-400">{t("لا توجد ملاحظات بعد", "No notes yet")}</li>}
      </ul>
    </section>
  );
}

function TimelineTab({ timeline }: { timeline: PatientTimelineEvent[] }) {
  const { t, formatDate } = useI18n();
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <ul className="space-y-2 text-sm">
        {timeline.map((entry) => (
          <li key={entry.id} className="border-b border-slate-50 pb-2">
            <span className="font-medium text-slate-700">{TIMELINE_LABELS[entry.type] ? t(...TIMELINE_LABELS[entry.type]) : entry.type}</span>{" "}
            <span className="text-xs text-slate-400">— {formatDate(entry.performedAt, { dateStyle: "medium", timeStyle: "short" })} — {entry.performedBy?.fullName ?? t("النظام", "System")}</span>
          </li>
        ))}
        {timeline.length === 0 && <li className="text-slate-400">{t("لا يوجد سجل بعد", "No history yet")}</li>}
      </ul>
    </section>
  );
}
