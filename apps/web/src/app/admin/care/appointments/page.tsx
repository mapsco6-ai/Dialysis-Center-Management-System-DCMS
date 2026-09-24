"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonTable } from "@/components/Skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/components/Toaster";
import { DialysisScheduleEntry } from "@/lib/types";

interface Shift { id: string; name: string }

// Inline "move this appointment" form: new date + shift + a reason that goes
// to the audit trail. The API keeps the old row as RESCHEDULED.
function RescheduleForm({ entry, shifts, shiftLabel, onDone, onCancel }: { entry: DialysisScheduleEntry; shifts: Shift[]; shiftLabel: Record<string, string>; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ scheduledDate: "", shiftId: "", reason: "" });
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await apiFetch(`/appointments/${entry.id}/reschedule`, { method: "POST", body: JSON.stringify(form) });
      toast.success(t("تمت إعادة الجدولة", "Appointment rescheduled"));
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("تعذرت إعادة الجدولة", "Could not reschedule"));
    } finally {
      setBusy(false);
    }
  }
  const field = "rounded-md border border-slate-300 px-2 py-1 text-xs";
  return (
    <form onSubmit={submit} className="mt-1 flex flex-col gap-1 rounded-md border border-slate-200 bg-slate-50 p-2">
      <div className="flex gap-1">
        <input required type="date" className={field} value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} aria-label={t("التاريخ الجديد", "New date")} />
        <select required className={field} value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })} aria-label={t("الوردية", "Shift")}>
          <option value="">{t("الوردية…", "Shift…")}</option>
          {shifts.map((s) => <option key={s.id} value={s.id}>{shiftLabel[s.name] ?? s.name}</option>)}
        </select>
      </div>
      <input required className={field} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder={t("سبب النقل", "Reason")} />
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-2 py-1 text-xs text-white disabled:opacity-50">{t("نقل الموعد", "Move")}</button>
        <button type="button" onClick={onCancel} className="text-xs text-slate-500 underline">{t("إلغاء", "Cancel")}</button>
      </div>
    </form>
  );
}

// Local (not UTC) date parts - the backend anchors "today" to the center's
// local calendar day too, so this must match (see apps/api/.../date.util.ts).
function toLocalDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function SchedulePage() {
  const { t, formatNumber } = useI18n();
  const scheduleTypeLabel = {
    REGULAR: t("اعتيادية", "Regular"),
    EXTRA: t("إضافية", "Extra"),
    EMERGENCY: t("طارئة", "Emergency"),
  };
  const shiftLabel: Record<string, string> = {
    SHIFT_1: t("الشفت الأول", "Shift 1"),
    SHIFT_2: t("الشفت الثاني", "Shift 2"),
    SHIFT_3: t("الشفت الثالث", "Shift 3"),
    SHIFT_4: t("الشفت الرابع", "Shift 4"),
  };
  const STATUS_ORDER: { key: string; label: string; className: string }[] = [
    { key: "SCHEDULED", label: t("متوقع", "Expected"), className: "bg-slate-100 text-slate-700" },
    { key: "ARRIVED", label: t("حضر", "Arrived"), className: "bg-emerald-100 text-emerald-700" },
    { key: "LATE", label: t("متأخر", "Late"), className: "bg-amber-100 text-amber-700" },
    { key: "ABSENT", label: t("غائب", "Absent"), className: "bg-red-100 text-red-700" },
  ];

  const user = useCurrentUser();
  const [date, setDate] = useState(() => toLocalDateInputValue(new Date()));
  const [entries, setEntries] = useState<DialysisScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  useEffect(() => {
    if (reschedulingId && shifts.length === 0) apiFetch("/shifts").then(setShifts).catch(() => undefined);
  }, [reschedulingId, shifts.length]);

  const reloadQuiet = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    function load(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      apiFetch(`/appointments?date=${date}`)
        .then((data) => {
          if (!cancelled) setEntries(data);
        })
        .catch((err) => {
          if (cancelled) return;
          setEntries([]);
          if (showSpinner) {
            toast.error(err instanceof Error ? err.message : t("تعذر تحميل الجدول", "Unable to load the schedule"));
          }
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLoading(false);
        });
    }

    reloadQuiet.current = () => load(false);
    load(true);
    return () => {
      cancelled = true;
    };
  }, [user, date, reloadKey, t]);

  useLiveEvents((event) => {
    if (event.entity === "schedule") reloadQuiet.current();
  });

  async function handleAssignMachine(scheduleId: string) {
    setAssigning(scheduleId);
    setAssignError((prev) => ({ ...prev, [scheduleId]: "" }));
    try {
      const result = await apiFetch(`/appointments/${scheduleId}/session/machine`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setEntries((prev) =>
        prev.map((e) =>
          e.id === scheduleId
            ? { ...e, machineId: result.approval ? e.machineId : (result.machine?.id ?? e.machineId) }
            : e,
        ),
      );
      if (result.approval) {
        setAssignError((prev) => ({
          ...prev,
          [scheduleId]: t(
            `تم إنشاء طلب موافقة لجهاز ${result.machine?.machineCode ?? ""} - بانتظار القرار`,
            `Approval requested for machine ${result.machine?.machineCode ?? ""} — awaiting a decision`,
          ),
        }));
      }
    } catch (err) {
      setAssignError((prev) => ({
        ...prev,
        [scheduleId]: err instanceof Error ? err.message : t("تعذر تعيين الجهاز", "Unable to assign machine"),
      }));
    } finally {
      setAssigning(null);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const statusCounts = entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.status] = (acc[entry.status] ?? 0) + 1;
    return acc;
  }, {});

  const grouped = entries.reduce<Record<string, DialysisScheduleEntry[]>>((acc, entry) => {
    (acc[entry.shift.name] ??= []).push(entry);
    return acc;
  }, {});

  return (
    <AdminShell user={user}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">{t("الجدول اليومي", "Daily schedule")}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(toLocalDateInputValue(new Date()))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            {t("اليوم", "Today")}
          </button>
          <input
            type="date"
            aria-label={t("تاريخ الجدول", "Schedule date")}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {STATUS_ORDER.map((s) => (
          <div key={s.key} className={`rounded-lg px-4 py-2 text-sm font-medium ${s.className}`}>
            {s.label}: {formatNumber(statusCounts[s.key] ?? 0)}
          </div>
        ))}
      </div>

      {loading && <div className="mt-6"><SkeletonTable rows={4} columns={4} /></div>}
      {!loading && entries.length === 0 && (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white">
          <EmptyState title={t("لا توجد جلسات مجدولة لهذا اليوم", "No sessions scheduled for this day")}
            description={t("اختر تاريخاً آخر، أو أنشئ موعداً من خطة المريض.", "Pick another date, or create an appointment from a patient's plan.")} />
        </div>
      )}

      <div className="mt-6 space-y-6">
        {Object.entries(grouped).map(([shiftName, rows]) => (
          <section key={shiftName} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
              {shiftLabel[shiftName] ?? shiftName} <span className="font-normal text-slate-400">{t(`(${formatNumber(rows.length)} مريض)`, `(${formatNumber(rows.length)} patients)`)}</span>
            </div>
            <table className="w-full text-start text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("المريض", "Patient")}</th>
                  <th className="px-4 py-2 font-medium">{t("الحالة", "Status")}</th>
                  <th className="px-4 py-2 font-medium">{t("النوع / السبب", "Type / reason")}</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <Link href={`/admin/care/patients/${row.patientId}`} className="text-slate-800 hover:underline">
                        {row.patient.fullName}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge group="schedule" value={row.status} />
                      {row.lateMinutes != null && row.lateMinutes > 0
                        ? t(` (${formatNumber(row.lateMinutes)} د)`, ` (${formatNumber(row.lateMinutes)} min)`)
                        : ""}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {scheduleTypeLabel[row.type]}
                      {row.extraReason ? ` — ${row.extraReason}` : ""}
                      {row.emergencyReason ? ` — ${row.emergencyReason}` : ""}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col items-start gap-1">
                        {(row.status === "ARRIVED" || row.status === "LATE") &&
                          user.permissions.includes("dialysis.session.view") && (
                            <Link
                              href={`/admin/care/sessions/${row.id}`}
                              className="text-xs font-medium text-slate-600 hover:underline"
                            >
                              {t("جلسة الديلزة", "Dialysis session")}
                            </Link>
                          )}
                        {(row.status === "ARRIVED" || row.status === "LATE") && (
                          <Link
                            href={`/admin/care/sessions/${row.id}/supplies`}
                            className="text-xs font-medium text-slate-600 hover:underline"
                          >
                            {t("المستلزمات", "Supplies")}
                          </Link>
                        )}
                        {user.permissions.includes("machine.assign") &&
                          (row.status === "ARRIVED" || row.status === "LATE") &&
                          (row.machineId ? (
                            <span className="text-xs text-emerald-600">{t("تم تعيين جهاز", "Machine assigned")}</span>
                          ) : (
                            <button
                              onClick={() => handleAssignMachine(row.id)}
                              disabled={assigning === row.id}
                              className="text-xs font-medium text-slate-600 hover:underline disabled:opacity-50"
                            >
                              {assigning === row.id ? t("جاري التعيين...", "Assigning...") : t("تعيين جهاز", "Assign machine")}
                            </button>
                          ))}
                        {user.permissions.includes("scheduling.manage") && ["SCHEDULED", "LATE", "ABSENT"].includes(row.status) && !row.machineId && (
                          reschedulingId === row.id ? (
                            <RescheduleForm entry={row} shifts={shifts} shiftLabel={shiftLabel}
                              onCancel={() => setReschedulingId(null)} onDone={() => { setReschedulingId(null); setReloadKey((k) => k + 1); }} />
                          ) : (
                            <button onClick={() => setReschedulingId(row.id)} className="text-xs font-medium text-slate-600 hover:underline">{t("إعادة جدولة", "Reschedule")}</button>
                          )
                        )}
                        {assignError[row.id] && (
                          <span className="text-xs text-amber-600">{assignError[row.id]}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </AdminShell>
  );
}
