"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { DialysisScheduleEntry } from "@/lib/types";

// Local (not UTC) date parts - the backend anchors "today" to the center's
// local calendar day too, so this must match (see apps/api/.../date.util.ts).
function toLocalDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const statusLabel: Record<string, string> = {
  SCHEDULED: "متوقع",
  ARRIVED: "حضر",
  LATE: "متأخر",
  ABSENT: "غائب",
  CANCELLED: "ملغى",
  EXTRA: "إضافية",
  EMERGENCY: "طارئة",
};

// Short-polling status board (docs/PROJECT-PHASES-PLAN.md Phase 3 acceptance
// criterion: "Real-time أو Polling قصير"). Only polls when viewing today -
// there's no reason to keep re-fetching a fixed historical/future date.
const POLL_MS = 15000;

const STATUS_ORDER: { key: string; label: string; className: string }[] = [
  { key: "SCHEDULED", label: "متوقع", className: "bg-slate-100 text-slate-700" },
  { key: "ARRIVED", label: "حضر", className: "bg-emerald-100 text-emerald-700" },
  { key: "LATE", label: "متأخر", className: "bg-amber-100 text-amber-700" },
  { key: "ABSENT", label: "غائب", className: "bg-red-100 text-red-700" },
];

export default function SchedulePage() {
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
        .catch(() => {
          if (!cancelled) setEntries([]);
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
          [scheduleId]: `تم إنشاء طلب موافقة لجهاز ${result.machine?.machineCode ?? ""} - بانتظار القرار`,
        }));
      }
    } catch (err) {
      setAssignError((prev) => ({
        ...prev,
        [scheduleId]: err instanceof Error ? err.message : "تعذر تعيين الجهاز",
      }));
    } finally {
      setAssigning(null);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
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
        <h1 className="text-xl font-semibold text-slate-800">الجدول اليومي</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(toLocalDateInputValue(new Date()))}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            اليوم
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {STATUS_ORDER.map((s) => (
          <div key={s.key} className={`rounded-lg px-4 py-2 text-sm font-medium ${s.className}`}>
            {s.label}: {statusCounts[s.key] ?? 0}
          </div>
        ))}
      </div>

      {loading && <p className="mt-6 text-sm text-slate-400">جاري التحميل...</p>}
      {!loading && entries.length === 0 && (
        <p className="mt-6 text-sm text-slate-400">لا توجد جلسات مجدولة لهذا اليوم</p>
      )}

      <div className="mt-6 space-y-6">
        {Object.entries(grouped).map(([shiftName, rows]) => (
          <section key={shiftName} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-600">
              {shiftName} <span className="font-normal text-slate-400">({rows.length} مريض)</span>
            </div>
            <table className="w-full text-right text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-medium">المريض</th>
                  <th className="px-4 py-2 font-medium">الحالة</th>
                  <th className="px-4 py-2 font-medium">النوع / السبب</th>
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
                      {statusLabel[row.status] ?? row.status}
                      {row.lateMinutes != null && row.lateMinutes > 0 ? ` (${row.lateMinutes} د)` : ""}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {row.type}
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
                              جلسة الديلزة
                            </Link>
                          )}
                        {(row.status === "ARRIVED" || row.status === "LATE") && (
                          <Link
                            href={`/admin/sessions/${row.id}/supplies`}
                            className="text-xs font-medium text-slate-600 hover:underline"
                          >
                            المستلزمات
                          </Link>
                        )}
                        {user.permissions.includes("machine.assign") &&
                          (row.status === "ARRIVED" || row.status === "LATE") &&
                          (row.machineId ? (
                            <span className="text-xs text-emerald-600">تم تعيين جهاز</span>
                          ) : (
                            <button
                              onClick={() => handleAssignMachine(row.id)}
                              disabled={assigning === row.id}
                              className="text-xs font-medium text-slate-600 hover:underline disabled:opacity-50"
                            >
                              {assigning === row.id ? "جاري التعيين..." : "تعيين جهاز"}
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
