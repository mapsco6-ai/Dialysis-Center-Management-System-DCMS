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

export default function SchedulePage() {
  const user = useCurrentUser();
  const [date, setDate] = useState(() => toLocalDateInputValue(new Date()));
  const [entries, setEntries] = useState<DialysisScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    apiFetch(`/schedule?date=${date}`)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [user, date]);

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

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
                    <td className="px-4 py-2">{statusLabel[row.status] ?? row.status}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {row.type}
                      {row.extraReason ? ` — ${row.extraReason}` : ""}
                      {row.emergencyReason ? ` — ${row.emergencyReason}` : ""}
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
