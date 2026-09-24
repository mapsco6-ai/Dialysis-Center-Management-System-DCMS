"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Button } from "@heroui/react";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
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
  const severityTone: Record<string, string> = {
    CRITICAL: "tone-danger",
    IMPORTANT: "tone-warning",
    INFORMATION: "tone-info",
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
    const data = await apiFetch(`/appointments/scan/${encodeURIComponent(code)}`);
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
      await apiFetch(`/appointments/${scheduleId}/check-in`, {
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
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-foreground">{t("الاستقبال — مسح الباركود", "Reception — Barcode check-in")}</h1>

      <div className="mt-4 max-w-md">
        <label className="mb-1 block text-xs text-muted">{t("محطة الاستقبال (تُحفظ بهذا الجهاز)", "Reception station (saved on this device)")}</label>
        <input
          value={stationId}
          onChange={(e) => handleStationChange(e.target.value)}
          placeholder={t("مثال: استقبال-1", "Example: Reception-1")}
          className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
        />
      </div>

      <form onSubmit={handleScan} className="mt-4 flex max-w-md gap-2">
        <input
          autoFocus
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder={t("امسح أو أدخل الباركود...", "Scan or enter barcode...")}
          className="flex-1 rounded-md border border-border px-3 py-2 text-sm"
        />
        <button type="submit" disabled={loading} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50">
          {t("بحث", "Search")}
        </button>
      </form>

      <ErrorNote message={error} className="mt-4" />

      {patient && (
        <div className="mt-6 max-w-2xl rounded-lg border border-border bg-surface p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{patient.fullName}</h2>
              <p className="text-sm text-muted">
                {patient.patientCode} {t("· رقم الإضبارة:", "· File number:")} {patient.fileNumber ?? "-"}
              </p>
            </div>
            <Link href={`/admin/care/patients/${patient.id}`} className="text-xs text-muted hover:underline">
              {t("فتح الملف", "Open record")}
            </Link>
          </div>

          {patient.alerts && patient.alerts.filter((a) => !a.resolvedAt).length > 0 && (
            <div className="mt-3 space-y-1">
              {patient.alerts
                .filter((a) => !a.resolvedAt)
                .map((a) => (
                  <div key={a.id} className={`status-badge ${severityTone[a.severity] ?? "tone-neutral"} max-w-full whitespace-normal px-3 py-1.5 text-xs`}>
                    [{severityLabel[a.severity]}] {a.category}: {a.message}
                  </div>
                ))}
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-muted">{t("جلسات اليوم", "Today’s sessions")}</h3>
            {schedules.length === 0 && (
              <p className="mt-2 text-sm text-muted">{t("لا توجد جلسة مجدولة اليوم لهذا المريض", "No sessions scheduled for this patient today")}</p>
            )}
            <div className="mt-2 space-y-2">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md border border-border px-4 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {shiftLabel[s.shift.name] ?? s.shift.name} <span className="text-muted">({scheduleTypeLabel[s.type]})</span>
                    </p>
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <StatusBadge group="schedule" value={s.status} />
                      {s.lateMinutes != null && s.lateMinutes > 0
                        ? t(` — تأخر ${formatNumber(s.lateMinutes)} دقيقة`, ` — ${formatNumber(s.lateMinutes)} min late`)
                        : ""}
                    </p>
                  </div>
                  {s.status === "SCHEDULED" || s.status === "ABSENT" ? (
                    <span title={!stationId.trim() ? t("حدد اسم محطة الاستقبال أولاً", "Enter the reception station name first") : undefined}>
                      <Button
                        size="sm"
                        variant="primary"
                        isDisabled={checkingInId === s.id || !stationId.trim()}
                        onPress={() => handleCheckIn(s.id)}
                      >
                        {t("تسجيل حضور", "Check in")}
                      </Button>
                    </span>
                  ) : (
                    <span className="text-xs text-muted">{t("تم", "Done")}</span>
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
