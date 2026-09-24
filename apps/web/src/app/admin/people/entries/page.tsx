"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { PaginatedTable, type TableColumn } from "@/components/PaginatedTable";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/components/Toaster";
import { Paginated } from "@/lib/types";

const PAGE_SIZE = 20;
const TYPES = ["ACTION_NOTE", "SHIFT_REPORT", "PROBLEM", "COMPLAINT", "SUGGESTION"] as const;
type EntryType = (typeof TYPES)[number];
const NEXT_STATUS: Record<string, string[]> = {
  SUBMITTED: ["ACKNOWLEDGED", "IN_PROGRESS", "REJECTED"],
  ACKNOWLEDGED: ["IN_PROGRESS", "RESOLVED", "REJECTED"],
  IN_PROGRESS: ["RESOLVED", "REJECTED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"],
};

interface Entry {
  id: string;
  type: EntryType;
  title: string;
  body: string;
  severity: string;
  status: string;
  isConfidential: boolean;
  response: string | null;
  entryDate: string;
  patientId: string | null;
  escalatedIncidentId: string | null;
  author: { fullName: string };
}

const inputClass = "rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none";
const primaryButton = "rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
const secondaryButton = "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50";

export default function EntriesPage() {
  const { t, formatDate } = useI18n();
  const user = useCurrentUser();
  const typeLabel: Record<EntryType, string> = {
    ACTION_NOTE: t("إجراء", "Action note"),
    SHIFT_REPORT: t("تقرير الدوام", "Shift report"),
    PROBLEM: t("مشكلة", "Problem"),
    COMPLAINT: t("شكوى", "Complaint"),
    SUGGESTION: t("مقترح", "Suggestion"),
  };
  const canReview = Boolean(user?.permissions.includes("entry.review"));
  const canCreate = Boolean(user?.permissions.includes("entry.create"));
  const [view, setView] = useState<"mine" | "all">("mine");
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);
  useEffect(() => setPage(1), [view, typeFilter]);

  const list = useApi<Paginated<Entry>>(
    user ? `${view === "mine" ? "/me/staff-entries" : "/staff-entries"}?page=${page}&limit=${PAGE_SIZE}${typeFilter ? `&type=${typeFilter}` : ""}` : null,
  );

  const [form, setForm] = useState({ type: "ACTION_NOTE" as EntryType, title: "", body: "", severity: "LOW", isConfidential: false });
  const [busy, setBusy] = useState(false);

  async function loadShiftSummary() {
    try {
      const s = await apiFetch("/me/shift-summary");
      const lines = [
        `${t("ملخص اليوم", "Summary for")} ${s.date}`,
        `${t("جلسات مُمرَّضة", "Sessions nursed")}: ${s.sessionsNursed}`,
        `${t("قراءات مُدخلة", "Readings entered")}: ${s.readingsEntered}`,
        `${t("أحداث مسجّلة", "Events recorded")}: ${s.eventsRecorded}`,
        ...s.actions.map((a: { action: string; count: number }) => `- ${a.action}: ${a.count}`),
        "",
        t("ملاحظاتي:", "My notes:"),
      ];
      setForm((f) => ({ ...f, type: "SHIFT_REPORT", title: f.title || `${t("تقرير دوام", "Shift report")} ${s.date}`, body: lines.join("\n") }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر تحميل الملخص", "Could not load summary"));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch("/staff-entries", { method: "POST", body: JSON.stringify({ ...form, isConfidential: form.isConfidential || undefined }) });
      toast.success(t("تم تسجيلها. لا يمكن تعديلها؛ أضف سجلاً جديداً للتصحيح.", "Recorded. It cannot be edited; add a new entry to correct it."));
      setForm({ ...form, title: "", body: "" });
      list.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر الحفظ", "Could not save"));
    } finally {
      setBusy(false);
    }
  }

  async function review(entry: Entry, status: string) {
    const reason = status === "REJECTED" ? window.prompt(t("سبب الرفض؟", "Reason for rejection?")) : undefined;
    if (status === "REJECTED" && !reason) return;
    const response = window.prompt(t("ردّ للكاتب (اختياري)", "Reply to the author (optional)")) || undefined;
    try {
      const updated = await apiFetch(`/staff-entries/${entry.id}/status`, { method: "PATCH", body: JSON.stringify({ status, reason, response }) });
      setSelected({ ...entry, ...updated, author: entry.author });
      list.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذر تحديث الحالة", "Could not update status"));
    }
  }

  if (!user) return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;

  const columns: TableColumn<Entry>[] = [
    { key: "entryDate", header: t("التاريخ", "Date"), render: (e) => formatDate(e.entryDate, { dateStyle: "short", timeStyle: "short" }) },
    { key: "type", header: t("النوع", "Type"), render: (e) => typeLabel[e.type] },
    { key: "title", header: t("العنوان", "Title"), render: (e) => <>{e.title}{e.isConfidential ? <> <span className="text-xs text-slate-500">({t("سري", "Confidential")})</span></> : ""}<br /><span className="text-xs text-slate-500">{e.author.fullName}</span></> },
    { key: "status", header: t("الحالة", "Status"), render: (e) => <StatusBadge group="entry" value={e.status} /> },
    { key: "open", header: "", render: (e) => <button className={secondaryButton} onClick={() => setSelected(e)}>{t("عرض", "View")}</button> },
  ];

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">{t("تقاريري وإجراءاتي", "Reports & actions")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("سجّل إجراءً قمت به، تقرير دوامك، مشكلة، شكوى أو مقترحاً. تُحفظ بلا حذف ويراجعها المسؤول.", "Record an action, your shift report, a problem, complaint or suggestion. Entries are kept permanently and reviewed by management.")}</p>

      {canCreate && (
        <form onSubmit={submit} className="mt-4 grid gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as EntryType })} aria-label={t("النوع", "Type")}>
              {TYPES.map((type) => <option key={type} value={type}>{typeLabel[type]}</option>)}
            </select>
            <select className={inputClass} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} aria-label={t("الأهمية", "Severity")}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input required className={`${inputClass} min-w-[14rem] flex-1`} placeholder={t("العنوان", "Title")} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <button type="button" className={secondaryButton} onClick={loadShiftSummary}>{t("تعبئة من نشاط اليوم", "Fill from today’s activity")}</button>
          </div>
          <textarea required rows={5} className={inputClass} placeholder={t("التفاصيل", "Details")} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={form.isConfidential} onChange={(e) => setForm({ ...form, isConfidential: e.target.checked })} />{t("سرّي (للكاتب والمراجعين فقط)", "Confidential (author and reviewers only)")}</label>
            <button type="submit" disabled={busy} className={primaryButton}>{t("تسجيل", "Submit")}</button>
          </div>
        </form>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {canReview && (["mine", "all"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${view === v ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            {v === "mine" ? t("سجلاتي", "My entries") : t("كل السجلات للمراجعة", "All entries (review)")}
          </button>
        ))}
        <select className={inputClass} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label={t("فلترة حسب النوع", "Filter by type")}>
          <option value="">{t("كل الأنواع", "All types")}</option>
          {TYPES.map((type) => <option key={type} value={type}>{typeLabel[type]}</option>)}
        </select>
      </div>

      {selected && (
        <div className="mt-4 rounded-lg border border-slate-300 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-800">{selected.title} <StatusBadge group="entry" value={selected.status} /></h2>
              <p className="text-xs text-slate-500">{typeLabel[selected.type]} · {selected.author.fullName}{selected.escalatedIncidentId ? ` · ${t("حُوّلت إلى حادثة", "escalated to incident")}` : ""}</p>
            </div>
            <button className={secondaryButton} onClick={() => setSelected(null)}>{t("إغلاق", "Close")}</button>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{selected.body}</p>
          {selected.response && <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><strong>{t("ردّ الإدارة: ", "Management reply: ")}</strong>{selected.response}</p>}
          {canReview && (NEXT_STATUS[selected.status] ?? []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {NEXT_STATUS[selected.status].map((status) => <button key={status} className={secondaryButton} onClick={() => review(selected, status)}>→ {status}</button>)}
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <PaginatedTable columns={columns} rows={list.data?.data ?? null} total={list.data?.total ?? null} page={page} pageSize={PAGE_SIZE}
          onPageChange={setPage} loading={list.loading} error={list.error} onRetry={list.refresh}
          emptyTitle={t("لا توجد سجلات بعد", "No entries yet")} rowKey={(e) => e.id} />
      </div>
    </AdminShell>
  );
}
