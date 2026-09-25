"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch, apiFetchBlob } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Button } from "@heroui/react";
import { AdminShell } from "@/components/AdminShell";
import { FilterSelect } from "@/components/FilterSelect";
import { ErrorNote } from "@/components/ErrorNote";
import { StatusBadge } from "@/components/StatusBadge";
import {
  DowntimeReport,
  Machine,
  MachineTimelineEvent,
  MaintenanceSeverity,
  MaintenanceTicket,
  MaintenanceTicketStatus,
} from "@/lib/types";

type TabKey = ReturnType<typeof getLabels>["TABS"][number]["key"];

const severityTone: Record<MaintenanceSeverity, string> = {
  LOW: "tone-muted",
  MEDIUM: "tone-warning",
  HIGH: "tone-warning",
  CRITICAL: "tone-danger",
};

function getLabels(t: (arabic: string, english: string) => string) {
  const TABS = [
    { key: "tickets", label: t("تذاكر الصيانة", "Maintenance tickets") },
    { key: "timeline", label: t("الجدول الزمني للجهاز", "Machine timeline") },
  ] as const;

  const statusLabel: Record<MaintenanceTicketStatus, string> = {
    OPEN: t("مفتوحة", "Open"),
    ASSIGNED: t("مُسندة", "Assigned"),
    IN_PROGRESS: t("قيد العمل", "In progress"),
    WAITING_PART: t("بانتظار قطعة", "Awaiting part"),
    COMPLETED: t("مكتملة", "Completed"),
    CLOSED: t("مغلقة", "Closed"),
    CANCELLED: t("ملغاة", "Cancelled"),
  };

  const severityLabel: Record<MaintenanceSeverity, string> = {
    LOW: t("منخفضة", "Low"),
    MEDIUM: t("متوسطة", "Medium"),
    HIGH: t("عالية", "High"),
    CRITICAL: t("حرجة", "Critical"),
  };

  const timelineCategoryLabel: Record<MachineTimelineEvent["category"], string> = {
    USAGE: t("استخدام", "Usage"),
    CLEANING: t("تعفير", "Disinfection"),
    FAULT: t("عطل", "Fault"),
    RETURN_TO_SERVICE: t("عودة للخدمة", "Return to service"),
    MAINTENANCE: t("صيانة", "Maintenance"),
    OTHER: t("أخرى", "Other"),
  };
  const timelineStatusLabel: Record<string, string> = {
    ...statusLabel,
    AVAILABLE: t("متاح", "Available"),
    IN_USE: t("قيد الاستخدام", "In use"),
    RESERVED: t("محجوز", "Reserved"),
    EMERGENCY_RESERVED: t("محجوز للطوارئ", "Reserved for emergencies"),
    APPROVAL_REQUIRED: t("بانتظار الموافقة", "Awaiting approval"),
    WAITING_CLEANING: t("بانتظار التعقيم", "Awaiting cleaning"),
    CLEANING: t("قيد التعقيم", "Cleaning"),
    MAINTENANCE: t("صيانة", "Maintenance"),
    OUT_OF_SERVICE: t("خارج الخدمة", "Out of service"),
  };
  return { TABS, statusLabel, severityLabel, timelineCategoryLabel, timelineStatusLabel };
}

export default function MaintenancePage() {
  const { t } = useI18n();
  const { TABS } = getLabels(t);
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("tickets");
  const [machines, setMachines] = useState<Machine[]>([]);

  useEffect(() => {
    if (!user) return;
    apiFetch("/machines").then(setMachines).catch(() => setMachines([]));
  }, [user]);

  if (!user) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-foreground">{t("الصيانة", "Maintenance")}</h1>

      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label={t("أقسام الصيانة", "Maintenance sections")}>
        {TABS.map((entry) => (
          <Button key={entry.key} size="sm" variant={tab === entry.key ? "primary" : "secondary"} aria-pressed={tab === entry.key} onPress={() => setTab(entry.key)}>
            {entry.label}
          </Button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "tickets" && <TicketsTab user={user} machines={machines} />}
        {tab === "timeline" && <TimelineTab machines={machines} />}
      </div>
    </AdminShell>
  );
}

function TicketsTab({ user, machines }: { user: { permissions: string[] }; machines: Machine[] }) {
  const { t } = useI18n();
  const { statusLabel, severityLabel } = getLabels(t);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [statusFilter, setStatusFilter] = useState<MaintenanceTicketStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showReportForm, setShowReportForm] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState("");
  const [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]);
  const [reportFormKey, setReportFormKey] = useState(0);

  function refresh() {
    const params = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch(`/maintenance-tickets${params}`).then(setTickets).catch(() => setTickets([]));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (!user.permissions.includes("maintenance.manage")) return;
    apiFetch("/maintenance-tickets/assignees").then(setStaff).catch(() => setStaff([]));
  }, [user]);

  async function handleReport(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/maintenance-tickets", { method: "POST", body: form });
      (e.target as HTMLFormElement).reset();
      setReportFormKey((k) => k + 1);
      setShowReportForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر تسجيل بلاغ العطل", "Unable to report the fault"));
    } finally {
      setBusy(false);
    }
  }

  async function handleAssign(ticketId: string) {
    if (!assigneeId) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/maintenance-tickets/${ticketId}/assign`, {
        method: "POST",
        body: JSON.stringify({ assignedToId: assigneeId }),
      });
      setAssigningId(null);
      setAssigneeId("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إسناد التذكرة", "Unable to assign the ticket"));
    } finally {
      setBusy(false);
    }
  }

  async function advance(ticketId: string, status: "IN_PROGRESS" | "WAITING_PART" | "COMPLETED") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/maintenance-tickets/${ticketId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر تحديث حالة التذكرة", "Unable to update the ticket status"));
    } finally {
      setBusy(false);
    }
  }

  // A ticket raised by mistake, before any repair work started: the machine
  // goes back to service and the reason is kept in the ticket history.
  async function cancelTicket(ticketId: string) {
    const reason = window.prompt(t("سبب إلغاء البلاغ؟", "Reason for cancelling this ticket?"));
    if (!reason?.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/maintenance-tickets/${ticketId}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إلغاء البلاغ", "Unable to cancel the ticket"));
    } finally {
      setBusy(false);
    }
  }

  async function close(ticketId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/maintenance-tickets/${ticketId}/close`, { method: "POST", body: JSON.stringify({}) });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إغلاق التذكرة", "Unable to close the ticket"));
    } finally {
      setBusy(false);
    }
  }

  const canManage = user.permissions.includes("maintenance.manage");

  return (
    <div>
      <div className="flex items-center justify-between">
        <FilterSelect
          className="min-w-[10rem]"
          aria-label={t("فلتر الحالة", "Status filter")}
          value={statusFilter}
          onChange={(id) => setStatusFilter(id as MaintenanceTicketStatus | "")}
          options={[
            { id: "", label: t("كل الحالات", "All statuses") },
            ...Object.entries(statusLabel).map(([id, label]) => ({ id, label })),
          ]}
        />
        {user.permissions.includes("machine.fault.report") && (
          <Button size="sm" variant="danger" onPress={() => setShowReportForm((v) => !v)}>
            {t("+ بلاغ عطل", "+ Report fault")}
          </Button>
        )}
      </div>

      <ErrorNote message={error} className="mt-3" />

      {showReportForm && (
        <form key={reportFormKey} onSubmit={handleReport} className="mt-4 max-w-lg space-y-2 rounded-lg border border-border bg-surface p-4">
          <FilterSelect
            name="machineId"
            required
            className="w-full"
            aria-label={t("الجهاز", "Machine")}
            placeholder={t("اختر الجهاز...", "Select a machine...")}
            options={machines.filter((m) => m.status !== "OUT_OF_SERVICE").map((m) => ({ id: m.id, label: m.machineCode }))}
          />
          <textarea name="problem" required placeholder={t("وصف المشكلة", "Problem description")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" rows={3} />
          <FilterSelect
            name="severity"
            required
            className="w-full"
            aria-label={t("درجة الخطورة", "Severity")}
            placeholder={t("درجة الخطورة...", "Severity...")}
            options={Object.entries(severityLabel).map(([id, label]) => ({ id, label }))}
          />
          <div>
            <label className="block text-xs text-muted">{t("صورة (اختياري)", "Photo (optional)")}</label>
            <input type="file" name="attachment" accept="image/*" className="mt-1 w-full text-sm" />
          </div>
          <button type="submit" disabled={busy} className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50">
            {t("إرسال البلاغ", "Submit report")}
          </button>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-start text-sm">
          <thead className="bg-surface-secondary text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("الجهاز", "Machine")}</th>
              <th className="px-4 py-2 font-medium">{t("المشكلة", "Problem")}</th>
              <th className="px-4 py-2 font-medium">{t("الخطورة", "Severity")}</th>
              <th className="px-4 py-2 font-medium">{t("الحالة", "Status")}</th>
              <th className="px-4 py-2 font-medium">{t("المسؤول", "Assignee")}</th>
              <th className="px-4 py-2 font-medium">{t("صورة", "Photo")}</th>
              {canManage && <th className="px-4 py-2 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {tickets.map((entry) => (
              <tr key={entry.id} className="border-t border-border">
                <td className="px-4 py-2">{entry.machine?.machineCode}</td>
                <td className="px-4 py-2 max-w-xs truncate text-muted">{entry.problem}</td>
                <td className="px-4 py-2">
                  <span className={`status-badge ${severityTone[entry.severity]}`}>{severityLabel[entry.severity]}</span>
                </td>
                <td className="px-4 py-2"><StatusBadge group="maintenanceTicket" value={entry.status} /></td>
                <td className="px-4 py-2 text-muted">{entry.assignedTo?.fullName ?? "-"}</td>
                <td className="px-4 py-2">{entry.attachmentUrl && <AttachmentThumbnail ticketId={entry.id} />}</td>
                {canManage && (
                  <td className="px-4 py-2">
                    {entry.status === "OPEN" && (
                      assigningId === entry.id ? (
                        <div className="flex items-center gap-1">
                          <FilterSelect
                            className="min-w-[10rem]"
                            aria-label={t("الفني", "Technician")}
                            value={assigneeId}
                            onChange={setAssigneeId}
                            placeholder={t("اختر فني...", "Select a technician...")}
                            options={staff.map((s) => ({ id: s.id, label: s.fullName }))}
                          />
                          <Button size="sm" variant="primary" isDisabled={busy} onPress={() => handleAssign(entry.id)}>{t("إسناد", "Assign")}</Button>
                          <Button size="sm" variant="ghost" onPress={() => setAssigningId(null)}>{t("إلغاء", "Cancel")}</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" onPress={() => setAssigningId(entry.id)}>{t("إسناد", "Assign")}</Button>
                      )
                    )}
                    {entry.status === "ASSIGNED" && (
                      <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => advance(entry.id, "IN_PROGRESS")}>{t("بدء العمل", "Start work")}</Button>
                    )}
                    {entry.status === "IN_PROGRESS" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => advance(entry.id, "WAITING_PART")}>{t("بانتظار قطعة", "Awaiting part")}</Button>
                        <Button size="sm" variant="primary" isDisabled={busy} onPress={() => advance(entry.id, "COMPLETED")}>{t("إكمال", "Complete")}</Button>
                      </div>
                    )}
                    {entry.status === "WAITING_PART" && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => advance(entry.id, "IN_PROGRESS")}>{t("استئناف العمل", "Resume work")}</Button>
                        <Button size="sm" variant="primary" isDisabled={busy} onPress={() => advance(entry.id, "COMPLETED")}>{t("إكمال", "Complete")}</Button>
                      </div>
                    )}
                    {(entry.status === "OPEN" || entry.status === "ASSIGNED") && (
                      <Button size="sm" variant="danger" className="mt-1" isDisabled={busy} onPress={() => cancelTicket(entry.id)}>{t("إلغاء البلاغ", "Cancel ticket")}</Button>
                    )}
                    {entry.status === "COMPLETED" && (
                      <Button size="sm" variant="primary" isDisabled={busy} onPress={() => close(entry.id)}>{t("إغلاق وإعادة الجهاز للخدمة", "Close and return machine to service")}</Button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {tickets.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-4 py-6 text-center text-muted">{t("لا توجد تذاكر صيانة", "No maintenance tickets")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AttachmentThumbnail({ ticketId }: { ticketId: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    apiFetchBlob(`/maintenance-tickets/${ticketId}/attachment`)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ticketId]);

  if (!url) return <span className="text-xs text-muted">...</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={t("صورة العطل", "Fault photo")} className="h-10 w-10 rounded object-cover" />;
}

function TimelineTab({ machines }: { machines: Machine[] }) {
  const { t, formatDate, formatNumber } = useI18n();
  const { timelineCategoryLabel, timelineStatusLabel } = getLabels(t);
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
      setError(err instanceof Error ? err.message : t("تعذر حساب فترة التعطل", "Unable to calculate downtime"));
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-muted">{t("الجهاز:", "Machine:")}</label>
        <FilterSelect
          className="min-w-[10rem]"
          aria-label={t("الجهاز", "Machine")}
          value={machineId}
          onChange={(id) => {
            setMachineId(id);
            setDowntime(null);
            if (id) loadTimeline(id);
            else setEvents([]);
          }}
          placeholder={t("اختر جهازاً...", "Select a machine...")}
          options={machines.map((m) => ({ id: m.id, label: m.machineCode }))}
        />
      </div>

      {machineId && (
        <>
          <form onSubmit={loadDowntime} className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-4">
            <label className="text-xs text-muted">{t("من", "From")}</label>
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} required className="rounded-md border border-border px-2 py-1 text-xs" />
            <label className="text-xs text-muted">{t("إلى", "To")}</label>
            <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} required className="rounded-md border border-border px-2 py-1 text-xs" />
            <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">{t("حساب فترة التعطل", "Calculate downtime")}</button>
          </form>
          <ErrorNote message={error} className="mt-2" />
          {downtime && (
            <p className="mt-2 text-sm text-muted">
              {t("إجمالي التعطل:", "Total downtime:")} <span className="font-semibold text-foreground">{formatNumber(downtime.totalDowntimeHours, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t("ساعة", "hours")}</span>{" "}
              ({formatNumber(downtime.intervals.length)} {t("فترة)", "intervals)")}
            </p>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-start text-sm">
              <thead className="bg-surface-secondary text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("الوقت", "Time")}</th>
                  <th className="px-4 py-2 font-medium">{t("التصنيف", "Category")}</th>
                  <th className="px-4 py-2 font-medium">{t("التحول", "Transition")}</th>
                  <th className="px-4 py-2 font-medium">{t("بواسطة", "By")}</th>
                  <th className="px-4 py-2 font-medium">{t("السبب", "Reason")}</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-4 py-2 text-muted">{formatDate(e.timestamp, { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="px-4 py-2">{timelineCategoryLabel[e.category]}</td>
                    <td className="px-4 py-2 text-muted">
                      {e.fromStatus ? timelineStatusLabel[e.fromStatus] ?? e.fromStatus : "-"}
                      {" → "}
                      {e.toStatus ? timelineStatusLabel[e.toStatus] ?? e.toStatus : "-"}
                    </td>
                    <td className="px-4 py-2 text-muted">{e.changedBy?.fullName ?? "-"}</td>
                    <td className="px-4 py-2 text-muted">{e.reason ?? "-"}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted">{t("لا توجد أحداث بعد لهذا الجهاز", "No events for this machine yet")}</td>
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
