"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/components/Toaster";
import { DialysisScheduleEntry, Patient } from "@/lib/types";

const STATION_STORAGE_KEY = "dcms_reception_station_id";

export default function ReceptionPage() {
  const { t, formatNumber } = useI18n();
  const scheduleTypeLabel = {
    REGULAR: t("اعتيادية", "Regular"),
    EXTRA: t("إضافية", "Extra"),
    EMERGENCY: t("طارئة", "Emergency"),
  };
  const severityLabel = {
    CRITICAL: t("حرج", "Critical"),
    IMPORTANT: t("مهم", "Important"),
    INFORMATION: t("معلومات", "Information"),
  };
  const shiftLabel: Record<string, string> = {
    SHIFT_1: t("الشفت الأول", "Shift 1"),
    SHIFT_2: t("الشفت الثاني", "Shift 2"),
    SHIFT_3: t("الشفت الثالث", "Shift 3"),
    SHIFT_4: t("الشفت الرابع", "Shift 4"),
  };

  const user = useCurrentUser();
  const [barcode, setBarcode] = useState("");
  const [patient, setPatient] = useState<Patient | null>(null);
  const [schedules, setSchedules] = useState<DialysisScheduleEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);

  // Per-browser station name, set once per desk (docs review DCMS-040: a
  // shared hardcoded literal for every reception device recorded nothing
  // real). This is not device authentication - it's the minimum needed so
  // check-in events are attributable to *a* named station at all.
  const [stationId, setStationId] = useState("");
  useEffect(() => {
    try {
      setStationId(localStorage.getItem(STATION_STORAGE_KEY) ?? "");
    } catch {
      // localStorage unavailable (private mode, blocked) - station must be typed each session
    }
  }, []);

  function handleStationChange(value: string) {
    setStationId(value);
    try {
      localStorage.setItem(STATION_STORAGE_KEY, value);
    } catch {
      // best-effort only
    }
  }

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
      const message = err instanceof Error ? err.message : t("لم يتم العثور على المريض", "Patient not found");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
      setBarcode("");
    }
  }

  async function handleCheckIn(scheduleId: string) {
    if (!patient) return;
    if (!stationId.trim()) {
      setError(t("حدد اسم محطة الاستقبال أولاً", "Enter the reception station name first"));
      return;
    }
    setCheckingInId(scheduleId);
    setError(null);
    try {
      await apiFetch(`/sessions/${scheduleId}/check-in`, {
        method: "POST",
        body: JSON.stringify({ stationId: stationId.trim() }),
      });
      await loadByBarcode(patient.barcode);
      toast.success(t("تم تسجيل الحضور", "Checked in"));
    } catch (err) {
      const message = err instanceof Error ? err.message : t("تعذر تسجيل الحضور", "Unable to check in");
      setError(message);
      toast.error(message);
    } finally {
      setCheckingInId(null);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">{t("الاستقبال — مسح الباركود", "Reception — Barcode check-in")}</h1>

      <div className="mt-4 max-w-md">
        <label className="mb-1 block text-xs text-slate-500">{t("محطة الاستقبال (تُحفظ بهذا الجهاز)", "Reception station (saved on this device)")}</label>
        <input
          value={stationId}
          onChange={(e) => handleStationChange(e.target.value)}
          placeholder={t("مثال: استقبال-1", "Example: Reception-1")}
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:outline-none"
        />
      </div>

      <form onSubmit={handleScan} className="mt-4 flex max-w-md gap-2">
        <input
          autoFocus
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder={t("امسح أو أدخل الباركود...", "Scan or enter barcode...")}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {t("بحث", "Search")}
        </button>
      </form>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {patient && (
        <div className="mt-6 max-w-2xl rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{patient.fullName}</h2>
              <p className="text-sm text-slate-500">
                {patient.patientCode} {t("· رقم الإضبارة:", "· File number:")} {patient.fileNumber ?? "-"}
              </p>
            </div>
            <Link href={`/admin/patients/${patient.id}`} className="text-xs text-slate-500 hover:underline">
              {t("فتح الملف", "Open record")}
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
                    [{severityLabel[a.severity]}] {a.category}: {a.message}
                  </div>
                ))}
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-500">{t("جلسات اليوم", "Today’s sessions")}</h3>
            {schedules.length === 0 && (
              <p className="mt-2 text-sm text-slate-400">{t("لا توجد جلسة مجدولة اليوم لهذا المريض", "No sessions scheduled for this patient today")}</p>
            )}
            <div className="mt-2 space-y-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {shiftLabel[s.shift.name] ?? s.shift.name} <span className="text-slate-400">({scheduleTypeLabel[s.type]})</span>
                    </p>
                    <p className="flex items-center gap-2 text-xs text-slate-500">
                      <StatusBadge group="schedule" value={s.status} />
                      {s.lateMinutes != null && s.lateMinutes > 0
                        ? t(` — تأخر ${formatNumber(s.lateMinutes)} دقيقة`, ` — ${formatNumber(s.lateMinutes)} min late`)
                        : ""}
                    </p>
                  </div>
                  {s.status === "SCHEDULED" || s.status === "ABSENT" ? (
                    <button
                      onClick={() => handleCheckIn(s.id)}
                      disabled={checkingInId === s.id || !stationId.trim()}
                      title={!stationId.trim() ? t("حدد اسم محطة الاستقبال أولاً", "Enter the reception station name first") : undefined}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {t("تسجيل حضور", "Check in")}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">{t("تم", "Done")}</span>
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
