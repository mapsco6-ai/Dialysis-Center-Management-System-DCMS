"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card } from "@heroui/react";
import { useI18n } from "@/lib/i18n";
import { useApi } from "@/lib/useApi";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNote } from "@/components/ErrorNote";
import { SkeletonTable } from "@/components/Skeleton";
import { FilterSelect } from "@/components/FilterSelect";
import { StatusBadge } from "@/components/StatusBadge";

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
  const router = useRouter();
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

  const [shiftId, setShiftId] = useState("");
  const [step, setStep] = useState<Step | "closed" | "">("");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const shifts = useApi<{ id: string; name: string }[]>(user && (user.permissions.includes("scheduling.manage") || user.permissions.includes("nursing.ward.view")) ? "/shifts" : null);
  const board = useApi<Board>(user ? `/flow/today${shiftId ? `?shiftId=${shiftId}` : ""}` : null);

  useLiveEvents(() => board.refresh());

  if (!user) return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;

  const data = board.data;
  const rows = (data?.items ?? []).filter((i) => (!step || (i.current ?? "closed") === step) && (!onlyAttention || i.attention));
  const shiftName = (name: string) => t(`الوردية ${name.replace("SHIFT_", "")}`, `Shift ${name.replace("SHIFT_", "")}`);

  return (
    <AdminShell user={user}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">{t("رحلة المرضى اليوم", "Today’s patient flow")}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {(shifts.data?.length ?? 0) > 0 && (
            <FilterSelect
              className="min-w-[10rem]"
              aria-label={t("الوردية", "Shift")}
              value={shiftId}
              onChange={setShiftId}
              options={[
                { id: "", label: t("كل الورديات", "All shifts") },
                ...shifts.data!.map((s) => ({ id: s.id, label: shiftName(s.name) })),
              ]}
            />
          )}
          <Button size="sm" variant={onlyAttention ? "danger" : "secondary"} aria-pressed={onlyAttention} onPress={() => setOnlyAttention(!onlyAttention)}>
            {t("تحتاج تدخلاً", "Needs attention")} ({formatNumber(data?.needsAttention ?? 0)})
          </Button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted">{t("كل مريض في خطوة واحدة واضحة: من الوصول حتى الخروج، والإجراء التالي بزر واحد.", "Every patient at one clear step, from arrival to discharge, with the next action one click away.")}</p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t("تصفية حسب الخطوة", "Filter by step")}>
        {[["", t("الكل", "All"), data?.total ?? 0] as const, ...(["arrival", "pre", "supplies", "machine", "dialysis", "discharge", "closed"] as const).map((k) => [k, stepLabel[k], data?.byStep[k] ?? 0] as const)].map(([k, label, count]) => (
          <Button key={k || "all"} size="sm" variant={step === k ? "primary" : "secondary"} aria-pressed={step === k} onPress={() => setStep(k as Step | "closed" | "")}>
            {label} ({formatNumber(count)})
          </Button>
        ))}
      </div>

      <ErrorNote message={board.error} className="mt-4" />
      <div className="mt-4 space-y-2">
        {board.loading && !data && <SkeletonTable rows={5} columns={4} />}
        {data && rows.length === 0 && <EmptyState title={t("لا يوجد مرضى في هذا العرض", "No patients in this view")} description={t("غيّر الوردية أو الخطوة، أو ألغِ تصفية \"تحتاج تدخلاً\".", "Change the shift or step, or clear the “needs attention” filter.")} />}
        {rows.map((item) => {
          const needsAttention = item.attention === "INTERRUPTED" || item.attention === "WAITING_MACHINE";
          return (
            <Card key={item.appointmentId} className={`gap-3 rounded-lg border bg-surface shadow-none ${needsAttention ? "border-danger" : "border-border"}`}>
              <Card.Content className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/admin/care/patients/${item.patient.id}`} className="font-medium text-foreground hover:underline">{item.patient.fullName}</Link>
                  <span className="ms-2 text-xs text-muted"><bdi>{item.patient.patientCode}</bdi> · {shiftName(item.shift.name)}
                    {item.type !== "REGULAR" ? ` · ${item.type === "EMERGENCY" ? t("طارئة", "Emergency") : t("إضافية", "Extra")}` : ""}
                    {item.machineCode ? ` · ${item.machineCode}` : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.attention && (
                    <span className="inline-flex items-center gap-1">
                      <StatusBadge group="flowAttention" value={item.attention} />
                      {item.attention === "LATE" && item.lateMinutes ? (
                        <span className="text-xs text-muted">({formatNumber(item.lateMinutes)} {t("د", "min")})</span>
                      ) : null}
                    </span>
                  )}
                  {item.minutesInStep !== null && item.current && <span className="text-xs text-muted">{formatNumber(item.minutesInStep)} {t("د في هذه الخطوة", "min at this step")}</span>}
                  {item.nextAction && (item.nextAction.allowed ? (
                    <Button size="sm" variant="primary" onPress={() => router.push(ACTION_HREF[item.nextAction!.key](item.appointmentId))}>
                      {actionLabel[item.nextAction.key]}
                    </Button>
                  ) : (
                    <span className="rounded-md border border-dashed border-border px-3 py-1.5 text-xs text-disabled" title={item.nextAction.permission}>{t("التالي: ", "Next: ")}{actionLabel[item.nextAction.key]}</span>
                  ))}
                </div>
              </div>
              <ol className="mt-3 grid grid-cols-6 gap-1" aria-label={t("مراحل الرحلة", "Journey steps")}>
                {item.steps.map((s) => (
                  <li key={s.key} aria-current={s.state === "current" ? "step" : undefined} className="text-center">
                    <div className={`h-1.5 rounded-full ${s.state === "done" ? "bg-success" : s.state === "current" ? (item.attention ? "bg-danger" : "bg-accent") : "bg-default"}`} />
                    <span className={`mt-1 block truncate text-[10px] ${s.state === "current" ? "font-semibold text-foreground" : "text-muted"}`}>{stepLabel[s.key]}</span>
                  </li>
                ))}
              </ol>
              </Card.Content>
            </Card>
          );
        })}
      </div>
    </AdminShell>
  );
}
