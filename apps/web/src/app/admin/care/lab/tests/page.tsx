"use client";

import { FormEvent, useEffect, useState } from "react";
import { Card } from "@heroui/react";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import { LabPanel, LabTest } from "@/lib/types";

export default function LabTestsPage() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const [tests, setTests] = useState<LabTest[]>([]);
  const [panels, setPanels] = useState<LabPanel[]>([]);

  function refresh() {
    apiFetch("/lab/tests").then(setTests).catch(() => setTests([]));
    apiFetch("/lab/panels").then(setPanels).catch(() => setPanels([]));
  }

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user]);

  if (!user) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-foreground">{t("إضافة تحليل", "Add test")}</h1>
      <CatalogManager tests={tests} panels={panels} onChanged={refresh} />
    </AdminShell>
  );
}

function CatalogManager({ tests, panels, onChanged }: { tests: LabTest[]; panels: LabPanel[]; onChanged: () => void }) {
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

  return (
    <div className="mt-4">
      <ErrorNote message={error} />
      <div className="grid gap-4 md:grid-cols-2">
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
                  <input type="checkbox" checked={selectedTestIds.includes(entry.id)} onChange={() => setSelectedTestIds((prev) => prev.includes(entry.id) ? prev.filter((id) => id !== entry.id) : [...prev, entry.id])} />
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
    </div>
  );
}
