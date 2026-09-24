"use client";

import { useEffect, useState } from "react";
import { apiFetch, apiFetchBlob, ApiError } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Button } from "@heroui/react";
import { AdminShell } from "@/components/AdminShell";
import { StatusBadge } from "@/components/StatusBadge";
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

type TabKey = ReturnType<typeof getLabels>["TABS"][number]["key"];

function getLabels(t: (arabic: string, english: string) => string) {
  const typeLabel: Record<IncidentType, string> = {
    ADVERSE_EVENT: t("حدث ضار", "Adverse event"),
    INFECTION: t("عدوى", "Infection"),
    VASCULAR_ACCESS_EVENT: t("حدث وصول وعائي", "Vascular access event"),
    HOSPITAL_TRANSFER: t("تحويل لمستشفى", "Hospital transfer"),
    EMERGENCY_EVENT: t("حالة طارئة", "Emergency event"),
    REPEATED_HYPOTENSION: t("هبوط ضغط متكرر", "Repeated hypotension"),
    MACHINE_INCIDENT: t("حادثة جهاز", "Machine incident"),
  };

  const severityLabel: Record<IncidentSeverity, string> = {
    LOW: t("منخفضة", "Low"),
    MEDIUM: t("متوسطة", "Medium"),
    HIGH: t("عالية", "High"),
    CRITICAL: t("حرجة", "Critical"),
  };

  const statusLabel: Record<IncidentStatus, string> = {
    OPEN: t("مفتوحة", "Open"),
    UNDER_REVIEW: t("قيد المراجعة", "Under review"),
    CLOSED: t("مغلقة", "Closed"),
  };

  const TABS = [
    { key: "report", label: t("الإبلاغ عن حادثة", "Report an incident") },
    { key: "list", label: t("تقرير الحوادث", "Incident report") },
    { key: "audit", label: t("التدقيق السريري", "Clinical audit") },
  ] as const;
  return { typeLabel, severityLabel, statusLabel, TABS };
}

function PatientPicker({ onSelect, selected }: { onSelect: (p: Patient | null) => void; selected: Patient | null }) {
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
          onSelect(null);
          setQuery(e.target.value);
        }}
        placeholder={t("ابحث برقم المريض أو الاسم...", "Search by patient number or name...")}
        className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
      />
      {results.length > 0 && !selected && (
        <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border text-sm">
          {results.map((p) => (
            <li
              key={p.id}
              onClick={() => {
                onSelect(p);
                setResults([]);
              }}
              className="cursor-pointer px-3 py-1.5 hover:bg-surface-secondary"
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
  const { t } = useI18n();
  const { typeLabel, severityLabel } = getLabels(t);
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
      setMessage({ kind: "error", text: t("يجب اختيار مريض أو جهاز على الأقل", "Select at least a patient or a machine") });
      return;
    }
    if (!description.trim()) {
      setMessage({ kind: "error", text: t("الوصف مطلوب", "Description is required") });
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
      setMessage({ kind: "ok", text: t("تم تسجيل الحادثة بنجاح", "Incident recorded successfully") });
      setPatient(null);
      setMachineId("");
      setSessionId("");
      setDescription("");
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof ApiError ? e.message : t("تعذّر تسجيل الحادثة", "Unable to record the incident") });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="max-w-xl space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <label className="mb-1 block text-xs text-muted">{t("المريض (اختياري إن كانت الحادثة عن جهاز فقط)", "Patient (optional for machine-only incidents)")}</label>
        <PatientPicker selected={patient} onSelect={setPatient} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">{t("الجهاز (اختياري)", "Machine (optional)")}</label>
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className="w-full rounded-md border border-border px-3 py-1.5 text-sm">
          <option value="">{t("-- بدون --", "-- None --")}</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.machineCode}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">{t("رقم الجلسة (اختياري)", "Session ID (optional)")}</label>
        <input
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
          placeholder={t("معرّف الجلسة إن وُجد", "Session ID, if available")}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs text-muted">{t("النوع", "Type")}</label>
          <select value={type} onChange={(e) => setType(e.target.value as IncidentType)} className="w-full rounded-md border border-border px-3 py-1.5 text-sm">
            {Object.entries(typeLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">{t("الشدة", "Severity")}</label>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
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
        <label className="mb-1 block text-xs text-muted">{t("الوصف", "Description")}</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
        />
      </div>
      {message && (
        <p className={`text-sm ${message.kind === "ok" ? "text-success" : "text-danger"}`}>{message.text}</p>
      )}
      <button
        onClick={submit}
        disabled={submitting}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {submitting ? t("جاري الإرسال...", "Submitting...") : t("تسجيل الحادثة", "Record incident")}
      </button>
    </section>
  );
}

function IncidentListTab({ user }: { user: AuthenticatedUser }) {
  const { t, formatDate } = useI18n();
  const { typeLabel, severityLabel, statusLabel } = getLabels(t);
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
    const reason = window.prompt(t("سبب التغيير (اختياري):", "Reason for the change (optional):")) ?? undefined;
    try {
      await apiFetch(`/incidents/${id}/status`, { method: "POST", body: JSON.stringify({ status: toStatus, reason }) });
      refresh();
    } catch (e) {
      window.alert(e instanceof ApiError ? e.message : t("تعذّر تحديث الحالة", "Unable to update the status"));
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4 text-xs text-muted">
        <label className="flex flex-col gap-1">
          {t("النوع", "Type")}
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-border px-2 py-1">
            <option value="">{t("الكل", "All")}</option>
            {Object.entries(typeLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("الشدة", "Severity")}
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded border border-border px-2 py-1">
            <option value="">{t("الكل", "All")}</option>
            {Object.entries(severityLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("الحالة", "Status")}
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-border px-2 py-1">
            <option value="">{t("الكل", "All")}</option>
            {Object.entries(statusLabel).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          {t("من", "From")}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded border border-border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          {t("إلى", "To")}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded border border-border px-2 py-1" />
        </label>
        <button onClick={refresh} className="rounded-md border border-border px-3 py-1.5 text-foreground hover:bg-surface-secondary">
          {t("تصفية", "Filter")}
        </button>
        <div className="ms-auto flex gap-2">
          <button onClick={() => exportAs("pdf")} className="rounded-md border border-border px-3 py-1.5 text-muted hover:bg-surface-secondary">
            PDF
          </button>
          <button onClick={() => exportAs("excel")} className="rounded-md border border-border px-3 py-1.5 text-muted hover:bg-surface-secondary">
            Excel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-secondary text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-start">{t("التاريخ", "Date")}</th>
              <th className="px-3 py-2 text-start">{t("النوع", "Type")}</th>
              <th className="px-3 py-2 text-start">{t("الشدة", "Severity")}</th>
              <th className="px-3 py-2 text-start">{t("الحالة", "Status")}</th>
              <th className="px-3 py-2 text-start">{t("المريض", "Patient")}</th>
              <th className="px-3 py-2 text-start">{t("الجهاز", "Machine")}</th>
              <th className="px-3 py-2 text-start">{t("المُبلِّغ", "Reported by")}</th>
              {canReview && <th className="px-3 py-2 text-start">{t("إجراء", "Action")}</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-muted">
                  {t("جاري التحميل...", "Loading...")}
                </td>
              </tr>
            ) : incidents.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-muted">
                  {t("لا توجد حوادث", "No incidents")}
                </td>
              </tr>
            ) : (
              incidents.map((i) => (
                <tr key={i.id} className="border-t border-border">
                  <td className="px-3 py-2">{formatDate(i.createdAt, { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-3 py-2">{typeLabel[i.type]}</td>
                  <td className="px-3 py-2">
                    <StatusBadge group="incidentSeverity" value={i.severity} />
                  </td>
                  <td className="px-3 py-2"><StatusBadge group="incident" value={i.status} /></td>
                  <td className="px-3 py-2">{i.patient ? `${i.patient.patientCode} - ${i.patient.fullName}` : "-"}</td>
                  <td className="px-3 py-2">{i.machine?.machineCode ?? "-"}</td>
                  <td className="px-3 py-2">{i.reportedBy.fullName}</td>
                  {canReview && (
                    <td className="px-3 py-2">
                      {i.status === "OPEN" && (
                        <div className="flex gap-1">
                          <button onClick={() => changeStatus(i.id, "UNDER_REVIEW")} className="text-xs text-warning hover:underline">
                            {t("مراجعة", "Review")}
                          </button>
                          <button onClick={() => changeStatus(i.id, "CLOSED")} className="text-xs text-muted hover:underline">
                            {t("إغلاق", "Close")}
                          </button>
                        </div>
                      )}
                      {i.status === "UNDER_REVIEW" && (
                        <button onClick={() => changeStatus(i.id, "CLOSED")} className="text-xs text-muted hover:underline">
                          {t("إغلاق", "Close")}
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
  const { t, formatDate } = useI18n();
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
      <div className="max-w-md rounded-lg border border-border bg-surface p-4">
        <label className="mb-1 block text-xs text-muted">{t("المريض", "Patient")}</label>
        <PatientPicker selected={patient} onSelect={setPatient} />
      </div>

      {rows && (
        <>
          <div className="flex justify-end gap-2">
            <button onClick={() => exportAs("pdf")} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-secondary">
              PDF
            </button>
            <button onClick={() => exportAs("excel")} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-secondary">
              Excel
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-surface-secondary text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 text-start">{t("التاريخ", "Date")}</th>
                  <th className="px-3 py-2 text-start">{t("المصدر", "Source")}</th>
                  <th className="px-3 py-2 text-start">{t("المستخدم", "User")}</th>
                  <th className="px-3 py-2 text-start">{t("الإجراء", "Action")}</th>
                  <th className="px-3 py-2 text-start">{t("الكيان", "Entity")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-muted">
                      {t("لا توجد سجلات", "No records")}
                    </td>
                  </tr>
                ) : (
                  rows.map((r, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-3 py-2">{formatDate(r.timestamp, { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="px-3 py-2">{r.source === "AUDIT_LOG" ? t("سجل تدقيق", "Audit log") : t("الجدول الزمني", "Timeline")}</td>
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
  const { t } = useI18n();
  const { TABS } = getLabels(t);
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("report");

  if (!user) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const canReport = user.permissions.includes("incident.report");
  const canView = user.permissions.includes("incident.view") || user.permissions.includes("incident.review");
  const canAudit = user.permissions.includes("quality.audit.view");

  const visibleTabs = TABS.filter(
    (entry) => (entry.key === "report" && canReport) || (entry.key === "list" && canView) || (entry.key === "audit" && canAudit),
  );

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-foreground">{t("الجودة والسلامة", "Quality & safety")}</h1>

      <div className="mt-4 flex flex-wrap gap-2">
        {visibleTabs.map((entry) => (
          <Button key={entry.key} size="sm" variant={tab === entry.key ? "primary" : "secondary"} aria-pressed={tab === entry.key} onPress={() => setTab(entry.key)}>
            {entry.label}
          </Button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "report" && canReport && <ReportIncidentTab />}
        {tab === "list" && canView && <IncidentListTab user={user} />}
        {tab === "audit" && canAudit && <ClinicalAuditTab />}
      </div>
    </AdminShell>
  );
}
