"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import Link from "next/link";
import { Button, Card } from "@heroui/react";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonTable } from "@/components/Skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { LabTrendView } from "@/components/LabTrendView";
import { toast } from "@/components/Toaster";
import { LabQueueItem, LabTrend } from "@/lib/types";
import { WorkspaceIcon } from "@/components/WorkspaceIcon";

gsap.registerPlugin(useGSAP);

const NEXT_STATUS: Record<string, string | undefined> = {
  ORDERED: "SAMPLE_COLLECTED",
  SAMPLE_COLLECTED: "PROCESSING",
};

function groupQueueByPatient(items: LabQueueItem[]) {
  const groups: { patientId: string; patient: { id: string; fullName: string; patientCode: string }; items: LabQueueItem[] }[] = [];
  const indexByPatient = new Map<string, number>();
  for (const item of items) {
    const patient = item.labOrder.patient;
    if (!patient) continue;
    const patientId = item.labOrder.patientId;
    let idx = indexByPatient.get(patientId);
    if (idx === undefined) {
      idx = groups.length;
      indexByPatient.set(patientId, idx);
      groups.push({ patientId, patient, items: [] });
    }
    groups[idx].items.push(item);
  }
  return groups;
}

export default function LabPage() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const [queue, setQueue] = useState<LabQueueItem[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultFormId, setResultFormId] = useState<string | null>(null);
  const [trends, setTrends] = useState<Record<string, LabTrend>>({});
  const [expandedPatients, setExpandedPatients] = useState<Set<string>>(() => new Set());

  const patientGroups = useMemo(() => groupQueueByPatient(queue), [queue]);

  function togglePatientExpanded(patientId: string) {
    setExpandedPatients((prev) => {
      const next = new Set(prev);
      if (next.has(patientId)) next.delete(patientId);
      else next.add(patientId);
      return next;
    });
  }

  function toggleResultForm(item: LabQueueItem) {
    const opening = resultFormId !== item.id;
    setResultFormId(opening ? item.id : null);
    if (opening && !trends[item.id]) {
      apiFetch(`/lab/tests/${item.labTestId}/trend?patientId=${item.labOrder.patientId}&limit=5`)
        .then((data) => setTrends((prev) => ({ ...prev, [item.id]: data })))
        .catch(() => undefined);
    }
  }

  function refreshQueue() {
    apiFetch("/lab/queue")
      .then(setQueue)
      .catch(() => setQueue([]))
      .finally(() => setQueueLoaded(true));
  }

  useEffect(() => {
    if (!user) return;
    refreshQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function advance(itemId: string, status: string) {
    setBusy(true);
    try {
      await apiFetch(`/lab/order-items/${itemId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      refreshQueue();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("تعذر تحديث الحالة", "Unable to update status"));
    } finally {
      setBusy(false);
    }
  }

  async function submitResult(e: FormEvent<HTMLFormElement>, itemId: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await apiFetch(`/lab/order-items/${itemId}/results`, {
        method: "POST",
        body: JSON.stringify({
          value: form.get("value"),
          flagCritical: form.get("flagCritical") === "on",
        }),
      });
      setResultFormId(null);
      refreshQueue();
      toast.success(t("تم حفظ النتيجة", "Result saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("تعذر حفظ النتيجة", "Unable to save result"));
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const canProcess = user.permissions.includes("lab.result.create");

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-foreground">{t("طلب التحاليل", "Request investigation")}</h1>

      <Card className="mt-4 overflow-hidden border border-border bg-surface shadow-none">
        <Card.Content className="p-0">
          {!queueLoaded && queue.length === 0 && <SkeletonTable rows={4} columns={5} />}
          {patientGroups.map((group) => (
            <PatientQueueGroup
              key={group.patientId}
              group={group}
              open={expandedPatients.has(group.patientId)}
              onToggle={() => togglePatientExpanded(group.patientId)}
              canProcess={canProcess}
              busy={busy}
              resultFormId={resultFormId}
              trends={trends}
              onAdvance={advance}
              onToggleResult={toggleResultForm}
              onSubmitResult={submitResult}
            />
          ))}
          {queueLoaded && queue.length === 0 && (
            <EmptyState title={t("لا توجد طلبات معلّقة", "No pending requests")}
              description={t("الطابور فارغ — ستظهر الطلبات الجديدة هنا لحظة وصولها.", "The queue is clear - new orders will appear here as they arrive.")} />
          )}
        </Card.Content>
      </Card>

    </AdminShell>
  );
}

function PatientQueueGroup({
  group, open, onToggle, canProcess, busy, resultFormId, trends, onAdvance, onToggleResult, onSubmitResult,
}: {
  group: { patientId: string; patient: { id: string; fullName: string; patientCode: string }; items: LabQueueItem[] };
  open: boolean;
  onToggle: () => void;
  canProcess: boolean;
  busy: boolean;
  resultFormId: string | null;
  trends: Record<string, LabTrend>;
  onAdvance: (itemId: string, status: string) => void;
  onToggleResult: (item: LabQueueItem) => void;
  onSubmitResult: (e: FormEvent<HTMLFormElement>, itemId: string) => void;
}) {
  const { t, formatDate, formatNumber } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const chevron = useRef<HTMLSpanElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const { contextSafe } = useGSAP(() => {
    gsap.set(panel.current, { height: 0, autoAlpha: 0, overflow: "hidden" });
    gsap.set(chevron.current, { rotation: 0 });
  }, { scope: root });

  const animate = contextSafe(() => {
    const next = !openRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const d = reduce ? 0 : 0.32;
    if (next) {
      gsap.to(panel.current, { height: "auto", autoAlpha: 1, duration: d, ease: "power2.out", overwrite: true });
      gsap.to(chevron.current, { rotation: 180, duration: d, ease: "power2.out", overwrite: true });
      if (!reduce) {
        gsap.fromTo(".lab-item", { y: 8, autoAlpha: 0 }, { y: 0, autoAlpha: 1, stagger: 0.04, duration: 0.24, ease: "power2.out", overwrite: true });
      }
    } else {
      gsap.to(panel.current, { height: 0, autoAlpha: 0, duration: reduce ? 0 : 0.22, ease: "power2.in", overwrite: true });
      gsap.to(chevron.current, { rotation: 0, duration: reduce ? 0 : 0.22, ease: "power2.in", overwrite: true });
    }
  });

  const count = group.items.length;
  return (
    <div ref={root} className="border-t border-border">
      <div className="flex items-center gap-2 px-3 py-2">
        <Button size="sm" variant="ghost" isIconOnly aria-expanded={open}
          aria-label={open ? t("طي التحاليل", "Collapse investigations") : t("عرض التحاليل", "Show investigations")}
          className="min-w-0 shrink-0" onPress={() => { animate(); onToggle(); }}>
          <span ref={chevron} className="inline-flex">
            <WorkspaceIcon name="chevron" width={16} height={16} />
          </span>
        </Button>
        <Link href={`/admin/care/patients/${group.patientId}`} className="font-medium text-foreground hover:underline">
          {group.patient.fullName}
        </Link>
        <span className="text-xs text-muted">{group.patient.patientCode}</span>
        <span className="ms-auto text-xs text-muted">
          {t(`${formatNumber(count)} تحليل معلّق`, `${formatNumber(count)} pending`)}
        </span>
      </div>
      <div ref={panel}>
        <table className="w-full text-start text-sm">
          <thead className="text-muted">
            <tr>
              <th className="px-4 py-1 font-medium">{t("الطلب", "Order")}</th>
              <th className="px-4 py-1 font-medium">{t("التحليل", "Test")}</th>
              <th className="px-4 py-1 font-medium">{t("الحالة", "Status")}</th>
              <th className="px-4 py-1 font-medium">{t("الطبيب الطالب", "Requesting doctor")}</th>
              <th className="px-4 py-1 font-medium">{t("وقت الطلب", "Requested at")}</th>
              <th className="px-4 py-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {group.items.map((item) => (
              <tr key={item.id} className="lab-item border-t border-border">
                <td className="px-4 py-2 text-xs text-muted">{item.labOrder.episodeCode}</td>
                <td className="px-4 py-2 text-foreground">{item.labTest.name}</td>
                <td className="px-4 py-2"><StatusBadge group="labOrderItem" value={item.status} /></td>
                <td className="px-4 py-2 text-muted">{item.labOrder.orderedByDoctor?.fullName ?? "-"}</td>
                <td className="px-4 py-2 text-muted">{formatDate(item.labOrder.orderedAt, { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {canProcess && NEXT_STATUS[item.status] && (
                      <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => onAdvance(item.id, NEXT_STATUS[item.status]!)}>
                        {t("نقل إلى", "Move to")} <StatusBadge group="labOrderItem" value={NEXT_STATUS[item.status]!} />
                      </Button>
                    )}
                    {canProcess && item.status === "PROCESSING" && (
                      <Button size="sm" variant="primary" onPress={() => onToggleResult(item)}>
                        {t("إدخال النتيجة", "Enter result")}
                      </Button>
                    )}
                  </div>
                  {resultFormId === item.id && (
                    <div className="mt-2 rounded-md bg-surface-secondary p-2">
                      <form onSubmit={(e) => onSubmitResult(e, item.id)} className="flex flex-wrap items-center gap-2">
                        <input name="value" required placeholder={`${t("القيمة", "Value")}${item.labTest.unit ? ` (${item.labTest.unit})` : ""}`} className="w-28 rounded-md border border-border px-2 py-1 text-xs" />
                        <label className="flex items-center gap-1 text-xs text-danger">
                          <input type="checkbox" name="flagCritical" /> {t("نتيجة حرجة (تنبيه فوري)", "Critical result (immediate alert)")}
                        </label>
                        <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground disabled:opacity-50">{t("حفظ (نهائي)", "Save final result")}</button>
                      </form>
                      {trends[item.id] && (
                        <div className="mt-2 border-t border-border pt-2">
                          <p className="mb-1 text-xs font-semibold text-muted">{t("اتجاه القيمة عبر الزمن", "Result trend over time")}</p>
                          <LabTrendView trend={trends[item.id]} testName={item.labTest.name} />
                        </div>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

