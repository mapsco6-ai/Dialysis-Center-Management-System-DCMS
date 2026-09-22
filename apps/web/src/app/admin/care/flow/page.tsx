"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNote } from "@/components/ErrorNote";
import { SkeletonTable } from "@/components/Skeleton";

const STEPS = ["arrival", "pre", "supplies", "machine", "dialysis", "discharge"] as const;
type Step = (typeof STEPS)[number];

interface FlowItem {
  appointmentId: string;
  patient: { id: string; patientCode: string; fullName: string };
  shift: { id: string; name: string };
  type: "REGULAR" | "EXTRA" | "EMERGENCY";
  scheduleStatus: string;
  lateMinutes: number | null;
  sessionStatus: string | null;
  machineCode: string | null;
  steps: { key: Step; state: "done" | "current" | "todo" }[];
  current: Step | null;
  attention: "INTERRUPTED" | "WAITING_MACHINE" | "ABSENT" | "LATE" | null;
  nextAction: { key: string; permission: string; allowed: boolean } | null;
  minutesInStep: number | null;
}
interface Board { total: number; needsAttention: number; byStep: Record<string, number>; items: FlowItem[] }

// Where each next action is carried out (the screens that already own the forms).
const ACTION_HREF: Record<string, (id: string) => string> = {
  "check-in": () => "/admin/care/reception",
  "record-pre-dialysis": (id) => `/admin/care/sessions/${id}`,
  "confirm-supplies": (id) => `/admin/care/sessions/${id}/supplies`,
  "assign-machine": (id) => `/admin/care/sessions/${id}`,
  "start-dialysis": (id) => `/admin/care/sessions/${id}`,
  "resume-dialysis": (id) => `/admin/care/sessions/${id}`,
  "record-readings": (id) => `/admin/care/sessions/${id}`,
  "end-dialysis": (id) => `/admin/care/sessions/${id}`,
  discharge: (id) => `/admin/care/sessions/${id}`,
};

export default function FlowPage() {
  const { t, formatNumber } = useI18n();
  const user = useCurrentUser();
  const stepLabel: Record<Step | "closed", string> = {
    arrival: t("الوصول", "Arrival"), pre: t("الفحص الأولي", "Pre-dialysis"), supplies: t("المستلزمات", "Supplies"),
    machine: t("الجهاز", "Machine"), dialysis: t("الديلزة", "Dialysis"), discharge: t("الخروج", "Discharge"), closed: t("مغلق", "Closed"),
  };
  const actionLabel: Record<string, string> = {
    "check-in": t("تسجيل الحضور", "Check in"), "record-pre-dialysis": t("إدخال الفحص الأولي", "Record pre-dialysis"),
    "confirm-supplies": t("تأكيد المستلزمات", "Confirm supplies"), "assign-machine": t("تعيين جهاز", "Assign machine"),
    "start-dialysis": t("بدء الجلسة", "Start session"), "resume-dialysis": t("استئناف الجلسة", "Resume session"),
    "record-readings": t("القراءات / إنهاء", "Readings / finish"), "end-dialysis": t("إنهاء الجلسة", "End session"), discharge: t("إخراج المريض", "Discharge"),
  };
  const attentionLabel: Record<string, string> = {
    INTERRUPTED: t("جلسة مقاطَعة", "Interrupted"), WAITING_MACHINE: t("بانتظار جهاز", "Waiting for a machine"),
    ABSENT: t("غائب", "Absent"), LATE: t("متأخر", "Late"),
  };

  const [shiftId, setShiftId] = useState("");
  const [step, setStep] = useState<Step | "closed" | "">("");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const shifts = useApi<{ id: string; name: string }[]>(user && (user.permissions.includes("scheduling.manage") || user.permissions.includes("nursing.ward.view")) ? "/shifts" : null);
  const board = useApi<Board>(user ? `/flow/today${shiftId ? `?shiftId=${shiftId}` : ""}` : null);

  // Live tag from the API socket + a slow poll as fallback.
  useLiveEvents(() => board.refresh());
  useEffect(() => {
    const timer = setInterval(board.refresh, 20_000);
    return () => clearInterval(timer);
  }, [board.refresh]);

  if (!user) return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;

  const data = board.data;
  const rows = (data?.items ?? []).filter((i) => (!step || (i.current ?? "closed") === step) && (!onlyAttention || i.attention));
  const shiftName = (name: string) => t(`الوردية ${name.replace("SHIFT_", "")}`, `Shift ${name.replace("SHIFT_", "")}`);

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">{t("رحلة المرضى اليوم", "Today’s patient flow")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(shifts.data?.length ?? 0) > 0 && (
            <select className="rounded-md border border-slate-300 px-2 py-1 text-sm" value={shiftId} onChange={(e) => setShiftId(e.target.value)} aria-label={t("الوردية", "Shift")}>
              <option value="">{t("كل الورديات", "All shifts")}</option>
              {shifts.data!.map((s) => <option key={s.id} value={s.id}>{shiftName(s.name)}</option>)}
            </select>
          )}
          <button type="button" aria-pressed={onlyAttention} onClick={() => setOnlyAttention(!onlyAttention)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${onlyAttention ? "border-red-700 bg-red-700 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            {t("تحتاج تدخلاً", "Needs attention")} ({formatNumber(data?.needsAttention ?? 0)})
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">{t("كل مريض في خطوة واحدة واضحة: من الوصول حتى الخروج، والإجراء التالي بزر واحد.", "Every patient at one clear step, from arrival to discharge, with the next action one click away.")}</p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("تصفية حسب الخطوة", "Filter by step")}>
        {[["", t("الكل", "All"), data?.total ?? 0] as const, ...(["arrival", "pre", "supplies", "machine", "dialysis", "discharge", "closed"] as const).map((k) => [k, stepLabel[k], data?.byStep[k] ?? 0] as const)].map(([k, label, count]) => (
          <button key={k || "all"} type="button" aria-pressed={step === k} onClick={() => setStep(k as Step | "closed" | "")}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${step === k ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            {label} ({formatNumber(count)})
          </button>
        ))}
      </div>

      <ErrorNote message={board.error} className="mt-4" />
      <div className="mt-4 space-y-2">
        {board.loading && !data && <SkeletonTable rows={5} columns={4} />}
        {data && rows.length === 0 && <EmptyState title={t("لا يوجد مرضى في هذا العرض", "No patients in this view")} description={t("غيّر الوردية أو الخطوة، أو ألغِ تصفية \"تحتاج تدخلاً\".", "Change the shift or step, or clear the “needs attention” filter.")} />}
        {rows.map((item) => (
          <article key={item.appointmentId} className={`rounded-lg border bg-white p-3 ${item.attention === "INTERRUPTED" || item.attention === "WAITING_MACHINE" ? "border-red-300" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/admin/care/patients/${item.patient.id}`} className="font-medium text-slate-800 hover:underline">{item.patient.fullName}</Link>
                <span className="ms-2 text-xs text-slate-500"><bdi>{item.patient.patientCode}</bdi> · {shiftName(item.shift.name)}
                  {item.type !== "REGULAR" ? ` · ${item.type === "EMERGENCY" ? t("طارئة", "Emergency") : t("إضافية", "Extra")}` : ""}
                  {item.machineCode ? ` · ${item.machineCode}` : ""}</span>
              </div>
              <div className="flex items-center gap-2">
                {item.attention && <span role="status" className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">⚠ {attentionLabel[item.attention]}{item.attention === "LATE" && item.lateMinutes ? ` (${formatNumber(item.lateMinutes)} ${t("د", "min")})` : ""}</span>}
                {item.minutesInStep !== null && item.current && <span className="text-xs text-slate-500">{formatNumber(item.minutesInStep)} {t("د في هذه الخطوة", "min at this step")}</span>}
                {item.nextAction && (item.nextAction.allowed ? (
                  <Link href={ACTION_HREF[item.nextAction.key](item.appointmentId)} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">{actionLabel[item.nextAction.key]}</Link>
                ) : (
                  <span className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-400" title={item.nextAction.permission}>{t("التالي: ", "Next: ")}{actionLabel[item.nextAction.key]}</span>
                ))}
              </div>
            </div>
            <ol className="mt-3 grid grid-cols-6 gap-1" aria-label={t("مراحل الرحلة", "Journey steps")}>
              {item.steps.map((s) => (
                <li key={s.key} aria-current={s.state === "current" ? "step" : undefined} className="text-center">
                  <div className={`h-1.5 rounded-full ${s.state === "done" ? "bg-emerald-500" : s.state === "current" ? (item.attention ? "bg-red-500" : "bg-blue-600") : "bg-slate-200"}`} />
                  <span className={`mt-1 block truncate text-[10px] ${s.state === "current" ? "font-semibold text-slate-800" : "text-slate-500"}`}>{s.state === "done" ? "✓ " : ""}{stepLabel[s.key]}</span>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
