"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import {
  ExpiryAlerts,
  InventoryBatch,
  InventoryItem,
  LowStockAlert,
  StockLocation,
  StockLocationType,
  StockTransfer,
  StockTransferStatus,
} from "@/lib/types";

const TABS = [
  { key: "items", label: "المستلزمات" },
  { key: "batches", label: "الدُفعات" },
  { key: "transfers", label: "التحويلات" },
  { key: "alerts", label: "التنبيهات" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const locationLabel: Record<StockLocationType, string> = {
  MAIN_WAREHOUSE: "المخزن الرئيسي",
  PHARMACY: "الصيدلية",
  LABORATORY_STOCK: "مخزون المختبر",
  WARD_STOCK: "مخزون الردهة",
};

const transferStatusLabel: Record<StockTransferStatus, string> = {
  REQUESTED: "مطلوب",
  APPROVED: "معتمَد",
  ISSUED: "تم الصرف",
  RECEIVED: "مستلَم",
  REJECTED: "مرفوض",
};

export default function InventoryPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refreshItems() {
    apiFetch("/inventory/items")
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل المخزون"));
  }

  useEffect(() => {
    if (!user) return;
    refreshItems();
    apiFetch("/inventory/locations").then(setLocations).catch(() => setLocations([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">المخزون</h1>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <nav className="mt-4 flex gap-1 border-b border-slate-200 text-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 ${tab === t.key ? "border-b-2 border-slate-800 font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="mt-4">
        {tab === "items" && <ItemsTab user={user} items={items} onChanged={refreshItems} />}
        {tab === "batches" && <BatchesTab user={user} items={items} locations={locations} />}
        {tab === "transfers" && <TransfersTab user={user} items={items} locations={locations} onChanged={refreshItems} />}
        {tab === "alerts" && <AlertsTab />}
      </div>
    </AdminShell>
  );
}

function ItemsTab({
  user,
  items,
  onChanged,
}: {
  user: { permissions: string[] };
  items: InventoryItem[];
  onChanged: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [error, setError] = useState<string | null>(null);

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
          requiresBatchTracking: form.get("requiresBatchTracking") === "on",
        }),
      });
      setShowAddForm(false);
      onChanged();
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
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تعديل المخزون");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">كتالوج المستلزمات (رصيد المخزن الرئيسي)</h2>
        {user.permissions.includes("inventory.manage") && (
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            + إضافة مادة
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {showAddForm && (
        <form onSubmit={handleCreate} className="mt-4 max-w-lg space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <input name="name" required placeholder="اسم المادة" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="category" required placeholder="التصنيف (مثال: Dialyzer)" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="unit" required placeholder="الوحدة (مثال: piece, set)" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="cost" type="number" step="0.01" placeholder="التكلفة" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="minimumStock" type="number" step="0.01" placeholder="الحد الأدنى للمخزون" className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input name="requiresBatchTracking" type="checkbox" />
            تتطلب تتبع دفعات/تاريخ صلاحية
          </label>
          <button type="submit" className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
            حفظ
          </button>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">الاسم</th>
              <th className="px-4 py-2 font-medium">التصنيف</th>
              <th className="px-4 py-2 font-medium">الوحدة</th>
              <th className="px-4 py-2 font-medium">الرصيد</th>
              <th className="px-4 py-2 font-medium">التكلفة</th>
              <th className="px-4 py-2 font-medium">دفعات؟</th>
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
                <td className="px-4 py-2 text-slate-400">{item.requiresBatchTracking ? "نعم" : "-"}</td>
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
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">لا توجد مواد بعد</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function BatchesTab({
  user,
  items,
  locations,
}: {
  user: { permissions: string[] };
  items: InventoryItem[];
  locations: StockLocation[];
}) {
  const batchItems = items.filter((i) => i.requiresBatchTracking);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function refreshBatches(itemId: string) {
    if (!itemId) {
      setBatches([]);
      return;
    }
    apiFetch(`/inventory/items/${itemId}/batches`).then(setBatches).catch(() => setBatches([]));
  }

  async function handleReceive(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedItemId) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/inventory/items/${selectedItemId}/batches`, {
        method: "POST",
        body: JSON.stringify({
          locationId: form.get("locationId"),
          batchNumber: form.get("batchNumber"),
          quantity: Number(form.get("quantity")),
          expiryDate: form.get("expiryDate"),
        }),
      });
      (e.target as HTMLFormElement).reset();
      refreshBatches(selectedItemId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر استلام الدفعة");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-500">المادة:</label>
        <select
          value={selectedItemId}
          onChange={(e) => {
            setSelectedItemId(e.target.value);
            refreshBatches(e.target.value);
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">اختر مادة تتطلب دفعات...</option>
          {batchItems.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {selectedItemId && (
        <>
          {user.permissions.includes("inventory.batch.manage") && (
            <form onSubmit={handleReceive} className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
              <select name="locationId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">الموقع...</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{locationLabel[l.type]}</option>
                ))}
              </select>
              <input name="batchNumber" required placeholder="رقم الدفعة" className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <input name="quantity" type="number" step="0.01" required placeholder="الكمية" className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <input name="expiryDate" type="date" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                استلام دفعة
              </button>
            </form>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">الموقع</th>
                  <th className="px-4 py-2 font-medium">رقم الدفعة</th>
                  <th className="px-4 py-2 font-medium">الكمية</th>
                  <th className="px-4 py-2 font-medium">تاريخ الصلاحية</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const expired = new Date(b.expiryDate) < new Date();
                  return (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">{b.location ? locationLabel[b.location.type] : "-"}</td>
                      <td className="px-4 py-2 text-slate-500">{b.batchNumber}</td>
                      <td className="px-4 py-2">{b.quantity}</td>
                      <td className={`px-4 py-2 ${expired ? "font-medium text-red-600" : "text-slate-500"}`}>
                        {new Date(b.expiryDate).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
                {batches.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">لا توجد دفعات لهذه المادة</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TransfersTab({
  user,
  items,
  locations,
  onChanged,
}: {
  user: { permissions: string[] };
  items: InventoryItem[];
  locations: StockLocation[];
  onChanged: () => void;
}) {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [statusFilter, setStatusFilter] = useState<StockTransferStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);

  function refresh() {
    const params = statusFilter ? `?status=${statusFilter}` : "";
    apiFetch(`/inventory/transfers${params}`).then(setTransfers).catch(() => setTransfers([]));
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/inventory/transfers", {
        method: "POST",
        body: JSON.stringify({
          itemId: form.get("itemId"),
          fromLocationId: form.get("fromLocationId"),
          toLocationId: form.get("toLocationId"),
          quantity: Number(form.get("quantity")),
          reason: form.get("reason") || undefined,
        }),
      });
      (e.target as HTMLFormElement).reset();
      setShowRequestForm(false);
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إنشاء طلب التحويل");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, action: "approve" | "issue" | "receive") {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/inventory/transfers/${id}/${action}`, { method: "POST" });
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تنفيذ الإجراء");
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt("سبب الرفض؟");
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/inventory/transfers/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر رفض التحويل");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StockTransferStatus | "")} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">كل الحالات</option>
          {Object.entries(transferStatusLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {user.permissions.includes("inventory.transfer.request") && (
          <button onClick={() => setShowRequestForm((v) => !v)} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            + طلب تحويل
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {showRequestForm && (
        <form onSubmit={handleRequest} className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <select name="itemId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">المادة...</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <select name="fromLocationId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">من موقع...</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{locationLabel[l.type]}</option>
            ))}
          </select>
          <select name="toLocationId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">إلى موقع...</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{locationLabel[l.type]}</option>
            ))}
          </select>
          <input name="quantity" type="number" step="0.01" required placeholder="الكمية" className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input name="reason" placeholder="السبب (اختياري)" className="w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            إرسال الطلب
          </button>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">المادة</th>
              <th className="px-4 py-2 font-medium">من</th>
              <th className="px-4 py-2 font-medium">إلى</th>
              <th className="px-4 py-2 font-medium">الكمية</th>
              <th className="px-4 py-2 font-medium">الحالة</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{t.item?.name}</td>
                <td className="px-4 py-2 text-slate-500">{t.fromLocation ? locationLabel[t.fromLocation.type] : "-"}</td>
                <td className="px-4 py-2 text-slate-500">{t.toLocation ? locationLabel[t.toLocation.type] : "-"}</td>
                <td className="px-4 py-2">{t.quantity}</td>
                <td className="px-4 py-2 text-slate-500">{transferStatusLabel[t.status]}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    {t.status === "REQUESTED" && user.permissions.includes("inventory.transfer.approve") && (
                      <>
                        <button onClick={() => act(t.id, "approve")} disabled={busy} className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50">اعتماد</button>
                        <button onClick={() => reject(t.id)} disabled={busy} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">رفض</button>
                      </>
                    )}
                    {t.status === "APPROVED" && (
                      <>
                        {user.permissions.includes("inventory.transfer.issue") && (
                          <button onClick={() => act(t.id, "issue")} disabled={busy} className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50">صرف</button>
                        )}
                        {user.permissions.includes("inventory.transfer.approve") && (
                          <button onClick={() => reject(t.id)} disabled={busy} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">رفض</button>
                        )}
                      </>
                    )}
                    {t.status === "ISSUED" && user.permissions.includes("inventory.transfer.receive") && (
                      <button onClick={() => act(t.id, "receive")} disabled={busy} className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50">استلام</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {transfers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">لا توجد تحويلات</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertsTab() {
  const [lowStock, setLowStock] = useState<LowStockAlert[]>([]);
  const [expiry, setExpiry] = useState<ExpiryAlerts | null>(null);

  useEffect(() => {
    apiFetch("/inventory/alerts/low-stock").then(setLowStock).catch(() => setLowStock([]));
    apiFetch("/inventory/alerts/expiring").then(setExpiry).catch(() => setExpiry(null));
  }, []);

  return (
    <div className="space-y-6">
      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">مخزون منخفض / حرج</h2>
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">المادة</th>
              <th className="px-4 py-2 font-medium">المتوفر</th>
              <th className="px-4 py-2 font-medium">الحد الأدنى</th>
              <th className="px-4 py-2 font-medium">المستوى</th>
            </tr>
          </thead>
          <tbody>
            {lowStock.map((a) => (
              <tr key={a.itemId} className="border-t border-slate-100">
                <td className="px-4 py-2">{a.itemName}</td>
                <td className="px-4 py-2">{a.available}</td>
                <td className="px-4 py-2 text-slate-500">{a.minimumStock}</td>
                <td className={`px-4 py-2 font-medium ${a.level === "CRITICAL" ? "text-red-600" : "text-amber-600"}`}>
                  {a.level === "CRITICAL" ? "حرج" : "منخفض"}
                </td>
              </tr>
            ))}
            {lowStock.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">لا توجد تنبيهات مخزون حالياً</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">
          دفعات منتهية / قريبة الانتهاء (خلال {expiry?.withinDays ?? 30} يوماً)
        </h2>
        <table className="w-full text-right text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">المادة</th>
              <th className="px-4 py-2 font-medium">الموقع</th>
              <th className="px-4 py-2 font-medium">رقم الدفعة</th>
              <th className="px-4 py-2 font-medium">الكمية</th>
              <th className="px-4 py-2 font-medium">تاريخ الصلاحية</th>
              <th className="px-4 py-2 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {[...(expiry?.expired ?? []), ...(expiry?.expiringSoon ?? [])].map((b) => {
              const isExpired = expiry?.expired.some((x) => x.id === b.id);
              return (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="px-4 py-2">{b.item?.name}</td>
                  <td className="px-4 py-2 text-slate-500">{b.location ? locationLabel[b.location.type] : "-"}</td>
                  <td className="px-4 py-2 text-slate-500">{b.batchNumber}</td>
                  <td className="px-4 py-2">{b.quantity}</td>
                  <td className="px-4 py-2 text-slate-500">{new Date(b.expiryDate).toLocaleDateString()}</td>
                  <td className={`px-4 py-2 font-medium ${isExpired ? "text-red-600" : "text-amber-600"}`}>
                    {isExpired ? "منتهية" : "قريبة الانتهاء"}
                  </td>
                </tr>
              );
            })}
            {(expiry?.expired.length ?? 0) === 0 && (expiry?.expiringSoon.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">لا توجد دفعات منتهية أو قريبة الانتهاء</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
