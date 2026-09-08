"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { DialysisScheduleEntry, Patient } from "@/lib/types";

const statusLabel: Record<string, string> = {
  SCHEDULED: "متوقع",
  ARRIVED: "حاضر",
  LATE: "متأخر",
  ABSENT: "غائب",
  CANCELLED: "ملغى",
};

export default function ReceptionPage() {
  const user = useCurrentUser();
  const [barcode, setBarcode] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [schedules, setSchedules] = useState<DialysisScheduleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  async function loadByBarcode(code: string) {
    const data = await apiFetch(`/reception/scan/${encodeURIComponent(code)}`);
    setPatient(data.patient);
    setSchedules(data.todaySchedules);
  }

  async function handleScan(event: FormEvent) {
    event.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    setLoading(true);
    setError(null);
    setPatient(null);
    setSchedules([]);
    try {
      await loadByBarcode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "لم يتم العثور على المريض");
    } finally {
      setLoading(false);
      setBarcode("");
    }
  }

  async function handleCheckIn(scheduleId: string) {
    if (!patient) return;
    setCheckingInId(scheduleId);
    setError(null);
    try {
      await apiFetch(`/sessions/${scheduleId}/check-in`, {
        method: "POST",
        body: JSON.stringify({ stationId: "RECEPTION-1" }),
      });
      await loadByBarcode(patient.barcode);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل الحضور");
    } finally {
      setCheckingInId(null);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">الاستقبال — مسح الباركود</h1>

      <form onSubmit={handleScan} className="mt-4 flex max-w-md gap-2">
        <input
          autoFocus
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="امسح أو أدخل الباركود..."
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          بحث
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {patient && (
        <div className="mt-6 max-w-2xl rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{patient.fullName}</h2>
              <p className="text-sm text-slate-500">
                {patient.patientCode} &middot; رقم الإضبارة: {patient.fileNumber ?? "-"}
              </p>
            </div>
            <Link href={`/admin/patients/${patient.id}`} className="text-xs text-slate-500 hover:underline">
              فتح الملف
            </Link>
          </div>

          {patient.alerts && patient.alerts.filter((a) => !a.resolvedAt).length > 0 && (
            <div className="mt-3 space-y-1">
              {patient.alerts
                .filter((a) => !a.resolvedAt)
                .map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-xs text-red-800"
                  >
                    [{a.severity}] {a.category}: {a.message}
                  </div>
                ))}
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-500">جلسات اليوم</h3>
            {schedules.length === 0 && (
              <p className="mt-2 text-sm text-slate-400">لا توجد جلسة مجدولة اليوم لهذا المريض</p>
            )}
            <div className="mt-2 space-y-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {s.shift.name} <span className="text-slate-400">({s.type})</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {statusLabel[s.status] ?? s.status}
                      {s.lateMinutes != null && s.lateMinutes > 0 ? ` — تأخر ${s.lateMinutes} دقيقة` : ""}
                    </p>
                  </div>
                  {s.status === "SCHEDULED" || s.status === "ABSENT" ? (
                    <button
                      onClick={() => handleCheckIn(s.id)}
                      disabled={checkingInId === s.id}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      تسجيل حضور
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">تم</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
