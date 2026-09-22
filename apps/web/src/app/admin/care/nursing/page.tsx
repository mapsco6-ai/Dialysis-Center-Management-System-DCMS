"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import { NursingAssignment, Patient, Shift, Ward, WardDashboard } from "@/lib/types";

function toLocalDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const getStatusLabels = (t: (arabic: string, english: string) => string): Record<string, string> => ({
  AVAILABLE: t("متاح", "Available"),
  IN_USE: t("قيد الاستخدام", "In use"),
  RESERVED: t("محجوز", "Reserved"),
  EMERGENCY_RESERVED: t("محجوز للطوارئ", "Emergency reserved"),
  APPROVAL_REQUIRED: t("بانتظار الموافقة", "Awaiting approval"),
  WAITING_CLEANING: t("بانتظار التعقيم", "Awaiting cleaning"),
  CLEANING: t("قيد التعقيم", "Cleaning"),
  MAINTENANCE: t("صيانة", "Maintenance"),
  OUT_OF_SERVICE: t("خارج الخدمة", "Out of service"),
});

const getSessionStatusLabels = (t: (arabic: string, english: string) => string): Record<string, string> => ({
  ASSIGNED: t("تم تعيين الجهاز", "Machine assigned"),
  IN_DIALYSIS: t("الديلزة جارية", "Dialysis in progress"),
  POST_DIALYSIS: t("ما بعد الديلزة", "Post-dialysis"),
  INTERRUPTED: t("متوقفة", "Interrupted"),
});

const POLL_MS = 15000;

const getShiftLabels = (t: (arabic: string, english: string) => string): Record<string, string> => ({
  SHIFT_1: t("الوجبة الأولى", "Shift 1"),
  SHIFT_2: t("الوجبة الثانية", "Shift 2"),
  SHIFT_3: t("الوجبة الثالثة", "Shift 3"),
  SHIFT_4: t("الوجبة الرابعة", "Shift 4"),
});

const getClinicalLabels = (t: (arabic: string, english: string) => string): Record<string, string> => ({
  CRITICAL: t("حرج", "Critical"),
  IMPORTANT: t("مهم", "Important"),
  INFORMATION: t("معلومات", "Information"),
  MEDICATION: t("دواء", "Medication"),
  LAB_REQUEST: t("طلب تحليل", "Lab request"),
  NURSING_INSTRUCTION: t("تعليمات التمريض", "Nursing instruction"),
  DRY_WEIGHT_CHANGE: t("تغيير الوزن الجاف", "Dry weight change"),
  EXTRA_SESSION_REQUEST: t("طلب جلسة إضافية", "Additional session request"),
  PHARMACY_RECOMMENDATION: t("توصية للصيدلي", "Pharmacy recommendation"),
});

export default function NursingPage() {
  const { t, formatNumber } = useI18n();
  const shiftLabels = getShiftLabels(t);
  const clinicalLabels = getClinicalLabels(t);
  const statusLabel = getStatusLabels(t);
  const sessionStatusLabel = getSessionStatusLabels(t);
  const user = useCurrentUser();
  const [wards, setWards] = useState<Ward[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [wardId, setWardId] = useState("");
  const [date, setDate] = useState(() => toLocalDateInputValue(new Date()));
  const [shiftId, setShiftId] = useState("");
  const [dashboard, setDashboard] = useState<WardDashboard | null>(null);
  const [myAssignments, setMyAssignments] = useState<NursingAssignment[]>([]);
  const [wardAssignments, setWardAssignments] = useState<NursingAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pinValue, setPinValue] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    apiFetch("/wards")
      .then((rows: Ward[]) => {
        setWards(rows);
        if (rows.length > 0) setWardId((prev) => prev || rows[0].id);
      })
      .catch(() => setWards([]));
    apiFetch("/shifts")
      .then(setShifts)
      .catch(() => setShifts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  function refreshDashboard() {
    if (!wardId) return;
    const params = new URLSearchParams({ date });
    if (shiftId) params.set("shiftId", shiftId);
    apiFetch(`/wards/${wardId}/dashboard?${params.toString()}`)
      .then(setDashboard)
      .catch((err) => setError(err instanceof Error ? err.message : t("تعذر تحميل لوحة الردهة", "Unable to load ward dashboard")));
  }

  function refreshMyAssignments() {
    apiFetch(`/me/assignments?date=${date}`)
      .then(setMyAssignments)
      .catch(() => setMyAssignments([]));
  }

  function refreshWardAssignments() {
    if (!wardId || !user?.permissions.includes("nursing.assign")) return;
    const params = new URLSearchParams({ wardId, date });
    if (shiftId) params.set("shiftId", shiftId);
    apiFetch(`/nursing-assignments?${params.toString()}`)
      .then(setWardAssignments)
      .catch(() => setWardAssignments([]));
  }

  useEffect(() => {
    if (!user || !wardId) return;
    refreshDashboard();
    refreshMyAssignments();
    refreshWardAssignments();
    const interval = setInterval(refreshDashboard, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, wardId, date, shiftId]);

  async function handleSetPin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPinBusy(true);
    setPinMessage(null);
    try {
      await apiFetch("/me/pin", { method: "PUT", body: JSON.stringify({ pin: pinValue }) });
      setPinMessage(t("تم حفظ الرمز", "PIN saved"));
      setPinValue("");
    } catch (err) {
      setPinMessage(err instanceof Error ? err.message : t("تعذر حفظ الرمز", "Unable to save PIN"));
    } finally {
      setPinBusy(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const canViewAll = user.permissions.includes("nursing.ward.view.all");
  const canAssign = user.permissions.includes("nursing.assign");

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">{t("التمريض - لوحة الردهة", "Nursing — Ward dashboard")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select value={wardId} onChange={(e) => setWardId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {wards.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">{t("كل الوجبات", "All shifts")}</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{shiftLabels[s.name] ?? s.name}</option>
            ))}
          </select>
          <button onClick={() => setDate(toLocalDateInputValue(new Date()))} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            {t("اليوم", "Today")}
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      <ErrorNote message={error} className="mt-4" />
      {!canViewAll && (
        <p className="mt-3 text-xs text-amber-600">
          {t("تعرض هذه الشاشة فقط المرضى المخصصين لك اليوم لهذه الردهة/الوجبة.", "This page shows only the patients assigned to you today for this ward and shift.")}
        </p>
      )}

      {dashboard && (
        <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-start text-sm">
            <thead className="bg-slate-50 text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">{t("الجهاز", "Machine")}</th>
                <th className="px-4 py-2 font-medium">{t("حالة الجهاز", "Machine status")}</th>
                <th className="px-4 py-2 font-medium">{t("المريض", "Patient")}</th>
                <th className="px-4 py-2 font-medium">{t("حالة الجلسة", "Session status")}</th>
                <th className="px-4 py-2 font-medium">{t("الممرض", "Nurse")}</th>
                <th className="px-4 py-2 font-medium">{t("آخر قراءة", "Last reading")}</th>
                <th className="px-4 py-2 font-medium">{t("تنبيهات", "Alerts")}</th>
                <th className="px-4 py-2 font-medium">{t("أوامر الطبيب", "Doctor orders")}</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {dashboard.machines.map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 text-slate-800">{m.machineCode}</td>
                  <td className="px-4 py-2 text-slate-500">{statusLabel[m.status] ?? m.status}</td>
                  {m.session ? (
                    <>
                      <td className="px-4 py-2">
                        <Link href={`/admin/care/patients/${m.session.patientId}`} className="text-slate-800 hover:underline">
                          {m.session.patient.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{sessionStatusLabel[m.session.status] ?? m.session.status}</td>
                      <td className="px-4 py-2 text-slate-500">{m.session.nurse?.fullName ?? "-"}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {m.session.minutesSinceLastReading != null ? t(`منذ ${formatNumber(m.session.minutesSinceLastReading)} د`, `${formatNumber(m.session.minutesSinceLastReading)} min ago`) : t("لا توجد", "None")}
                      </td>
                      <td className="px-4 py-2">
                        {m.session.openAlerts.length > 0 ? (
                          <span
                            title={m.session.openAlerts.map((a) => `[${clinicalLabels[a.severity] ?? a.severity}] ${a.category}: ${a.message}`).join("\n")}
                            className={`rounded-md px-2 py-1 text-xs font-medium ${
                              m.session.openAlerts.some((a) => a.severity === "CRITICAL")
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {formatNumber(m.session.openAlerts.length)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {m.session.activeDoctorOrders.length > 0 ? (
                          <span
                            title={m.session.activeDoctorOrders.map((o) => `${clinicalLabels[o.type] ?? o.type} — ${o.doctor.fullName}`).join("\n")}
                            className="rounded-md bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700"
                          >
                            {formatNumber(m.session.activeDoctorOrders.length)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/admin/care/sessions/${m.session.id}`} className="text-xs font-medium text-slate-600 hover:underline">
                          {t("فتح الجلسة", "Open session")}
                        </Link>
                      </td>
                    </>
                  ) : (
                    <td className="px-4 py-2 text-slate-300" colSpan={6}>
                      {t("لا يوجد مريض ظاهر", "No patient to display")}
                    </td>
                  )}
                </tr>
              ))}
              {dashboard.machines.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-6 text-center text-slate-400">{t("لا توجد أجهزة في هذه الردهة", "No machines in this ward")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("توزيعي اليوم (مرضاي)", "My assignments today")}</h2>
          {myAssignments.length === 0 ? (
            <p className="text-sm text-slate-400">{t("لا يوجد توزيع مسجل لك في هذا التاريخ", "No assignments for you on this date")}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {myAssignments.map((a) => (
                <li key={a.id} className="rounded-md border border-slate-100 p-2">
                  <div className="font-medium text-slate-700">{a.ward.name} — {shiftLabels[a.shift.name] ?? a.shift.name}</div>
                  <div className="text-slate-500">{a.patients.map((p) => p.patient.fullName).join(t("، ", ", ")) || t("لا يوجد مرضى", "No patients")}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("رمز PIN السريع الخاص بي", "My quick-access PIN")}</h2>
          <p className="mb-2 text-xs text-slate-400">
            {t("يُستخدم لتحديد هويتك بدقة عند تنفيذ إجراء من جهاز مشترك يسجّل دخوله بحساب آخر.", "Identifies you when you perform an action on a shared device signed in with another account.")}
          </p>
          <form onSubmit={handleSetPin} className="flex items-center gap-2">
            <input
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value)}
              placeholder={t("4-6 أرقام", "4–6 digits")}
              inputMode="numeric"
              className="w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button type="submit" disabled={pinBusy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
              {t("حفظ", "Save")}
            </button>
          </form>
          {pinMessage && <p className="mt-2 text-xs text-slate-500">{pinMessage}</p>}
        </section>
      </div>

      {canAssign && wardId && (
        <AssignmentManager
          wardId={wardId}
          date={date}
          shiftId={shiftId}
          shifts={shifts}
          assignments={wardAssignments}
          onChanged={refreshWardAssignments}
        />
      )}
    </AdminShell>
  );
}

function AssignmentManager({
  wardId,
  date,
  shiftId,
  shifts,
  assignments,
  onChanged,
}: {
  wardId: string;
  date: string;
  shiftId: string;
  shifts: Shift[];
  assignments: NursingAssignment[];
  onChanged: () => void;
}) {
  const { t } = useI18n();
  const shiftLabels = getShiftLabels(t);
  const [nurses, setNurses] = useState<{ id: string; fullName: string; username: string }[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [formShiftId, setFormShiftId] = useState(shiftId);
  const [nurseId, setNurseId] = useState("");
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/nursing-assignments/nurses").then(setNurses).catch(() => setNurses([]));
    // GET /patients now returns { data, total } (V1.1 paged registry) - the
    // assignment picker only needs the rows, capped at 100 like before.
    apiFetch("/patients?limit=100").then((data: { data: Patient[] }) => setPatients(data.data)).catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    setFormShiftId(shiftId);
  }, [shiftId]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!nurseId || !formShiftId) {
      setError(t("اختر الممرض والوجبة", "Select a nurse and shift"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/nursing-assignments", {
        method: "POST",
        body: JSON.stringify({ wardId, shiftId: formShiftId, date, nurseId, patientIds: selectedPatientIds }),
      });
      setSelectedPatientIds([]);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر حفظ التوزيع", "Unable to save assignment"));
    } finally {
      setBusy(false);
    }
  }

  function togglePatient(id: string) {
    setSelectedPatientIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("توزيع الممرضين (HEAD_NURSE)", "Nurse assignments (head nurse)")}</h2>
      <ErrorNote message={error} className="mb-2" />
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <select value={formShiftId} onChange={(e) => setFormShiftId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">{t("اختر الوجبة...", "Select a shift...")}</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{shiftLabels[s.name] ?? s.name}</option>
            ))}
          </select>
          <select value={nurseId} onChange={(e) => setNurseId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">{t("اختر الممرض...", "Select a nurse...")}</option>
            {nurses.map((n) => (
              <option key={n.id} value={n.id}>{n.fullName}</option>
            ))}
          </select>
        </div>
        <div className="max-h-40 overflow-y-auto rounded-md border border-slate-100 p-2">
          {patients.map((p) => (
            <label key={p.id} className="flex items-center gap-2 py-0.5 text-xs">
              <input type="checkbox" checked={selectedPatientIds.includes(p.id)} onChange={() => togglePatient(p.id)} />
              {p.fullName} ({p.patientCode})
            </label>
          ))}
        </div>
        <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          {t("حفظ التوزيع", "Save assignment")}
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {assignments.map((a) => (
          <div key={a.id} className="rounded-md border border-slate-100 p-2 text-sm">
            <span className="font-medium text-slate-700">{a.nurse.fullName}</span>{" "}
            <span className="text-slate-500">({shiftLabels[a.shift.name] ?? a.shift.name}): {a.patients.map((p) => p.patient.fullName).join(t("، ", ", ")) || t("بدون مرضى", "No patients")}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
