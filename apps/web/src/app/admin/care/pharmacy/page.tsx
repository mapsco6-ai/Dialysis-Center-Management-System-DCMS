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
import { toast } from "@/components/Toaster";
import { InventoryItem, Prescription, PrescriptionStatus } from "@/lib/types";

export default function PharmacyPage() {
  const { t, formatNumber } = useI18n();
  const user = useCurrentUser();
  const [filter, setFilter] = useState<PrescriptionStatus | "">("");
  const [queue, setQueue] = useState<Prescription[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [dispenseFormId, setDispenseFormId] = useState<string | null>(null);
  const [queueLoaded, setQueueLoaded] = useState(false);

  function refreshQueue() {
    const params = filter ? `?status=${filter}` : "";
    apiFetch(`/pharmacy/queue${params}`)
      .then(setQueue)
      .catch(() => setQueue([]))
      .finally(() => setQueueLoaded(true));
  }

  useEffect(() => {
    if (!user) return;
    refreshQueue();
    apiFetch("/inventory/items").then(setItems).catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  async function startDispensing(id: string) {
    setBusy(true);
    try {
      await apiFetch(`/pharmacy/prescriptions/${id}/start-dispensing`, { method: "POST" });
      refreshQueue();
      toast.info(t("بدأ الصرف — أكمل إدخال الكمية", "Dispensing started - enter the quantity"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("تعذر بدء الصرف", "Unable to start dispensing"));
    } finally {
      setBusy(false);
    }
  }

  async function submitDispense(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await apiFetch(`/pharmacy/prescriptions/${id}/dispense`, {
        method: "POST",
        body: JSON.stringify({
          itemId: form.get("itemId"),
          quantity: Number(form.get("quantity")),
          linkedSessionId: form.get("linkedSessionId") || undefined,
        }),
      });
      setDispenseFormId(null);
      refreshQueue();
      toast.success(t("تم الصرف", "Dispensed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("تعذر الصرف", "Unable to dispense"));
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const canManageStock = user.permissions.includes("inventory.manage");

  return (
    <AdminShell user={user}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">{t("الصيدلية — طابور الوصفات", "Pharmacy — Prescription queue")}</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value as PrescriptionStatus | "")} className="rounded-md border border-border px-3 py-1.5 text-sm" aria-label={t("فلتر الحالة", "Status filter")}>
          <option value="">{t("الحالية (بانتظار/قيد الصرف)", "Current (awaiting / dispensing)")}</option>
          <option value="DISPENSED">{t("تم الصرف", "Dispensed")}</option>
          <option value="STOPPED">{t("أُوقفت", "Stopped")}</option>
          <option value="MODIFIED">{t("عُدِّلت", "Modified")}</option>
        </select>
      </div>

      <Card className="mt-4 overflow-hidden border border-border bg-surface shadow-none">
        <Card.Content className="p-0">
        <table className="w-full text-start text-sm">
          <thead className="bg-surface-secondary text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("المريض", "Patient")}</th>
              <th className="px-4 py-2 font-medium">{t("الدواء", "Medication")}</th>
              <th className="px-4 py-2 font-medium">{t("الطبيب", "Doctor")}</th>
              <th className="px-4 py-2 font-medium">{t("الحالة", "Status")}</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {!queueLoaded && queue.length === 0 && (
              <tr>
                <td colSpan={5} className="p-0">
                  <SkeletonTable rows={4} columns={5} />
                </td>
              </tr>
            )}
            {queue.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-2">
                  <Link href={`/admin/care/patients/${p.patientId}`} className="text-foreground hover:underline">
                    {p.patient?.fullName}
                  </Link>
                </td>
                <td className="px-4 py-2 text-foreground">{p.medicationName} — {p.dose} / {p.frequency}</td>
                <td className="px-4 py-2 text-muted">{p.doctor?.fullName ?? "-"}</td>
                <td className="px-4 py-2"><StatusBadge group="prescription" value={p.status} /></td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                  {p.status === "ACTIVE" && (
                    <Button size="sm" variant="secondary" isDisabled={busy} onPress={() => startDispensing(p.id)}>
                      {t("بدء الصرف", "Start dispensing")}
                    </Button>
                  )}
                  {p.status === "DISPENSING" && (
                    <Button size="sm" variant="primary" onPress={() => setDispenseFormId(dispenseFormId === p.id ? null : p.id)}>
                      {t("صرف", "Dispense")}
                    </Button>
                  )}
                  </div>
                  {dispenseFormId === p.id && (
                    <form onSubmit={(e) => submitDispense(e, p.id)} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-surface-secondary p-2">
                      <select name="itemId" required className="rounded-md border border-border px-2 py-1 text-xs" aria-label={t("المادة", "Item")}>
                        <option value="">{t("اختر المادة...", "Select an item...")}</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                      <input name="quantity" type="number" step="0.01" required placeholder={t("الكمية", "Quantity")} className="w-20 rounded-md border border-border px-2 py-1 text-xs" />
                      <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground disabled:opacity-50">{t("تأكيد الصرف", "Confirm dispensing")}</button>
                    </form>
                  )}
                  {(p.dispenses ?? []).length > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      {t("صُرف:", "Dispensed:")} {p.dispenses![0].item?.name} × {formatNumber(Number(p.dispenses![0].quantity))} {t("بواسطة", "by")} {p.dispenses![0].dispensedBy?.fullName}
                    </p>
                  )}
                </td>
              </tr>
            ))}
            {queueLoaded && queue.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState title={t("لا توجد وصفات في هذه القائمة", "No prescriptions in this list")}
                    description={t("جرّب تغيير الفلتر أعلى الجدول — الوصفات الجديدة تظهر تلقائياً.", "Try changing the filter above - new prescriptions appear automatically.")} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </Card.Content>
      </Card>

      {canManageStock && <StockTransferForm items={items} onChanged={() => apiFetch("/inventory/items").then(setItems).catch(() => undefined)} />}
    </AdminShell>
  );
}

function StockTransferForm({ items, onChanged }: { items: InventoryItem[]; onChanged: () => void }) {
  const { t, formatNumber } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/pharmacy/stock/transfer-in", {
        method: "POST",
        body: JSON.stringify({
          itemId: form.get("itemId"),
          quantity: Number(form.get("quantity")),
          reason: form.get("reason") || undefined,
        }),
      });
      (e.target as HTMLFormElement).reset();
      onChanged();
      toast.success(t("تم التحويل إلى مخزون الصيدلية", "Stock transferred to the pharmacy"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("تعذر التحويل", "Unable to transfer stock"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6 border border-border bg-surface shadow-none">
      <Card.Header><Card.Title className="text-sm font-semibold text-muted">{t("تغذية مخزون الصيدلية (تحويل من المخزن الرئيسي)", "Replenish pharmacy stock (transfer from main warehouse)")}</Card.Title></Card.Header>
      <Card.Content>
      <ErrorNote message={error} className="mb-2" />
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <select name="itemId" required className="rounded-md border border-border px-2 py-1 text-xs" aria-label={t("المادة", "Item")}>
          <option value="">{t("اختر المادة...", "Select an item...")}</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.name} {t("(متوفر بالمخزن:", "(Available in warehouse:")} {formatNumber(Number(i.quantityInStock))})</option>
          ))}
        </select>
        <input name="quantity" type="number" step="0.01" required placeholder={t("الكمية", "Quantity")} className="w-24 rounded-md border border-border px-2 py-1 text-xs" />
        <input name="reason" placeholder={t("السبب (اختياري)", "Reason (optional)")} className="w-40 rounded-md border border-border px-2 py-1 text-xs" />
        <button type="submit" disabled={busy} className="rounded-md bg-accent px-3 py-1 text-xs text-accent-foreground disabled:opacity-50">{t("تحويل", "Transfer")}</button>
      </form>
      </Card.Content>
    </Card>
  );
}
