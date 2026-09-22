"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetchBlob } from "@/lib/api";
import { downloadBlob } from "@/lib/download";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { PaginatedTable, type TableColumn } from "@/components/PaginatedTable";
import { toast } from "@/components/Toaster";
import { Paginated } from "@/lib/types";

const PAGE_SIZE = 50;

interface AuditRow {
  id: string;
  createdAt: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  patientId: string | null;
  reason: string | null;
  actor: { id: string; fullName: string; username: string };
}

const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";

// Oversight view for inspection committees: filter by employee, patient,
// action and date, then export exactly what is on screen (the export is
// itself written to the audit log by the API).
export default function AuditPage() {
  const { t, formatDate } = useI18n();
  const user = useCurrentUser();
  const params = useSearchParams();
  const [filters, setFilters] = useState({ actorId: params.get("actorId") ?? "", patientId: params.get("patientId") ?? "", action: "", from: "", to: "" });
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters]);

  const qs = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (!value) return;
    // date inputs give a day; make "to" inclusive of the whole day
    qs.set(key, key === "to" ? `${value}T23:59:59.999` : value);
  });
  const filterQuery = qs.toString();
  const list = useApi<Paginated<AuditRow>>(user ? `/audit-logs?page=${page}&limit=${PAGE_SIZE}${filterQuery ? `&${filterQuery}` : ""}` : null);

  if (!user) return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;

  async function exportCsv() {
    try {
      downloadBlob(await apiFetchBlob(`/audit-logs/export${filterQuery ? `?${filterQuery}` : ""}`), "audit-log.csv");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر التصدير", "Export failed"));
    }
  }
  const set = (key: keyof typeof filters) => (e: { target: { value: string } }) => setFilters({ ...filters, [key]: e.target.value });

  const columns: TableColumn<AuditRow>[] = [
    { key: "createdAt", header: t("الوقت", "Time"), render: (r) => formatDate(r.createdAt, { dateStyle: "short", timeStyle: "medium" }) },
    { key: "actor", header: t("الموظف", "Employee"), render: (r) => <>{r.actor.fullName}<br /><span className="text-xs text-slate-500">{r.actorRole}</span></> },
    { key: "action", header: t("الإجراء", "Action"), render: (r) => <span className="font-mono text-xs">{r.action}</span> },
    { key: "entityType", header: t("الكيان", "Entity"), render: (r) => <>{r.entityType}<br /><span className="font-mono text-xs text-slate-500">{r.entityId.slice(0, 8)}</span></> },
    { key: "reason", header: t("السبب", "Reason"), render: (r) => r.reason ?? "-" },
  ];

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">{t("سجل التدقيق", "Audit trail")}</h1>
        {user.permissions.includes("audit.export") && <button className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700" onClick={exportCsv}>{t("تصدير CSV", "Export CSV")}</button>}
      </div>
      <p className="mt-1 text-sm text-slate-500">{t("سجل غير قابل للتعديل أو الحذف: من فعل ماذا ومتى، بما في ذلك فتح ملفات المرضى وتصدير التقارير.", "Append-only record of who did what and when, including chart openings and report exports.")}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        <input className={inputClass} placeholder={t("معرّف الموظف", "Employee ID")} value={filters.actorId} onChange={set("actorId")} />
        <input className={inputClass} placeholder={t("معرّف المريض", "Patient ID")} value={filters.patientId} onChange={set("patientId")} />
        <input className={inputClass} placeholder={t("الإجراء (مثال PATIENT_VIEWED)", "Action (e.g. PATIENT_VIEWED)")} value={filters.action} onChange={set("action")} />
        <label className="flex items-center gap-1 text-xs text-slate-500">{t("من", "From")}<input type="date" className={inputClass} value={filters.from} onChange={set("from")} /></label>
        <label className="flex items-center gap-1 text-xs text-slate-500">{t("إلى", "To")}<input type="date" className={inputClass} value={filters.to} onChange={set("to")} /></label>
      </div>

      <div className="mt-4">
        <PaginatedTable columns={columns} rows={list.data?.data ?? null} total={list.data?.total ?? null} page={page} pageSize={PAGE_SIZE}
          onPageChange={setPage} loading={list.loading} error={list.error} onRetry={list.refresh}
          emptyTitle={t("لا توجد سجلات مطابقة", "No matching records")} rowKey={(r) => r.id} />
      </div>
    </AdminShell>
  );
}
