"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import {
  AuthenticatedUser,
  ClinicalAuditRow,
  IncidentReport,
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  Machine,
  Patient,
} from "@/lib/types";

const typeLabel: Record<IncidentType, string> = {
  ADVERSE_EVENT: "حدث ضار",
  INFECTION: "عدوى",
  VASCULAR_ACCESS_EVENT: "حدث وصول وعائي",
  HOSPITAL_TRANSFER: "تحويل لمستشفى",
  EMERGENCY_EVENT: "حالة طارئة",
  REPEATED_HYPOTENSION: "هبوط ضغط متكرر",
  MACHINE_INCIDENT: "حادثة جهاز",
};

const severityLabel: Record<IncidentSeverity, string> = {
  LOW: "منخفضة",
  MEDIUM: "متوسطة",
  HIGH: "عالية",
  CRITICAL: "حرجة",
};

const severityClass: Record<IncidentSeverity, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const statusLabel: Record<IncidentStatus, string> = {
  OPEN: "مفتوحة",
  UNDER_REVIEW: "قيد المراجعة",
  CLOSED: "مغلقة",
};

const TABS = [
  { key: "report", label: "الإبلاغ عن حادثة" },
  { key: "list", label: "تقرير الحوادث" },
  { key: "audit", label: "التدقيق السريري" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function PatientPicker({ onSelect, selected }: { onSelect: (p: Patient | null) => void; selected: Patient | null }) {
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
          onSelect(null);
          setQuery(e.target.value);
        }}
        placeholder="ابحث برقم المريض أو الاسم..."
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

function ReportIncidentTab() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [machineId, setMachineId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [type, setType] = useState<IncidentType>("ADVERSE_EVENT");
  const [severity, setSeverity] = useState<IncidentSeverity>("LOW");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    apiFetch("/machines").then(setMachines).catch(() => setMachines([]));
  }, []);

  async function submit() {
    if (!patient && !machineId) {
      setMessage({ kind: "error", text: "يجب اختيار مريض أو جهاز على الأقل" });
      return;
    }
    if (!description.trim()) {
      setMessage({ kind: "error", text: "الوصف مطلوب" });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch("/incidents", {
        method: "POST",
        body: JSON.stringify({
          patientId: patient?.id,
          machineId: machineId || undefined,
          sessionId: sessionId.trim() || undefined,
          type,
          severity,
          description: description.trim(),
        }),
      });
      setMessage({ kind: "ok", text: "تم تسجيل الحادثة بنجاح" });
      setPatient(null);
      setMachineId("");
      setSessionId("");
      setDescription("");
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof ApiError ? e.message : "تعذّر تسجيل الحادثة" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-xl space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div>
        <label className="mb-1 block text-xs text-slate-500">المريض (اختياري إن كانت الحادثة عن جهاز فقط)</label>
        <PatientPicker selected={patient} onSelect={setPatient} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">الجهاز (اختياري)</label>
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">-- بدون --</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.machineCode}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">رقم الجلسة (اختياري)</label>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          placeholder="معرّف الجلسة إن وُجد"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-slate-500">النوع</label>
          <select value={type} onChange={(e) => setType(e.target.value as IncidentType)} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            {Object.entries(typeLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-slate-500">الشدة</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          >
            {Object.entries(severityLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">الوصف</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      {message && (
        <p className={`text-sm ${message.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}>{message.text}</p>
      )}
      <button
        onClick={submit}
        disabled={submitting}
        className="rounded-md bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {submitting ? "جاري الإرسال..." : "تسجيل الحادثة"}
      </button>
    </section>
  );
}

function IncidentListTab({ user }: { user: AuthenticatedUser }) {
  const canReview = user.permissions.includes("incident.review");
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);

  function buildQuery(extra: Record<string, string> = {}) {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (severity) params.set("severity", severity);
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    return params.toString();
  }

  async function refresh() {
    setLoading(true);
    try {
      const data = await apiFetch(`/incidents?${buildQuery()}`);
      setIncidents(data);
    } catch {
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportAs(format: "pdf" | "excel") {
    const blob = await apiFetchBlob(`/incidents?${buildQuery({ format })}`);
    downloadBlob(blob, `incident-report.${format === "pdf" ? "pdf" : "xlsx"}`);
  }

  async function changeStatus(id: string, toStatus: "UNDER_REVIEW" | "CLOSED") {
    const reason = window.prompt("سبب التغيير (اختياري):") ?? undefined;
    try {
      await apiFetch(`/incidents/${id}/status`, { method: "POST", body: JSON.stringify({ status: toStatus, reason }) });
      refresh();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : "تعذّر تحديث الحالة");
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <label className="flex flex-col gap-1">
          النوع
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
            <option value="">الكل</option>
            {Object.entries(typeLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          الشدة
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
            <option value="">الكل</option>
            {Object.entries(severityLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          الحالة
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-slate-300 px-2 py-1">
            <option value="">الكل</option>
            {Object.entries(statusLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          من
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          إلى
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1" />
        </label>
        <button onClick={refresh} className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-slate-100">
          تصفية
        </button>
        <div className="mr-auto flex gap-2">
          <button onClick={() => exportAs("pdf")} className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-100">
            PDF
          </button>
          <button onClick={() => exportAs("excel")} className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-100">
            Excel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-right">التاريخ</th>
              <th className="px-3 py-2 text-right">النوع</th>
              <th className="px-3 py-2 text-right">الشدة</th>
              <th className="px-3 py-2 text-right">الحالة</th>
              <th className="px-3 py-2 text-right">المريض</th>
              <th className="px-3 py-2 text-right">الجهاز</th>
              <th className="px-3 py-2 text-right">المُبلِّغ</th>
              {canReview && <th className="px-3 py-2 text-right">إجراء</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-slate-400">
                  جاري التحميل...
                </td>
              </tr>
            ) : incidents.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-slate-400">
                  لا توجد حوادث
                </td>
              </tr>
            ) : (
              incidents.map((i) => (
                <tr key={i.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{new Date(i.createdAt).toLocaleString("ar")}</td>
                  <td className="px-3 py-2">{typeLabel[i.type]}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${severityClass[i.severity]}`}>{severityLabel[i.severity]}</span>
                  </td>
                  <td className="px-3 py-2">{statusLabel[i.status]}</td>
                  <td className="px-3 py-2">{i.patient ? `${i.patient.patientCode} - ${i.patient.fullName}` : "-"}</td>
                  <td className="px-3 py-2">{i.machine?.machineCode ?? "-"}</td>
                  <td className="px-3 py-2">{i.reportedBy.fullName}</td>
                  {canReview && (
                    <td className="px-3 py-2">
                      {i.status === "OPEN" && (
                        <div className="flex gap-1">
                          <button onClick={() => changeStatus(i.id, "UNDER_REVIEW")} className="text-xs text-amber-600 hover:underline">
                            مراجعة
                          </button>
                          <button onClick={() => changeStatus(i.id, "CLOSED")} className="text-xs text-slate-600 hover:underline">
                            إغلاق
                          </button>
                        </div>
                      )}
                      {i.status === "UNDER_REVIEW" && (
                        <button onClick={() => changeStatus(i.id, "CLOSED")} className="text-xs text-slate-600 hover:underline">
                          إغلاق
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClinicalAuditTab() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [rows, setRows] = useState<ClinicalAuditRow[] | null>(null);

  useEffect(() => {
    if (!patient) {
      setRows(null);
      return;
    }
    apiFetch(`/quality/clinical-audit/${patient.id}`)
      .then((data) => setRows(data.rows))
      .catch(() => setRows([]));
  }, [patient]);

  async function exportAs(format: "pdf" | "excel") {
    if (!patient) return;
    const blob = await apiFetchBlob(`/quality/clinical-audit/${patient.id}?format=${format}`);
    downloadBlob(blob, `clinical-audit-${patient.patientCode}.${format === "pdf" ? "pdf" : "xlsx"}`);
  }

  return (
    <section className="space-y-4">
      <div className="max-w-md rounded-lg border border-slate-200 bg-white p-4">
        <label className="mb-1 block text-xs text-slate-500">المريض</label>
        <PatientPicker selected={patient} onSelect={setPatient} />
      </div>

      {rows && (
        <>
          <div className="flex justify-end gap-2">
            <button onClick={() => exportAs("pdf")} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
              PDF
            </button>
            <button onClick={() => exportAs("excel")} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100">
              Excel
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-right">التاريخ</th>
                  <th className="px-3 py-2 text-right">المصدر</th>
                  <th className="px-3 py-2 text-right">المستخدم</th>
                  <th className="px-3 py-2 text-right">الإجراء</th>
                  <th className="px-3 py-2 text-right">الكيان</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                      لا توجد سجلات
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-3 py-2">{new Date(r.timestamp).toLocaleString("ar")}</td>
                      <td className="px-3 py-2">{r.source === "AUDIT_LOG" ? "سجل تدقيق" : "الجدول الزمني"}</td>
                      <td className="px-3 py-2">{r.actor}</td>
                      <td className="px-3 py-2">{r.action}</td>
                      <td className="px-3 py-2">{r.entityType}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

export default function QualityPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("report");

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  const canReport = user.permissions.includes("incident.report");
  const canView = user.permissions.includes("incident.view") || user.permissions.includes("incident.review");
  const canAudit = user.permissions.includes("quality.audit.view");

  const visibleTabs = TABS.filter(
    (t) => (t.key === "report" && canReport) || (t.key === "list" && canView) || (t.key === "audit" && canAudit),
  );

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">الجودة والسلامة</h1>

      <nav className="mt-4 flex gap-1 border-b border-slate-200 text-sm">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 ${tab === t.key ? "border-b-2 border-slate-800 font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {tab === "report" && canReport && <ReportIncidentTab />}
        {tab === "list" && canView && <IncidentListTab user={user} />}
        {tab === "audit" && canAudit && <ClinicalAuditTab />}
      </div>
    </AdminShell>
  );
}
