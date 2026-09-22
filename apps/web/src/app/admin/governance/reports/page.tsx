"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { AuthenticatedUser, Machine, Patient } from "@/lib/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthIso(): string {
  return new Date().toISOString().slice(0, 7);
}

// Every report route accepts ?format=pdf|excel and otherwise returns JSON
// (docs/MODULES-SPEC.md Phase 14: export is a presentation layer only) - this
// one helper drives every export button on the page.
function ExportButtons({ path, filename }: { path: string; filename: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);

  async function download(format: "pdf" | "excel") {
    setBusy(format);
    try {
      const sep = path.includes("?") ? "&" : "?";
      const blob = await apiFetchBlob(`${path}${sep}format=${format}`);
      downloadBlob(blob, `${filename}.${format === "pdf" ? "pdf" : "xlsx"}`);
    } catch {
      window.alert(t("تعذّر تصدير التقرير", "Unable to export the report"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => download("pdf")}
        disabled={busy !== null}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        {busy === "pdf" ? "..." : "PDF"}
      </button>
      <button
        onClick={() => download("excel")}
        disabled={busy !== null}
        className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        {busy === "excel" ? "..." : "Excel"}
      </button>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-500">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function ReportRow({ label, path, filename, emptyLabel }: { label: string; path: string | null; filename: string; emptyLabel?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 first:border-t-0 first:pt-0">
      <span className="text-sm text-slate-700">{label}</span>
      {path ? <ExportButtons path={path} filename={filename} /> : <span className="text-xs text-slate-400">{emptyLabel ?? t("اختر مريضاً أولاً", "Select a patient first")}</span>}
    </div>
  );
}

function PatientPicker({ onSelect, selected }: { onSelect: (p: Patient) => void; selected: Patient | null }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Patient[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timeout = setTimeout(() => {
      apiFetch(`/patients/search?q=${encodeURIComponent(query.trim())}`)
        .then((data) => !cancelled && setResults(data))
        .catch(() => !cancelled && setResults([]));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  return (
    <div>
      <input
        value={selected ? `${selected.patientCode} - ${selected.fullName}` : query}
        onChange={(e) => {
          onSelect(null as unknown as Patient);
          setQuery(e.target.value);
        }}
        placeholder={t("ابحث برقم المريض أو الاسم...", "Search by patient number or name...")}
        className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
      />
      {results.length > 0 && !selected && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-200 text-sm">
          {results.map((p) => (
            <li
              key={p.id}
              onClick={() => {
                onSelect(p);
                setResults([]);
              }}
              className="cursor-pointer px-3 py-1.5 hover:bg-slate-100"
            >
              {p.patientCode} - {p.fullName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PatientReportsPanel() {
  const { t } = useI18n();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [month, setMonth] = useState(monthIso());

  const base = patient ? `/reports/patients/${patient.id}` : null;
  const range = `${from ? `from=${from}&` : ""}${to ? `to=${to}` : ""}`;

  return (
    <Panel title={t("تقارير المريض", "Patient reports")}>
      <PatientPicker selected={patient} onSelect={setPatient} />
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <label className="flex items-center gap-1">
          {t("من:", "From:")} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">
          {t("إلى:", "To:")} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">
          {t("الشهر:", "Month:")} <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
      </div>
      <div className="space-y-2">
        <ReportRow label={t("ملخص طبي", "Medical summary")} path={base && `${base}/summary`} filename="patient-summary" />
        <ReportRow label={t("تاريخ الجلسات", "Session history")} path={base && `${base}/session-history?${range}`} filename="patient-sessions" />
        <ReportRow label={t("تاريخ الأدوية", "Medication history")} path={base && `${base}/medication-history`} filename="patient-medications" />
        <ReportRow label={t("تاريخ المختبر", "Lab history")} path={base && `${base}/lab-history`} filename="patient-lab" />
        <ReportRow label={t("تاريخ الغياب", "Absence history")} path={base && `${base}/absences?${range}`} filename="patient-absences" />
        <ReportRow label={t("جلسات الطوارئ", "Emergency sessions")} path={base && `${base}/emergency-sessions?${range}`} filename="patient-emergency" />
        <ReportRow label={t("استهلاك المريض (شهري)", "Patient consumption (monthly)")} path={base && `${base}/consumption?month=${month}`} filename="patient-consumption" />
      </div>
    </Panel>
  );
}

function DialysisReportsPanel() {
  const { t } = useI18n();
  const [date, setDate] = useState(todayIso());
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");

  return (
    <Panel title={t("تقارير الديلزة", "Dialysis reports")}>
      <div className="flex flex-wrap items-end gap-3 text-xs text-slate-500">
        <label className="flex items-center gap-1">
          {t("اليوم:", "Day:")} <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
      </div>
      <ReportRow label={t("جلسات اليوم حسب الردهة", "Today's sessions by ward")} path={`/reports/dialysis/daily-sessions-by-ward?date=${date}`} filename="dialysis-daily" />

      <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <label className="flex items-center gap-1">
          {t("من:", "From:")} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">
          {t("إلى:", "To:")} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">
          {t("التجميع:", "Group by:")}
          <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as typeof groupBy)} className="rounded border border-slate-300 px-2 py-1">
            <option value="day">{t("يومي", "Daily")}</option>
            <option value="week">{t("أسبوعي", "Weekly")}</option>
            <option value="month">{t("شهري", "Monthly")}</option>
          </select>
        </label>
      </div>
      <ReportRow
        label={t("ملخص الجلسات (يومي/أسبوعي/شهري)", "Session summary (daily / weekly / monthly)")}
        path={`/reports/dialysis/summary?from=${from}&to=${to}&groupBy=${groupBy}`}
        filename="dialysis-summary"
      />
    </Panel>
  );
}

function MachineReportsPanel() {
  const { t } = useI18n();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineId, setMachineId] = useState("");
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());

  useEffect(() => {
    apiFetch("/machines").then(setMachines).catch(() => setMachines([]));
  }, []);

  return (
    <Panel title={t("تقارير الأجهزة", "Machine reports")}>
      <div className="flex flex-wrap items-end gap-3 text-xs text-slate-500">
        <label className="flex items-center gap-1">
          {t("من:", "From:")} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">
          {t("إلى:", "To:")} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">
          {t("الجهاز:", "Machine:")}
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
            <option value="">{t("-- اختر --", "-- Select --")}</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.machineCode}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="space-y-2">
        <ReportRow label={t("نسبة الإشغال", "Utilization")} path={`/reports/machines/utilization?from=${from}&to=${to}`} filename="machines-utilization" />
        <ReportRow label={t("تكرار الأعطال", "Fault frequency")} path={`/reports/machines/failure-frequency?from=${from}&to=${to}`} filename="machines-failures" />
        <ReportRow
          label={t("تقرير التوقف عن العمل", "Downtime report")}
          path={machineId ? `/reports/machines/${machineId}/downtime?from=${from}&to=${to}` : null}
          filename="machine-downtime"
          emptyLabel={t("اختر جهازاً أولاً", "Select a machine first")}
        />
        <ReportRow
          label={t("سجل الصيانة", "Maintenance history")}
          path={machineId ? `/reports/machines/${machineId}/maintenance-history` : null}
          filename="machine-maintenance"
          emptyLabel={t("اختر جهازاً أولاً", "Select a machine first")}
        />
      </div>
    </Panel>
  );
}

function OperationalReportsPanel({ user }: { user: AuthenticatedUser }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(todayIso());
  const [to, setTo] = useState(todayIso());
  const [month, setMonth] = useState(monthIso());

  return (
    <Panel title={t("تقارير المخزون والصيدلية والمختبر", "Inventory, pharmacy & lab reports")}>
      <div className="flex flex-wrap items-end gap-3 text-xs text-slate-500">
        <label className="flex items-center gap-1">
          {t("من:", "From:")} <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">
          {t("إلى:", "To:")} <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex items-center gap-1">
          {t("الشهر:", "Month:")} <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
      </div>
      <div className="space-y-2">
        {user.permissions.includes("inventory.view") && (
          <ReportRow label={t("حركات المخزون", "Stock movements")} path={`/reports/operations/stock-movements?from=${from}&to=${to}`} filename="stock-movements" />
        )}
        {user.permissions.includes("pharmacy.dispense") && (
          <ReportRow label={t("استهلاك الأدوية (شهري)", "Medication consumption (monthly)")} path={`/reports/operations/drug-consumption?month=${month}`} filename="drug-consumption" />
        )}
        {user.permissions.includes("lab.queue.view") && (
          <ReportRow label={t("حجم عمل المختبر", "Lab workload")} path={`/reports/operations/lab-volume?from=${from}&to=${to}`} filename="lab-volume" />
        )}
      </div>
    </Panel>
  );
}

export default function ReportsPage() {
  const { t } = useI18n();
  const user = useCurrentUser();

  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const canDialysis = user.permissions.includes("scheduling.manage") || user.permissions.includes("dialysis.session.view");
  const canMachines = user.permissions.includes("machine.view") || user.permissions.includes("maintenance.manage");
  const canOperations =
    user.permissions.includes("inventory.view") || user.permissions.includes("pharmacy.dispense") || user.permissions.includes("lab.queue.view");

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">{t("التقارير", "Reports")}</h1>
      <div className="mt-6 space-y-6">
        {user.permissions.includes("patient.view") && <PatientReportsPanel />}
        {canDialysis && <DialysisReportsPanel />}
        {canMachines && <MachineReportsPanel />}
        {canOperations && <OperationalReportsPanel user={user} />}
      </div>
    </AdminShell>
  );
}
