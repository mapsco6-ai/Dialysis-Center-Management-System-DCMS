"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import {
  DowntimeReport,
  Machine,
  MachineTimelineEvent,
  MaintenanceSeverity,
  MaintenanceTicket,
  MaintenanceTicketStatus,
} from "@/lib/types";

const TABS = [
  { key: "tickets", label: "تذاكر الصيانة" },
  { key: "timeline", label: "الجدول الزمني للجهاز" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const statusLabel: Record<MaintenanceTicketStatus, string> = {
  OPEN: "مفتوحة",
  ASSIGNED: "مُسندة",
  IN_PROGRESS: "قيد العمل",
  WAITING_PART: "بانتظار قطعة",
  COMPLETED: "مكتملة",
  CLOSED: "مغلقة",
};

const severityLabel: Record<MaintenanceSeverity, string> = {
  LOW: "منخفضة",
  MEDIUM: "متوسطة",
  HIGH: "عالية",
  CRITICAL: "حرجة",
};

const severityClass: Record<MaintenanceSeverity, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const timelineCategoryLabel: Record<MachineTimelineEvent["category"], string> = {
  USAGE: "استخدام",
  CLEANING: "تعفير",
  FAULT: "عطل",
  RETURN_TO_SERVICE: "عودة للخدمة",
  MAINTENANCE: "صيانة",
  OTHER: "أخرى",
};

const POLL_MS = 15000;

export default function MaintenancePage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("tickets");
  const [machines, setMachines] = useState<Machine[]>([]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/machines").then(setMachines).catch(() => setMachines([]));
  }, [user]);

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">الصيانة</h1>

      <nav className="mt-4 flex gap-1 border-b border-slate-200 text-sm">
        {TABS.map((t) => (
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
        {tab === "tickets" && <TicketsTab user={user} machines={machines} />}
        {tab === "timeline" && <TimelineTab machines={machines} />}
      </div>
    </AdminShell>
  );
}

function TicketsTab({ user, machines }: { user: { permissions: string[] }; machines: Machine[] }) {
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<MaintenanceTicketStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]);

  function refresh() {
    const params = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch(`/maintenance/tickets${params}`).then(setTickets).catch(() => setTickets([]));
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (!user.permissions.includes("maintenance.manage")) return;
    apiFetch("/maintenance/staff").then(setStaff).catch(() => setStaff([]));
  }, [user]);

  async function handleReport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/maintenance/tickets", { method: "POST", body: form });
      (e.target as HTMLFormElement).reset();
      setShowReportForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل بلاغ العطل");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(ticketId: string) {
    if (!assigneeId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/maintenance/tickets/${ticketId}/assign`, {
        method: "POST",
        body: JSON.stringify({ assignedToId: assigneeId }),
      });
      setAssigningId(null);
      setAssigneeId("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إسناد التذكرة");
    } finally {
      setBusy(false);
    }
  }

  async function advance(ticketId: string, status: "IN_PROGRESS" | "WAITING_PART" | "COMPLETED") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/maintenance/tickets/${ticketId}/status`, { method: "POST", body: JSON.stringify({ status }) });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث حالة التذكرة");
    } finally {
      setBusy(false);
    }
  }

  async function close(ticketId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/maintenance/tickets/${ticketId}/close`, { method: "POST", body: JSON.stringify({}) });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إغلاق التذكرة");
    } finally {
      setBusy(false);
    }
  }

  const canManage = user.permissions.includes("maintenance.manage");

  return (
    <div>
      <div className="flex items-center justify-between">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as MaintenanceTicketStatus | "")} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">كل الحالات</option>
          {Object.entries(statusLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {user.permissions.includes("machine.fault.report") && (
          <button onClick={() => setShowReportForm((v) => !v)} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            + بلاغ عطل
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {showReportForm && (
        <form onSubmit={handleReport} className="mt-4 max-w-lg space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <select name="machineId" required className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">اختر الجهاز...</option>
            {machines.filter((m) => m.status !== "OUT_OF_SERVICE").map((m) => (
              <option key={m.id} value={m.id}>{m.machineCode}</option>
            ))}
          </select>
          <textarea name="problem" required placeholder="وصف المشكلة" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" rows={3} />
          <select name="severity" required className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">درجة الخطورة...</option>
            {Object.entries(severityLabel).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <div>
            <label className="block text-xs text-slate-500">صورة (اختياري)</label>
            <input type="file" name="attachment" accept="image/*" className="mt-1 w-full text-sm" />
          </div>
          <button type="submit" disabled={busy} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            إرسال البلاغ
          </button>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">الجهاز</th>
              <th className="px-4 py-2 font-medium">المشكلة</th>
              <th className="px-4 py-2 font-medium">الخطورة</th>
              <th className="px-4 py-2 font-medium">الحالة</th>
              <th className="px-4 py-2 font-medium">المسؤول</th>
              <th className="px-4 py-2 font-medium">صورة</th>
              {canManage && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {tickets.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{t.machine?.machineCode}</td>
                <td className="px-4 py-2 max-w-xs truncate text-slate-600">{t.problem}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${severityClass[t.severity]}`}>{severityLabel[t.severity]}</span>
                </td>
                <td className="px-4 py-2 text-slate-500">{statusLabel[t.status]}</td>
                <td className="px-4 py-2 text-slate-500">{t.assignedTo?.fullName ?? "-"}</td>
                <td className="px-4 py-2">{t.attachmentUrl && <AttachmentThumbnail ticketId={t.id} />}</td>
                {canManage && (
                  <td className="px-4 py-2">
                    {t.status === "OPEN" && (
                      assigningId === t.id ? (
                        <div className="flex items-center gap-1">
                          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                            <option value="">اختر فني...</option>
                            {staff.map((s) => (
                              <option key={s.id} value={s.id}>{s.fullName}</option>
                            ))}
                          </select>
                          <button onClick={() => handleAssign(t.id)} disabled={busy} className="rounded bg-slate-800 px-2 py-1 text-xs text-white disabled:opacity-50">إسناد</button>
                          <button onClick={() => setAssigningId(null)} className="text-xs text-slate-400">إلغاء</button>
                        </div>
                      ) : (
                        <button onClick={() => setAssigningId(t.id)} className="text-xs font-medium text-slate-700 hover:underline">إسناد</button>
                      )
                    )}
                    {t.status === "ASSIGNED" && (
                      <button onClick={() => advance(t.id, "IN_PROGRESS")} disabled={busy} className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50">بدء العمل</button>
                    )}
                    {t.status === "IN_PROGRESS" && (
                      <div className="flex gap-2">
                        <button onClick={() => advance(t.id, "WAITING_PART")} disabled={busy} className="text-xs font-medium text-amber-700 hover:underline disabled:opacity-50">بانتظار قطعة</button>
                        <button onClick={() => advance(t.id, "COMPLETED")} disabled={busy} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50">إكمال</button>
                      </div>
                    )}
                    {t.status === "WAITING_PART" && (
                      <div className="flex gap-2">
                        <button onClick={() => advance(t.id, "IN_PROGRESS")} disabled={busy} className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50">استئناف العمل</button>
                        <button onClick={() => advance(t.id, "COMPLETED")} disabled={busy} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50">إكمال</button>
                      </div>
                    )}
                    {t.status === "COMPLETED" && (
                      <button onClick={() => close(t.id)} disabled={busy} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50">إغلاق وإعادة الجهاز للخدمة</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-6 text-center text-slate-400">لا توجد تذاكر صيانة</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttachmentThumbnail({ ticketId }: { ticketId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    apiFetchBlob(`/maintenance/tickets/${ticketId}/attachment`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ticketId]);

  if (!url) return <span className="text-xs text-slate-400">...</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="صورة العطل" className="h-10 w-10 rounded object-cover" />;
}

function TimelineTab({ machines }: { machines: Machine[] }) {
  const [machineId, setMachineId] = useState("");
  const [events, setEvents] = useState<MachineTimelineEvent[]>([]);
  const [downtime, setDowntime] = useState<DowntimeReport | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function loadTimeline(id: string) {
    apiFetch(`/machines/${id}/timeline`).then(setEvents).catch(() => setEvents([]));
  }

  async function loadDowntime(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!machineId || !from || !to) return;
    setError(null);
    try {
      const result = await apiFetch(`/machines/${machineId}/downtime?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      setDowntime(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حساب فترة التعطل");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-500">الجهاز:</label>
        <select
          value={machineId}
          onChange={(e) => {
            setMachineId(e.target.value);
            setDowntime(null);
            if (e.target.value) loadTimeline(e.target.value);
            else setEvents([]);
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">اختر جهازاً...</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>{m.machineCode}</option>
          ))}
        </select>
      </div>

      {machineId && (
        <>
          <form onSubmit={loadDowntime} className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
            <label className="text-xs text-slate-500">من</label>
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} required className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <label className="text-xs text-slate-500">إلى</label>
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} required className="rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <button type="submit" className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white">حساب فترة التعطل</button>
          </form>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {downtime && (
            <p className="mt-2 text-sm text-slate-600">
              إجمالي التعطل: <span className="font-semibold text-slate-800">{downtime.totalDowntimeHours.toFixed(2)} ساعة</span>{" "}
              ({downtime.intervals.length} فترة)
            </p>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">الوقت</th>
                  <th className="px-4 py-2 font-medium">التصنيف</th>
                  <th className="px-4 py-2 font-medium">التحول</th>
                  <th className="px-4 py-2 font-medium">بواسطة</th>
                  <th className="px-4 py-2 font-medium">السبب</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-500">{new Date(e.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2">{timelineCategoryLabel[e.category]}</td>
                    <td className="px-4 py-2 text-slate-600">{e.fromStatus ?? "-"} → {e.toStatus ?? "-"}</td>
                    <td className="px-4 py-2 text-slate-500">{e.changedBy?.fullName ?? "-"}</td>
                    <td className="px-4 py-2 text-slate-400">{e.reason ?? "-"}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400">لا توجد أحداث بعد لهذا الجهاز</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
