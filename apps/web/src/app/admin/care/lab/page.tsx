"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@heroui/react";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonTable } from "@/components/Skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { LabTrendView } from "@/components/LabTrendView";
import { toast } from "@/components/Toaster";
import { LabPanel, LabQueueItem, LabTest, LabTrend } from "@/lib/types";

const NEXT_STATUS: Record<string, string | undefined> = {
  ORDERED: "SAMPLE_COLLECTED",
  SAMPLE_COLLECTED: "PROCESSING",
};

export default function LabPage() {
  const { t, formatDate } = useI18n();
  const user = useCurrentUser();
  const [queue, setQueue] = useState<LabQueueItem[]>([]);
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [panels, setPanels] = useState<LabPanel[]>([]);
  const [busy, setBusy] = useState(false);
  const [resultFormId, setResultFormId] = useState<string | null>(null);
  const [trends, setTrends] = useState<Record<string, LabTrend>>({});

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
    apiFetch("/lab/tests").then(setTests).catch(() => setTests([]));
    apiFetch("/lab/panels").then(setPanels).catch(() => setPanels([]));
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
  const canManageCatalog = user.permissions.includes("lab.catalog.manage");

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-foreground">{t("المختبر — طابور الانتظار", "Laboratory — Work queue")}</h1>

      <Card className="mt-4 overflow-hidden border border-border bg-surface shadow-none">
        <Card.Content className="p-0">
        <table className="w-full text-start text-sm">
          <thead className="bg-surface-secondary text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("المريض", "Patient")}</th>
              <th className="px-4 py-2 font-medium">{t("التحليل", "Test")}</th>
              <th className="px-4 py-2 font-medium">{t("الحالة", "Status")}</th>
              <th className="px-4 py-2 font-medium">{t("الطبيب الطالب", "Requesting doctor")}</th>
              <th className="px-4 py-2 font-medium">{t("وقت الطلب", "Requested at")}</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {!queueLoaded && queue.length === 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  <SkeletonTable rows={4} columns={6} />
                </td>
              </tr>
            )}
            {queue.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <Link href={`/admin/care/patients/${item.labOrder.patientId}`} className="text-foreground hover:underline">
                    {item.labOrder.patient?.fullName}
                  </Link>
                </td>
                <td className="px-4 py-2 text-foreground">{item.labTest.name}</td>
                <td className="px-4 py-2"><StatusBadge group="labOrderItem" value={item.status} /></td>
                <td className="px-4 py-2 text-muted">{item.labOrder.orderedByDoctor?.fullName ?? "-"}</td>
                <td className="px-4 py-2 text-muted">{formatDate(item.labOrder.orderedAt, { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                  {canProcess && NEXT_STATUS[item.status] && (
                    <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => advance(item.id, NEXT_STATUS[item.status]!)}>
                      {t("نقل إلى", "Move to")} <StatusBadge group="labOrderItem" value={NEXT_STATUS[item.status]!} />
                    </Button>
                  )}
                  {canProcess && item.status === "PROCESSING" && (
                    <Button size="sm" variant="primary" onPress={() => toggleResultForm(item)}>
                      {t("إدخال النتيجة", "Enter result")}
                    </Button>
                  )}
                  </div>
                  {resultFormId === item.id && (
                    <div className="mt-2 rounded-md bg-surface-secondary p-2">
                      <form onSubmit={(e) => submitResult(e, item.id)} className="flex flex-wrap items-center gap-2">
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
            {queueLoaded && queue.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState title={t("لا توجد طلبات معلّقة", "No pending requests")}
                    description={t("الطابور فارغ — ستظهر الطلبات الجديدة هنا لحظة وصولها.", "The queue is clear - new orders will appear here as they arrive.")} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </Card.Content>
      </Card>

      {canManageCatalog && <CatalogManager tests={tests} panels={panels} onChanged={() => {
        apiFetch("/lab/tests").then(setTests).catch(() => undefined);
        apiFetch("/lab/panels").then(setPanels).catch(() => undefined);
      }} />}
    </AdminShell>
  );
}

function CatalogManager({
  tests,
  panels,
  onChanged,
}: {
  tests: LabTest[];
  panels: LabPanel[];
  onChanged: () => void;
}) {
  const { t, formatNumber } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);

  async function handleCreateTest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/lab/tests", {
        method: "POST",
        body: JSON.stringify({
          code: form.get("code"),
          name: form.get("name"),
          unit: form.get("unit") || undefined,
          referenceRangeLow: form.get("referenceRangeLow") ? Number(form.get("referenceRangeLow")) : undefined,
          referenceRangeHigh: form.get("referenceRangeHigh") ? Number(form.get("referenceRangeHigh")) : undefined,
        }),
      });
      (e.target as HTMLFormElement).reset();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إضافة التحليل", "Unable to add test"));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePanel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (selectedTestIds.length === 0) {
      setError(t("اختر تحليلاً واحداً على الأقل للمجموعة", "Select at least one test for the panel"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/lab/panels", {
        method: "POST",
        body: JSON.stringify({ name: form.get("name"), labTestIds: selectedTestIds }),
      });
      (e.target as HTMLFormElement).reset();
      setSelectedTestIds([]);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إضافة المجموعة", "Unable to add panel"));
    } finally {
      setBusy(false);
    }
  }

  function toggleTest(id: string) {
    setSelectedTestIds((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));
  }

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <ErrorNote message={error} />
      <Card className="border border-border bg-surface shadow-none">
        <Card.Header><Card.Title className="text-sm font-semibold text-muted">{t("إضافة تحليل", "Add test")}</Card.Title></Card.Header>
        <Card.Content>
        <form onSubmit={handleCreateTest} className="space-y-2">
          <input name="code" required placeholder={t("الرمز (مثال: HGB)", "Code (e.g. HGB)")} className="w-full rounded-md border border-border px-2 py-1 text-xs" />
          <input name="name" required placeholder={t("الاسم", "Name")} className="w-full rounded-md border border-border px-2 py-1 text-xs" />
          <input name="unit" placeholder={t("الوحدة (اختياري)", "Unit (optional)")} className="w-full rounded-md border border-border px-2 py-1 text-xs" />
          <div className="flex gap-2">
            <input name="referenceRangeLow" type="number" step="0.01" placeholder={t("الحد الأدنى الطبيعي", "Reference range minimum")} className="w-full rounded-md border border-border px-2 py-1 text-xs" />
            <input name="referenceRangeHigh" type="number" step="0.01" placeholder={t("الحد الأعلى الطبيعي", "Reference range maximum")} className="w-full rounded-md border border-border px-2 py-1 text-xs" />
          </div>
          <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground disabled:opacity-50">{t("حفظ", "Save")}</button>
        </form>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {tests.map((entry) => (
            <li key={entry.id}>{entry.code} — {entry.name} {entry.unit ? `(${entry.unit})` : ""}</li>
          ))}
        </ul>
        </Card.Content>
      </Card>

      <Card className="border border-border bg-surface shadow-none">
        <Card.Header><Card.Title className="text-sm font-semibold text-muted">{t("إضافة مجموعة تحاليل", "Add test panel")}</Card.Title></Card.Header>
        <Card.Content>
        <form onSubmit={handleCreatePanel} className="space-y-2">
          <input name="name" required placeholder={t("اسم المجموعة", "Panel name")} className="w-full rounded-md border border-border px-2 py-1 text-xs" />
          <div className="max-h-32 overflow-y-auto rounded-md border border-border p-2">
            {tests.map((entry) => (
              <label key={entry.id} className="flex items-center gap-2 py-0.5 text-xs">
                <input type="checkbox" checked={selectedTestIds.includes(entry.id)} onChange={() => toggleTest(entry.id)} />
                {entry.code} — {entry.name}
              </label>
            ))}
          </div>
          <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground disabled:opacity-50">{t("حفظ", "Save")}</button>
        </form>
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {panels.map((p) => (
            <li key={p.id}>{p.name} ({formatNumber(p.tests.length)} {t("تحليل)", "tests)")}</li>
          ))}
        </ul>
        </Card.Content>
      </Card>
    </div>
  );
}
