"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonTable } from "@/components/Skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/components/Toaster";
import { DialysisScheduleEntry } from "@/lib/types";

// Local (not UTC) date parts - the backend anchors "today" to the center's
// local calendar day too, so this must match (see apps/api/.../date.util.ts).
function toLocalDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Short-polling status board (docs/PROJECT-PHASES-PLAN.md Phase 3 acceptance
// criterion: "Real-time أو Polling قصير"). Only polls when viewing today -
// there's no reason to keep re-fetching a fixed historical/future date.
const POLL_MS = 15000;

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

  const isToday = date === toLocalDateInputValue(new Date());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    function load(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      apiFetch(`/schedule?date=${date}`)
        .then((data) => {
          if (!cancelled) setEntries(data);
        })
        .catch((err) => {
          if (cancelled) return;
          setEntries([]);
          // Only surface failures on the visible (spinner) load - a transient
          // background poll failure every 15s would spam toasts otherwise.
          if (showSpinner) {
            toast.error(err instanceof Error ? err.message : t("تعذر تحميل الجدول", "Unable to load the schedule"));
          }
        })
        .finally(() => {
          if (!cancelled && showSpinner) setLoading(false);
        });
    }

    load(true);
    const interval = isToday ? setInterval(() => load(false), POLL_MS) : undefined;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [user, date, isToday]);

  async function handleAssignMachine(scheduleId: string) {
    setAssigning(scheduleId);
    setAssignError((prev) => ({ ...prev, [scheduleId]: "" }));
    try {
      const result = await apiFetch(`/sessions/${scheduleId}/assign-machine`, {
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
          <EmptyState icon="📅" title={t("لا توجد جلسات مجدولة لهذا اليوم", "No sessions scheduled for this day")}
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
                      <Link href={`/admin/patients/${row.patientId}`} className="text-slate-800 hover:underline">
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
                              href={`/admin/sessions/${row.id}`}
                              className="text-xs font-medium text-slate-600 hover:underline"
                            >
                              {t("جلسة الديلزة", "Dialysis session")}
                            </Link>
                          )}
                        {(row.status === "ARRIVED" || row.status === "LATE") && (
                          <Link
                            href={`/admin/sessions/${row.id}/supplies`}
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
