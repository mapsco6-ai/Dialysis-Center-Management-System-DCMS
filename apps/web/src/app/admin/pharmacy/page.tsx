"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { InventoryItem, Prescription, PrescriptionStatus } from "@/lib/types";

const statusLabel: Record<PrescriptionStatus, string> = {
  ACTIVE: "بانتظار الصرف",
  DISPENSING: "قيد الصرف",
  DISPENSED: "تم الصرف",
  MODIFIED: "عُدِّلت (قديمة)",
  STOPPED: "أُوقفت",
};

const POLL_MS = 15000;

export default function PharmacyPage() {
  const user = useCurrentUser();
  const [filter, setFilter] = useState<PrescriptionStatus | "">("");
  const [queue, setQueue] = useState<Prescription[]>([]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dispenseFormId, setDispenseFormId] = useState<string | null>(null);

  function refreshQueue() {
    const params = filter ? `?status=${filter}` : "";
    apiFetch(`/pharmacy/queue${params}`).then(setQueue).catch(() => setQueue([]));
  }

  useEffect(() => {
    if (!user) return;
    refreshQueue();
    apiFetch("/inventory/items").then(setItems).catch(() => setItems([]));
    const interval = setInterval(refreshQueue, POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  async function startDispensing(id: string) {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/pharmacy/prescriptions/${id}/start-dispensing`, { method: "POST" });
      refreshQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر بدء الصرف");
    } finally {
      setBusy(false);
    }
  }

  async function submitDispense(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر الصرف");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  const canManageStock = user.permissions.includes("inventory.manage");

  return (
    <AdminShell user={user}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">الصيدلية — طابور الوصفات</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value as PrescriptionStatus | "")} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">الحالية (بانتظار/قيد الصرف)</option>
          <option value="DISPENSED">تم الصرف</option>
          <option value="STOPPED">أُوقفت</option>
          <option value="MODIFIED">عُدِّلت</option>
        </select>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-400">
            <tr>
              <th className="px-4 py-2 font-medium">المريض</th>
              <th className="px-4 py-2 font-medium">الدواء</th>
              <th className="px-4 py-2 font-medium">الطبيب</th>
              <th className="px-4 py-2 font-medium">الحالة</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {queue.map((p) => (
              <tr key={p.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <Link href={`/admin/patients/${p.patientId}`} className="text-slate-800 hover:underline">
                    {p.patient?.fullName}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-700">{p.medicationName} — {p.dose} / {p.frequency}</td>
                <td className="px-4 py-2 text-slate-500">{p.doctor?.fullName ?? "-"}</td>
                <td className="px-4 py-2 text-slate-500">{statusLabel[p.status]}</td>
                <td className="px-4 py-2">
                  {p.status === "ACTIVE" && (
                    <button onClick={() => startDispensing(p.id)} disabled={busy} className="text-xs font-medium text-slate-600 hover:underline disabled:opacity-50">
                      بدء الصرف
                    </button>
                  )}
                  {p.status === "DISPENSING" && (
                    <button onClick={() => setDispenseFormId(dispenseFormId === p.id ? null : p.id)} className="text-xs font-medium text-emerald-600 hover:underline">
                      صرف
                    </button>
                  )}
                  {dispenseFormId === p.id && (
                    <form onSubmit={(e) => submitDispense(e, p.id)} className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                      <select name="itemId" required className="rounded-md border border-slate-300 px-2 py-1 text-xs">
                        <option value="">اختر المادة...</option>
                        {items.map((i) => (
                          <option key={i.id} value={i.id}>{i.name}</option>
                        ))}
                      </select>
                      <input name="quantity" type="number" step="0.01" required placeholder="الكمية" className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs" />
                      <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">تأكيد الصرف</button>
                    </form>
                  )}
                  {(p.dispenses ?? []).length > 0 && (
                    <p className="mt-1 text-xs text-slate-400">
                      صُرف: {p.dispenses![0].item?.name} × {p.dispenses![0].quantity} بواسطة {p.dispenses![0].dispensedBy?.fullName}
                    </p>
                  )}
                </td>
              </tr>
            ))}
            {queue.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-slate-400">لا توجد وصفات في هذه القائمة</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {canManageStock && <StockTransferForm items={items} onChanged={() => apiFetch("/inventory/items").then(setItems).catch(() => undefined)} />}
    </AdminShell>
  );
}

function StockTransferForm({ items, onChanged }: { items: InventoryItem[]; onChanged: () => void }) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر التحويل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-500">تغذية مخزون الصيدلية (تحويل من المخزن الرئيسي)</h2>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <select name="itemId" required className="rounded-md border border-slate-300 px-2 py-1 text-xs">
          <option value="">اختر المادة...</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.name} (متوفر بالمخزن: {i.quantityInStock})</option>
          ))}
        </select>
        <input name="quantity" type="number" step="0.01" required placeholder="الكمية" className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs" />
        <input name="reason" placeholder="السبب (اختياري)" className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs" />
        <button type="submit" disabled={busy} className="rounded bg-slate-800 px-3 py-1 text-xs text-white disabled:opacity-50">تحويل</button>
      </form>
    </section>
  );
}
