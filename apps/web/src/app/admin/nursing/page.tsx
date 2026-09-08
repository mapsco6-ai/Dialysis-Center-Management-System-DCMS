"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { NursingAssignment, Patient, Shift, Ward, WardDashboard } from "@/lib/types";

function toLocalDateInputValue(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const statusLabel: Record<string, string> = {
  AVAILABLE: "متاح",
  IN_USE: "قيد الاستخدام",
  RESERVED: "محجوز",
  EMERGENCY_RESERVED: "محجوز للطوارئ",
  APPROVAL_REQUIRED: "بانتظار الموافقة",
  WAITING_CLEANING: "بانتظار التعقيم",
  CLEANING: "قيد التعقيم",
  MAINTENANCE: "صيانة",
  OUT_OF_SERVICE: "خارج الخدمة",
};

const sessionStatusLabel: Record<string, string> = {
  ASSIGNED: "تم تعيين الجهاز",
  IN_DIALYSIS: "الديلزة جارية",
  POST_DIALYSIS: "ما بعد الديلزة",
  INTERRUPTED: "متوقفة",
};

const POLL_MS = 15000;

export default function NursingPage() {
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
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل لوحة الردهة"));
  }

  function refreshMyAssignments() {
    apiFetch(`/nursing/my-assignments?date=${date}`)
      .then(setMyAssignments)
      .catch(() => setMyAssignments([]));
  }

  function refreshWardAssignments() {
    if (!wardId || !user?.permissions.includes("nursing.assign")) return;
    const params = new URLSearchParams({ wardId, date });
    if (shiftId) params.set("shiftId", shiftId);
    apiFetch(`/nursing/assignments?${params.toString()}`)
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
      await apiFetch("/nursing/my-pin", { method: "PATCH", body: JSON.stringify({ pin: pinValue }) });
      setPinMessage("تم حفظ الرمز");
      setPinValue("");
    } catch (err) {
      setPinMessage(err instanceof Error ? err.message : "تعذر حفظ الرمز");
    } finally {
      setPinBusy(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  const canViewAll = user.permissions.includes("nursing.ward.view.all");
  const canAssign = user.permissions.includes("nursing.assign");

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">التمريض - لوحة الردهة</h1>
        <div className="flex flex-wrap items-center gap-2">
          <select value={wardId} onChange={(e) => setWardId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            {wards.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value="">كل الوجبات</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button onClick={() => setDate(toLocalDateInputValue(new Date()))} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
            اليوم
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!canViewAll && (
        <p className="mt-3 text-xs text-amber-600">
          تعرض هذه الشاشة فقط المرضى المخصصين لك اليوم لهذه الردهة/الوجبة.
        </p>
      )}

      {dashboard && (
        <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-slate-50 text-slate-400">
              <tr>
                <th className="px-4 py-2 font-medium">الجهاز</th>
                <th className="px-4 py-2 font-medium">حالة الجهاز</th>
                <th className="px-4 py-2 font-medium">المريض</th>
                <th className="px-4 py-2 font-medium">حالة الجلسة</th>
                <th className="px-4 py-2 font-medium">الممرض</th>
                <th className="px-4 py-2 font-medium">آخر قراءة</th>
                <th className="px-4 py-2 font-medium">تنبيهات</th>
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
                        <Link href={`/admin/patients/${m.session.patientId}`} className="text-slate-800 hover:underline">
                          {m.session.patient.fullName}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{sessionStatusLabel[m.session.status] ?? m.session.status}</td>
                      <td className="px-4 py-2 text-slate-500">{m.session.nurse?.fullName ?? "-"}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {m.session.minutesSinceLastReading != null ? `منذ ${m.session.minutesSinceLastReading} د` : "لا توجد"}
                      </td>
                      <td className="px-4 py-2">
                        {m.session.openAlertsCount > 0 ? (
                          <span className="rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                            {m.session.openAlertsCount}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/admin/sessions/${m.session.id}`} className="text-xs font-medium text-slate-600 hover:underline">
                          فتح الجلسة
                        </Link>
                      </td>
                    </>
                  ) : (
                    <td className="px-4 py-2 text-slate-300" colSpan={5}>
                      لا يوجد مريض ظاهر
                    </td>
                  )}
                </tr>
              ))}
              {dashboard.machines.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-slate-400">لا توجد أجهزة في هذه الردهة</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">توزيعي اليوم (مرضاي)</h2>
          {myAssignments.length === 0 ? (
            <p className="text-sm text-slate-400">لا يوجد توزيع مسجل لك في هذا التاريخ</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {myAssignments.map((a) => (
                <li key={a.id} className="rounded-md border border-slate-100 p-2">
                  <div className="font-medium text-slate-700">{a.ward.name} — {a.shift.name}</div>
                  <div className="text-slate-500">{a.patients.map((p) => p.patient.fullName).join("، ") || "لا يوجد مرضى"}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-500">رمز PIN السريع الخاص بي</h2>
          <p className="mb-2 text-xs text-slate-400">
            يُستخدم لتحديد هويتك بدقة عند تنفيذ إجراء من جهاز مشترك يسجّل دخوله بحساب آخر.
          </p>
          <form onSubmit={handleSetPin} className="flex items-center gap-2">
            <input
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value)}
              placeholder="4-6 أرقام"
              inputMode="numeric"
              className="w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            />
            <button type="submit" disabled={pinBusy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">
              حفظ
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
  const [nurses, setNurses] = useState<{ id: string; fullName: string; username: string }[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [formShiftId, setFormShiftId] = useState(shiftId);
  const [nurseId, setNurseId] = useState("");
  const [selectedPatientIds, setSelectedPatientIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch("/nursing/nurses").then(setNurses).catch(() => setNurses([]));
    apiFetch("/patients").then(setPatients).catch(() => setPatients([]));
  }, []);

  useEffect(() => {
    setFormShiftId(shiftId);
  }, [shiftId]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!nurseId || !formShiftId) {
      setError("اختر الممرض والوجبة");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/nursing/assignments", {
        method: "POST",
        body: JSON.stringify({ wardId, shiftId: formShiftId, date, nurseId, patientIds: selectedPatientIds }),
      });
      setSelectedPatientIds([]);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ التوزيع");
    } finally {
      setBusy(false);
    }
  }

  function togglePatient(id: string) {
    setSelectedPatientIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-500">توزيع الممرضين (HEAD_NURSE)</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <select value={formShiftId} onChange={(e) => setFormShiftId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">اختر الوجبة...</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select value={nurseId} onChange={(e) => setNurseId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
            <option value="">اختر الممرض...</option>
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
          حفظ التوزيع
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {assignments.map((a) => (
          <div key={a.id} className="rounded-md border border-slate-100 p-2 text-sm">
            <span className="font-medium text-slate-700">{a.nurse.fullName}</span>{" "}
            <span className="text-slate-500">({a.shift.name}): {a.patients.map((p) => p.patient.fullName).join("، ") || "بدون مرضى"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
