"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { LabPanel, LabQueueItem, LabTest } from "@/lib/types";

const statusLabel: Record<string, string> = {
  ORDERED: "بانتظار سحب العينة",
  SAMPLE_COLLECTED: "تم سحب العينة",
  PROCESSING: "قيد المعالجة",
  RESULT_ENTERED: "أُدخلت النتيجة",
  FINAL: "نهائية",
  AMENDED: "مُعدَّلة",
  CANCELLED: "ملغاة",
};

const NEXT_STATUS: Record<string, string | undefined> = {
  ORDERED: "SAMPLE_COLLECTED",
  SAMPLE_COLLECTED: "PROCESSING",
};

const POLL_MS = 15000;

export default function LabPage() {
  const user = useCurrentUser();
  const [queue, setQueue] = useState<LabQueueItem[]>([]);
  const [tests, setTests] = useState<LabTest[]>([]);
  const [panels, setPanels] = useState<LabPanel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultFormId, setResultFormId] = useState<string | null>(null);

  function refreshQueue() {
    apiFetch("/lab/queue").then(setQueue).catch(() => setQueue([]));
  }

  useEffect(() => {
    if (!user) return;
    refreshQueue();
    apiFetch("/lab/tests").then(setTests).catch(() => setTests([]));
    apiFetch("/lab/panels").then(setPanels).catch(() => setPanels([]));
    const interval = setInterval(refreshQueue, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function advance(itemId: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/lab/order-items/${itemId}/status`, { method: "POST", body: JSON.stringify({ status }) });
      refreshQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تحديث الحالة");
    } finally {
      setBusy(false);
    }
  }

  async function submitResult(e: FormEvent<HTMLFormElement>, itemId: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر حفظ النتيجة");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  const canProcess = user.permissions.includes("lab.result.create");
  const canManageCatalog = user.permissions.includes("lab.catalog.manage");

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">المختبر — طابور الانتظار</h1>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">المريض</th>
              <th className="px-4 py-2 font-medium">التحليل</th>
              <th className="px-4 py-2 font-medium">الحالة</th>
              <th className="px-4 py-2 font-medium">الطبيب الطالب</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <Link href={`/admin/patients/${item.labOrder.patientId}`} className="text-slate-800 hover:underline">
                    {item.labOrder.patient?.fullName}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-700">{item.labTest.name}</td>
                <td className="px-4 py-2 text-slate-500">{statusLabel[item.status] ?? item.status}</td>
                <td className="px-4 py-2 text-slate-500">{item.labOrder.orderedByDoctor?.fullName ?? "-"}</td>
                <td className="px-4 py-2">
                  {canProcess && NEXT_STATUS[item.status] && (
                    <button
                      onClick={() => advance(item.id, NEXT_STATUS[item.status]!)}
                      disabled={busy}
                      className="text-xs font-medium text-slate-600 hover:underline disabled:opacity-50"
                    >
                      نقل إلى {statusLabel[NEXT_STATUS[item.status]!]}
                    </button>
                  )}
                  {canProcess && item.status === "PROCESSING" && (
                    <button
                      onClick={() => setResultFormId(resultFormId === item.id ? null : item.id)}
                      className="mr-2 text-xs font-medium text-emerald-600 hover:underline"
                    >
                      إدخال النتيجة
                    </button>
                  )}
                  {resultFormId === item.id && (
                    <form onSubmit={(e) => submitResult(e, item.id)} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                      <input name="value" required placeholder={`القيمة${item.labTest.unit ? ` (${item.labTest.unit})` : ""}`} className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                      <label className="flex items-center gap-1 text-xs text-red-600">
                        <input type="checkbox" name="flagCritical" /> نتيجة حرجة (تنبيه فوري)
                      </label>
                      <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">حفظ (نهائي)</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {queue.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">لا توجد طلبات معلّقة</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

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
      setError(err instanceof Error ? err.message : "تعذر إضافة التحليل");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePanel(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (selectedTestIds.length === 0) {
      setError("اختر تحليلاً واحداً على الأقل للمجموعة");
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
      setError(err instanceof Error ? err.message : "تعذر إضافة المجموعة");
    } finally {
      setBusy(false);
    }
  }

  function toggleTest(id: string) {
    setSelectedTestIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {error && <p className="md:col-span-2 text-sm text-red-600">{error}</p>}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">إضافة تحليل</h2>
        <form onSubmit={handleCreateTest} className="space-y-2">
          <input name="code" required placeholder="الرمز (مثال: HGB)" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <input name="name" required placeholder="الاسم" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <input name="unit" placeholder="الوحدة (اختياري)" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <div className="flex gap-2">
            <input name="referenceRangeLow" type="number" step="0.01" placeholder="الحد الأدنى الطبيعي" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
            <input name="referenceRangeHigh" type="number" step="0.01" placeholder="الحد الأعلى الطبيعي" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
          </div>
          <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">حفظ</button>
        </form>
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          {tests.map((t) => (
            <li key={t.id}>{t.code} — {t.name} {t.unit ? `(${t.unit})` : ""}</li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-500">إضافة مجموعة تحاليل</h2>
        <form onSubmit={handleCreatePanel} className="space-y-2">
          <input name="name" required placeholder="اسم المجموعة" className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <div className="max-h-32 overflow-y-auto rounded-md border border-slate-100 p-2">
            {tests.map((t) => (
              <label key={t.id} className="flex items-center gap-2 py-0.5 text-xs">
                <input type="checkbox" checked={selectedTestIds.includes(t.id)} onChange={() => toggleTest(t.id)} />
                {t.code} — {t.name}
              </label>
            ))}
          </div>
          <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">حفظ</button>
        </form>
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          {panels.map((p) => (
            <li key={p.id}>{p.name} ({p.tests.length} تحليل)</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
