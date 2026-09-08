"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { InventoryItem } from "@/lib/types";

export default function InventoryPage() {
  const user = useCurrentUser();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  function refresh() {
    apiFetch("/inventory/items")
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل المخزون"));
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/inventory/items", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          category: form.get("category"),
          unit: form.get("unit"),
          cost: form.get("cost") ? Number(form.get("cost")) : undefined,
          minimumStock: form.get("minimumStock") ? Number(form.get("minimumStock")) : undefined,
        }),
      });
      setShowAddForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إضافة المادة");
    }
  }

  async function handleAdjust(itemId: string, direction: "INCREASE" | "DECREASE") {
    if (!adjustQty || !adjustReason.trim()) {
      setError("أدخل الكمية والسبب");
      return;
    }
    setError(null);
    try {
      await apiFetch(`/inventory/items/${itemId}/stock/adjust`, {
        method: "POST",
        body: JSON.stringify({ quantity: Number(adjustQty), direction, reason: adjustReason.trim() }),
      });
      setAdjustingId(null);
      setAdjustQty("");
      setAdjustReason("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تعديل المخزون");
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  return (
    <AdminShell user={user}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">المخزون — المستلزمات</h1>
        {user.permissions.includes("inventory.manage") && (
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            + إضافة مادة
          </button>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {showAddForm && (
        <form onSubmit={handleCreate} className="mt-4 max-w-lg space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <input name="name" required placeholder="اسم المادة" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="category" required placeholder="التصنيف (مثال: Dialyzer)" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="unit" required placeholder="الوحدة (مثال: piece, set)" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="cost" type="number" step="0.01" placeholder="التكلفة" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="minimumStock" type="number" step="0.01" placeholder="الحد الأدنى للمخزون" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <button type="submit" className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
            حفظ
          </button>
        </form>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">الاسم</th>
              <th className="px-4 py-2 font-medium">التصنيف</th>
              <th className="px-4 py-2 font-medium">الوحدة</th>
              <th className="px-4 py-2 font-medium">الرصيد</th>
              <th className="px-4 py-2 font-medium">التكلفة</th>
              {user.permissions.includes("inventory.manage") && <th className="px-4 py-2 font-medium">تعديل المخزون</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{item.name}</td>
                <td className="px-4 py-2 text-slate-500">{item.category}</td>
                <td className="px-4 py-2 text-slate-500">{item.unit}</td>
                <td className={`px-4 py-2 font-medium ${Number(item.quantityInStock) <= Number(item.minimumStock) ? "text-red-600" : "text-slate-700"}`}>
                  {item.quantityInStock}
                </td>
                <td className="px-4 py-2 text-slate-500">{item.cost}</td>
                {user.permissions.includes("inventory.manage") && (
                  <td className="px-4 py-2">
                    {adjustingId === item.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={adjustQty}
                          onChange={(e) => setAdjustQty(e.target.value)}
                          placeholder="الكمية"
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        <input
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          placeholder="السبب"
                          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button onClick={() => handleAdjust(item.id, "INCREASE")} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">+</button>
                        <button onClick={() => handleAdjust(item.id, "DECREASE")} className="rounded bg-red-600 px-2 py-1 text-xs text-white">-</button>
                        <button onClick={() => setAdjustingId(null)} className="text-xs text-slate-400">إلغاء</button>
                      </div>
                    ) : (
                      <button onClick={() => setAdjustingId(item.id)} className="text-xs text-slate-600 hover:underline">
                        تعديل
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">لا توجد مواد بعد</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
