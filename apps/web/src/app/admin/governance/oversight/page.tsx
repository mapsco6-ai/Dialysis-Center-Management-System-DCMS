"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import { BarList, ChartCard, LineChart, StatTile, daysBetween, type DayPoint, type Tally } from "@/components/Charts";
import { PaginatedTable, type TableColumn } from "@/components/PaginatedTable";

const PAGE_SIZE = 20;

interface Summary {
  range: { from: string; to: string };
  kpis: Record<"activePatients" | "sessions" | "completedSessions" | "interruptedSessions" | "incidents" | "openIncidents" | "criticalLabResults" | "machines" | "machinesAvailable" | "complaints", number>;
  charts: Record<string, Tally> & Record<"sessionsByDay" | "interruptedByDay" | "incidentsByDay" | "activityByDay", DayPoint[]>;
}
interface TimelineRow { id: string; performedAt: string; type: string; sourceModule: string; patientCode: string; performedBy: string | null; payload: unknown }
interface Timeline { total: number; modules: Tally; data: TimelineRow[] }

const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const inputClass = "rounded-md border border-slate-300 px-2 py-1 text-sm";

// Bilingual names for the enum keys the API returns; anything unknown falls
// back to a readable version of the raw key.
const LABELS: Record<string, [string, string]> = {
  COMPLETED: ["مكتملة", "Completed"], DISCHARGED: ["مُخرج", "Discharged"], INTERRUPTED: ["مُقاطَعة", "Interrupted"], IN_DIALYSIS: ["قيد الديلزة", "In dialysis"],
  PRE_DIALYSIS: ["قبل الديلزة", "Pre-dialysis"], SUPPLIES_READY: ["مستلزمات جاهزة", "Supplies ready"], WAITING_MACHINE: ["بانتظار جهاز", "Waiting machine"], ASSIGNED: ["جهاز مُسند", "Assigned"], POST_DIALYSIS: ["ما بعد الديلزة", "Post-dialysis"],
  ACTIVE: ["نشط", "Active"], INACTIVE: ["غير نشط", "Inactive"], DECEASED: ["متوفى", "Deceased"], TRANSFERRED: ["منقول", "Transferred"], ON_HOLD: ["موقوف مؤقتاً", "On hold"], TRANSPLANTED: ["زراعة كلية", "Transplanted"],
  OPEN: ["مفتوح", "Open"], UNDER_REVIEW: ["قيد المراجعة", "Under review"], ACTION_REQUIRED: ["إجراء تصحيحي مطلوب", "Action required"], ACTION_DONE: ["نُفّذ الإجراء", "Action done"], CLOSED: ["مغلق", "Closed"],
  LOW: ["منخفضة", "Low"], MEDIUM: ["متوسطة", "Medium"], HIGH: ["عالية", "High"], CRITICAL: ["حرجة", "Critical"],
  ADVERSE_EVENT: ["حدث ضار", "Adverse event"], INFECTION: ["عدوى", "Infection"], VASCULAR_ACCESS_EVENT: ["حدث للوصول الوعائي", "Vascular access event"], HOSPITAL_TRANSFER: ["نقل لمستشفى", "Hospital transfer"], EMERGENCY_EVENT: ["حدث طارئ", "Emergency"], REPEATED_HYPOTENSION: ["هبوط ضغط متكرر", "Repeated hypotension"], MACHINE_INCIDENT: ["حادث جهاز", "Machine incident"],
  AVAILABLE: ["متاح", "Available"], IN_USE: ["قيد الاستخدام", "In use"], RESERVED: ["محجوز", "Reserved"], EMERGENCY_RESERVED: ["محجوز للطوارئ", "Emergency reserved"], APPROVAL_REQUIRED: ["بانتظار موافقة", "Approval required"], WAITING_CLEANING: ["بانتظار التنظيف", "Waiting cleaning"], CLEANING: ["تنظيف", "Cleaning"], MAINTENANCE: ["صيانة", "Maintenance"], OUT_OF_SERVICE: ["خارج الخدمة", "Out of service"], RETIRED: ["متقاعد", "Retired"],
  ASSIGNED_: ["مُسند", "Assigned"], IN_PROGRESS: ["قيد التنفيذ", "In progress"], WAITING_PART: ["بانتظار قطعة", "Waiting part"],
  ORDERED: ["مطلوب", "Ordered"], SAMPLE_COLLECTED: ["سُحبت العينة", "Sample collected"], PROCESSING: ["قيد التحليل", "Processing"], FINAL: ["نتيجة نهائية", "Final"], AMENDED: ["مُعدَّلة", "Amended"], CANCELLED: ["ملغاة", "Cancelled"], SAMPLE_REJECTED: ["عينة مرفوضة", "Sample rejected"],
  DISPENSING: ["قيد الصرف", "Dispensing"], DISPENSED: ["مصروفة", "Dispensed"], MODIFIED: ["مُعدَّلة", "Modified"], STOPPED: ["موقوفة", "Stopped"], REJECTED_BY_PHARMACY: ["رفضتها الصيدلية", "Rejected by pharmacy"],
  ACTION_NOTE: ["إجراء", "Action note"], SHIFT_REPORT: ["تقرير دوام", "Shift report"], PROBLEM: ["مشكلة", "Problem"], COMPLAINT: ["شكوى", "Complaint"], SUGGESTION: ["مقترح", "Suggestion"],
  SUBMITTED: ["مُقدَّم", "Submitted"], ACKNOWLEDGED: ["مُستلم", "Acknowledged"], RESOLVED: ["محلول", "Resolved"], REJECTED: ["مرفوض", "Rejected"],
  STAFF: ["موظف", "Staff"], PATIENT: ["مريض", "Patient"], FAMILY: ["عائلة", "Family"], UNSPECIFIED: ["غير محدد", "Unspecified"],
  REQUESTED: ["مطلوب", "Requested"], APPROVED: ["معتمد", "Approved"], ISSUED: ["صادر", "Issued"], RECEIVED: ["مُستلم", "Received"],
};

export default function OversightPage() {
  const { t, locale, formatDate, formatNumber } = useI18n();
  const user = useCurrentUser();
  const label = (key: string) => {
    const hit = LABELS[key];
    return hit ? (locale === "ar" ? hit[0] : hit[1]) : key.replaceAll("_", " ");
  };

  const [range, setRange] = useState(() => ({ from: toDateInput(new Date(Date.now() - 29 * 86_400_000)), to: toDateInput(new Date()) }));
  const [preset, setPreset] = useState<number | null>(30);
  const [module, setModule] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [range, module, type]);

  const qs = `from=${range.from}T00:00:00&to=${range.to}T23:59:59.999`;
  const summary = useApi<Summary>(user ? `/oversight/summary?${qs}` : null);
  const timeline = useApi<Timeline>(user ? `/oversight/timeline?${qs}&page=${page}&limit=${PAGE_SIZE}${module ? `&module=${module}` : ""}${type ? `&type=${type}` : ""}` : null);

  if (!user) return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;

  const applyPreset = (days: number) => {
    setPreset(days);
    setRange({ from: toDateInput(new Date(Date.now() - (days - 1) * 86_400_000)), to: toDateInput(new Date()) });
  };
  const selectDay = (day: string) => { setPreset(null); setRange({ from: day, to: day }); };

  const s = summary.data;
  const days = s ? daysBetween(new Date(`${range.from}T12:00:00`), new Date(`${range.to}T12:00:00`)) : [];
  const tally = (key: string): Tally => s?.charts[key] ?? [];
  const tableOf = (data: Tally) => ({ headers: [t("البند", "Item"), t("العدد", "Count")], rows: data.map((d) => [label(d.key), d.count]) });
  const dayTable = (series: { name: string; data: DayPoint[] }[]) => ({
    headers: [t("اليوم", "Day"), ...series.map((x) => x.name)],
    rows: days.map((d) => [d, ...series.map((x) => x.data.find((p) => p.day === d)?.count ?? 0)]),
  });

  const sessionSeries = [
    { name: t("الجلسات", "Sessions"), color: "var(--viz-1)", data: s?.charts.sessionsByDay ?? [] },
    { name: t("المقاطَعة", "Interrupted"), color: "var(--viz-2)", data: s?.charts.interruptedByDay ?? [] },
  ];
  const activitySeries = [{ name: t("إجراءات الموظفين", "Staff actions"), color: "var(--viz-1)", data: s?.charts.activityByDay ?? [] }];

  const barCards: { key: string; title: string; onSelect?: (k: string | null) => void; selected?: string | null }[] = [
    { key: "sessionsByStatus", title: t("الجلسات حسب الحالة", "Sessions by status") },
    { key: "patientsByStatus", title: t("المرضى حسب الحالة", "Patients by status") },
    { key: "incidentsByType", title: t("الحوادث حسب النوع (انقر للتصفية)", "Incidents by type (click to filter)"), onSelect: (k) => { setModule(null); setType(k ? `INCIDENT_${k}` : null); }, selected: type?.startsWith("INCIDENT_") ? type.slice(9) : null },
    { key: "incidentsBySeverity", title: t("الحوادث حسب الخطورة", "Incidents by severity") },
    { key: "incidentsByStatus", title: t("الحوادث حسب الحالة", "Incidents by status") },
    { key: "machinesByStatus", title: t("الأجهزة حسب الحالة", "Machines by status") },
    { key: "ticketsByStatus", title: t("بلاغات الصيانة", "Maintenance tickets") },
    { key: "labItemsByStatus", title: t("فحوصات المختبر", "Lab tests") },
    { key: "prescriptionsByStatus", title: t("الوصفات الطبية", "Prescriptions") },
    { key: "transfersByStatus", title: t("تحويلات المخزون", "Stock transfers") },
    { key: "entriesByType", title: t("تقارير الموظفين", "Staff reports") },
    { key: "complaintsBySource", title: t("الشكاوى حسب المصدر", "Complaints by source") },
    { key: "complaintsByStatus", title: t("الشكاوى حسب الحالة", "Complaints by status") },
    { key: "activityByRole", title: t("النشاط حسب الدور", "Activity by role") },
    { key: "staffByRole", title: t("الكادر حسب الدور", "Staff by role") },
  ];

  const columns: TableColumn<TimelineRow>[] = [
    { key: "performedAt", header: t("الوقت", "Time"), render: (r) => formatDate(r.performedAt, { dateStyle: "short", timeStyle: "short" }) },
    { key: "sourceModule", header: t("القسم", "Section"), render: (r) => r.sourceModule },
    { key: "type", header: t("الحدث", "Event"), render: (r) => <span className="font-mono text-xs">{r.type}</span> },
    { key: "patientCode", header: t("رمز المريض", "Patient code"), render: (r) => <bdi>{r.patientCode}</bdi> },
    { key: "performedBy", header: t("بواسطة", "By"), render: (r) => r.performedBy ?? "-" },
    { key: "payload", header: t("التفاصيل", "Details"), render: (r) => r.payload ? <details><summary className="cursor-pointer text-xs text-slate-500">{t("عرض", "View")}</summary><pre className="mt-1 max-w-xs overflow-x-auto whitespace-pre-wrap text-xs" dir="ltr">{JSON.stringify(r.payload, null, 1)}</pre></details> : "-" },
  ];

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">{t("لوحة الرقابة", "Oversight dashboard")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} type="button" aria-pressed={preset === d} onClick={() => applyPreset(d)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${preset === d ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
              {t(`${d} يوماً`, `${d} days`)}
            </button>
          ))}
          <input type="date" className={inputClass} value={range.from} max={range.to} onChange={(e) => { setPreset(null); setRange({ ...range, from: e.target.value }); }} aria-label={t("من", "From")} />
          <input type="date" className={inputClass} value={range.to} min={range.from} onChange={(e) => { setPreset(null); setRange({ ...range, to: e.target.value }); }} aria-label={t("إلى", "To")} />
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t("عرض للقراءة فقط: مؤشرات كل أقسام المركز والسجلات الزمنية. لا تظهر أسماء المرضى.", "Read-only view of every section and the record timeline. Patient names are never shown.")}</p>

      <ErrorNote message={summary.error} className="mt-4" />

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        {s && (
          <>
            <StatTile label={t("المرضى النشطون", "Active patients")} value={formatNumber(s.kpis.activePatients)} />
            <StatTile label={t("جلسات الفترة", "Sessions")} value={formatNumber(s.kpis.sessions)} hint={`${formatNumber(s.kpis.completedSessions)} ${t("مكتملة", "completed")}`} />
            <StatTile label={t("جلسات مقاطَعة", "Interrupted sessions")} value={formatNumber(s.kpis.interruptedSessions)} />
            <StatTile label={t("الحوادث", "Incidents")} value={formatNumber(s.kpis.incidents)} hint={`${formatNumber(s.kpis.openIncidents)} ${t("مفتوحة", "open")}`} />
            <StatTile label={t("نتائج مختبر حرجة", "Critical lab results")} value={formatNumber(s.kpis.criticalLabResults)} />
            <StatTile label={t("الأجهزة المتاحة", "Machines available")} value={`${formatNumber(s.kpis.machinesAvailable)} / ${formatNumber(s.kpis.machines)}`} />
            <StatTile label={t("الشكاوى", "Complaints")} value={formatNumber(s.kpis.complaints)} />
          </>
        )}
      </div>

      {s && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <ChartCard title={t("الجلسات يومياً (انقر يوماً للتصفية)", "Sessions per day (click a day to filter)")} table={dayTable(sessionSeries)}>
            <LineChart days={days} series={sessionSeries} onSelectDay={selectDay} />
          </ChartCard>
          <ChartCard title={t("نشاط الموظفين يومياً", "Staff activity per day")} table={dayTable(activitySeries)}>
            <LineChart days={days} series={activitySeries} onSelectDay={selectDay} />
          </ChartCard>
          {barCards.map((card) => (
            <ChartCard key={card.key} title={card.title} table={tableOf(tally(card.key))}>
              <BarList data={tally(card.key)} label={label} onSelect={card.onSelect} selected={card.selected} />
            </ChartCard>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-base font-semibold text-slate-800">{t("السجل الزمني للأحداث", "Record timeline")}</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={t("تصفية حسب القسم", "Filter by section")}>
        {[{ key: "", count: timeline.data?.modules.reduce((n, m) => n + m.count, 0) ?? 0 }, ...(timeline.data?.modules ?? [])].map((m) => (
          <button key={m.key || "all"} type="button" aria-pressed={(module ?? "") === m.key} onClick={() => setModule(m.key || null)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${(module ?? "") === m.key ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            {m.key || t("الكل", "All")} ({formatNumber(m.count)})
          </button>
        ))}
        {type && <button type="button" onClick={() => setType(null)} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs text-amber-900">{type} ✕</button>}
      </div>
      <div className="mt-3">
        <PaginatedTable columns={columns} rows={timeline.data?.data ?? null} total={timeline.data?.total ?? null} page={page} pageSize={PAGE_SIZE}
          onPageChange={setPage} loading={timeline.loading} error={timeline.error} onRetry={timeline.refresh}
          emptyTitle={t("لا توجد أحداث في هذه الفترة", "No events in this period")} rowKey={(r) => r.id} />
      </div>
    </AdminShell>
  );
}
