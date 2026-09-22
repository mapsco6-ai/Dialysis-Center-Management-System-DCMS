"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
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

type TabKey = ReturnType<typeof getLabels>["TABS"][number]["key"];

function getLabels(t: (arabic: string, english: string) => string) {
  const TABS = [
    { key: "items", label: t("المستلزمات", "Supplies") },
    { key: "batches", label: t("الدُفعات", "Batches") },
    { key: "transfers", label: t("التحويلات", "Transfers") },
    { key: "alerts", label: t("التنبيهات", "Alerts") },
  ] as const;

  const locationLabel: Record<StockLocationType, string> = {
    MAIN_WAREHOUSE: t("المخزن الرئيسي", "Main warehouse"),
    PHARMACY: t("الصيدلية", "Pharmacy"),
    LABORATORY_STOCK: t("مخزون المختبر", "Laboratory stock"),
    WARD_STOCK: t("مخزون الردهة", "Ward stock"),
  };

  const transferStatusLabel: Record<StockTransferStatus, string> = {
    REQUESTED: t("مطلوب", "Requested"),
    APPROVED: t("معتمَد", "Approved"),
    ISSUED: t("تم الصرف", "Issued"),
    RECEIVED: t("مستلَم", "Received"),
    REJECTED: t("مرفوض", "Rejected"),
  };
  return { TABS, locationLabel, transferStatusLabel };
}

export default function InventoryPage() {
  const { t } = useI18n();
  const { TABS } = getLabels(t);
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refreshItems() {
    apiFetch("/inventory/items")
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : t("تعذر تحميل المخزون", "Unable to load inventory")));
  }

  useEffect(() => {
    if (!user) return;
    refreshItems();
    apiFetch("/inventory/locations").then(setLocations).catch(() => setLocations([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">{t("المخزون", "Inventory")}</h1>
      <ErrorNote message={error} className="mt-3" />

      <nav className="mt-4 flex gap-1 border-b border-slate-200 text-sm">
        {TABS.map((entry) => (
          <button
            key={entry.key}
            onClick={() => setTab(entry.key)}
            className={`px-3 py-2 ${tab === entry.key ? "border-b-2 border-slate-800 font-medium text-slate-800" : "text-slate-500 hover:text-slate-700"}`}
          >
            {entry.label}
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
  const { t, formatNumber } = useI18n();
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
      setError(err instanceof Error ? err.message : t("تعذر إضافة المادة", "Unable to add the item"));
    }
  }

  async function handleAdjust(itemId: string, direction: "INCREASE" | "DECREASE") {
    if (!adjustQty || !adjustReason.trim()) {
      setError(t("أدخل الكمية والسبب", "Enter a quantity and reason"));
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
      setError(err instanceof Error ? err.message : t("تعذر تعديل المخزون", "Unable to adjust stock"));
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">{t("كتالوج المستلزمات (رصيد المخزن الرئيسي)", "Supply catalog (main warehouse stock)")}</h2>
        {user.permissions.includes("inventory.manage") && (
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
          >
            {t("+ إضافة مادة", "+ Add item")}
          </button>
        )}
      </div>

      <ErrorNote message={error} className="mt-3" />

      {showAddForm && (
        <form onSubmit={handleCreate} className="mt-4 max-w-lg space-y-2 rounded-lg border border-slate-200 bg-white p-4">
          <input name="name" required placeholder={t("اسم المادة", "Item name")} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="category" required placeholder={t("التصنيف (مثال: Dialyzer)", "Category (e.g. Dialyzer)")} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="unit" required placeholder={t("الوحدة (مثال: piece, set)", "Unit (e.g. piece, set)")} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="cost" type="number" step="0.01" placeholder={t("التكلفة", "Cost")} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <input name="minimumStock" type="number" step="0.01" placeholder={t("الحد الأدنى للمخزون", "Minimum stock")} className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input name="requiresBatchTracking" type="checkbox" />
            {t("تتطلب تتبع دفعات/تاريخ صلاحية", "Requires batch and expiry tracking")}
          </label>
          <button type="submit" className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700">
            {t("حفظ", "Save")}
          </button>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t("الاسم", "Name")}</th>
              <th className="px-4 py-2 font-medium">{t("التصنيف", "Category")}</th>
              <th className="px-4 py-2 font-medium">{t("الوحدة", "Unit")}</th>
              <th className="px-4 py-2 font-medium">{t("الرصيد", "Stock")}</th>
              <th className="px-4 py-2 font-medium">{t("التكلفة", "Cost")}</th>
              <th className="px-4 py-2 font-medium">{t("دفعات؟", "Batch tracking")}</th>
              {user.permissions.includes("inventory.manage") && <th className="px-4 py-2 font-medium">{t("تعديل المخزون", "Adjust stock")}</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{item.name}</td>
                <td className="px-4 py-2 text-slate-500">{item.category}</td>
                <td className="px-4 py-2 text-slate-500">{item.unit}</td>
                <td className={`px-4 py-2 font-medium ${Number(item.quantityInStock) <= Number(item.minimumStock) ? "text-red-600" : "text-slate-700"}`}>
                  {formatNumber(Number(item.quantityInStock))}
                </td>
                <td className="px-4 py-2 text-slate-500">{formatNumber(Number(item.cost))}</td>
                <td className="px-4 py-2 text-slate-400">{item.requiresBatchTracking ? t("نعم", "Yes") : "-"}</td>
                {user.permissions.includes("inventory.manage") && (
                  <td className="px-4 py-2">
                    {adjustingId === item.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={adjustQty}
                          onChange={(e) => setAdjustQty(e.target.value)}
                          placeholder={t("الكمية", "Quantity")}
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        <input
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          placeholder={t("السبب", "Reason")}
                          className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                        <button onClick={() => handleAdjust(item.id, "INCREASE")} className="rounded bg-emerald-600 px-2 py-1 text-xs text-white">+</button>
                        <button onClick={() => handleAdjust(item.id, "DECREASE")} className="rounded bg-red-600 px-2 py-1 text-xs text-white">-</button>
                        <button onClick={() => setAdjustingId(null)} className="text-xs text-slate-400">{t("إلغاء", "Cancel")}</button>
                      </div>
                    ) : (
                      <button onClick={() => setAdjustingId(item.id)} className="text-xs text-slate-600 hover:underline">
                        {t("تعديل", "Edit")}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">{t("لا توجد مواد بعد", "No items yet")}</td>
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
  const { t, formatDate, formatNumber } = useI18n();
  const { locationLabel } = getLabels(t);
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
      setError(err instanceof Error ? err.message : t("تعذر استلام الدفعة", "Unable to receive the batch"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-sm text-slate-500">{t("المادة:", "Item:")}</label>
        <select
          value={selectedItemId}
          onChange={(e) => {
            setSelectedItemId(e.target.value);
            refreshBatches(e.target.value);
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="">{t("اختر مادة تتطلب دفعات...", "Select an item with batch tracking...")}</option>
          {batchItems.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
      </div>

      <ErrorNote message={error} className="mt-3" />

      {selectedItemId && (
        <>
          {user.permissions.includes("inventory.batch.manage") && (
            <form onSubmit={handleReceive} className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
              <select name="locationId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
                <option value="">{t("الموقع...", "Location...")}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{locationLabel[l.type]}</option>
                ))}
              </select>
              <input name="batchNumber" required placeholder={t("رقم الدفعة", "Batch number")} className="w-32 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <input name="quantity" type="number" step="0.01" required placeholder={t("الكمية", "Quantity")} className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <input name="expiryDate" type="date" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
              <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                {t("استلام دفعة", "Receive batch")}
              </button>
            </form>
          )}

          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-start text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("الموقع", "Location")}</th>
                  <th className="px-4 py-2 font-medium">{t("رقم الدفعة", "Batch number")}</th>
                  <th className="px-4 py-2 font-medium">{t("الكمية", "Quantity")}</th>
                  <th className="px-4 py-2 font-medium">{t("تاريخ الصلاحية", "Expiry date")}</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const expired = new Date(b.expiryDate) < new Date();
                  return (
                    <tr key={b.id} className="border-t border-slate-100">
                      <td className="px-4 py-2">{b.location ? locationLabel[b.location.type] : "-"}</td>
                      <td className="px-4 py-2 text-slate-500">{b.batchNumber}</td>
                      <td className="px-4 py-2">{formatNumber(Number(b.quantity))}</td>
                      <td className={`px-4 py-2 ${expired ? "font-medium text-red-600" : "text-slate-500"}`}>
                        {formatDate(b.expiryDate)}
                      </td>
                    </tr>
                  );
                })}
                {batches.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">{t("لا توجد دفعات لهذه المادة", "No batches for this item")}</td>
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
  const { t, formatNumber } = useI18n();
  const { locationLabel, transferStatusLabel } = getLabels(t);
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
      setError(err instanceof Error ? err.message : t("تعذر إنشاء طلب التحويل", "Unable to create the transfer request"));
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
      setError(err instanceof Error ? err.message : t("تعذر تنفيذ الإجراء", "Unable to complete the action"));
    } finally {
      setBusy(false);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt(t("سبب الرفض؟", "Reason for rejection?"));
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/inventory/transfers/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
      refresh();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر رفض التحويل", "Unable to reject the transfer"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StockTransferStatus | "")} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">
          <option value="">{t("كل الحالات", "All statuses")}</option>
          {Object.entries(transferStatusLabel).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {user.permissions.includes("inventory.transfer.request") && (
          <button onClick={() => setShowRequestForm((v) => !v)} className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            {t("+ طلب تحويل", "+ Request transfer")}
          </button>
        )}
      </div>

      <ErrorNote message={error} className="mt-3" />

      {showRequestForm && (
        <form onSubmit={handleRequest} className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-4">
          <select name="itemId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">{t("المادة...", "Item...")}</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <select name="fromLocationId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">{t("من موقع...", "From location...")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{locationLabel[l.type]}</option>
            ))}
          </select>
          <select name="toLocationId" required className="rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">{t("إلى موقع...", "To location...")}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{locationLabel[l.type]}</option>
            ))}
          </select>
          <input name="quantity" type="number" step="0.01" required placeholder={t("الكمية", "Quantity")} className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <input name="reason" placeholder={t("السبب (اختياري)", "Reason (optional)")} className="w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <button type="submit" disabled={busy} className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
            {t("إرسال الطلب", "Submit request")}
          </button>
        </form>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-start text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t("المادة", "Item")}</th>
              <th className="px-4 py-2 font-medium">{t("من", "From")}</th>
              <th className="px-4 py-2 font-medium">{t("إلى", "To")}</th>
              <th className="px-4 py-2 font-medium">{t("الكمية", "Quantity")}</th>
              <th className="px-4 py-2 font-medium">{t("الحالة", "Status")}</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((entry) => (
              <tr key={entry.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{entry.item?.name}</td>
                <td className="px-4 py-2 text-slate-500">{entry.fromLocation ? locationLabel[entry.fromLocation.type] : "-"}</td>
                <td className="px-4 py-2 text-slate-500">{entry.toLocation ? locationLabel[entry.toLocation.type] : "-"}</td>
                <td className="px-4 py-2">{formatNumber(Number(entry.quantity))}</td>
                <td className="px-4 py-2 text-slate-500">{transferStatusLabel[entry.status]}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    {entry.status === "REQUESTED" && user.permissions.includes("inventory.transfer.approve") && (
                      <>
                        <button onClick={() => act(entry.id, "approve")} disabled={busy} className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50">{t("اعتماد", "Approve")}</button>
                        <button onClick={() => reject(entry.id)} disabled={busy} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">{t("رفض", "Reject")}</button>
                      </>
                    )}
                    {entry.status === "APPROVED" && (
                      <>
                        {user.permissions.includes("inventory.transfer.issue") && (
                          <button onClick={() => act(entry.id, "issue")} disabled={busy} className="text-xs font-medium text-slate-700 hover:underline disabled:opacity-50">{t("صرف", "Issue")}</button>
                        )}
                        {user.permissions.includes("inventory.transfer.approve") && (
                          <button onClick={() => reject(entry.id)} disabled={busy} className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">{t("رفض", "Reject")}</button>
                        )}
                      </>
                    )}
                    {entry.status === "ISSUED" && user.permissions.includes("inventory.transfer.receive") && (
                      <button onClick={() => act(entry.id, "receive")} disabled={busy} className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50">{t("استلام", "Receive")}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {transfers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">{t("لا توجد تحويلات", "No transfers")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertsTab() {
  const { t, formatDate, formatNumber } = useI18n();
  const { locationLabel } = getLabels(t);
  const [lowStock, setLowStock] = useState<LowStockAlert[]>([]);
  const [expiry, setExpiry] = useState<ExpiryAlerts | null>(null);

  useEffect(() => {
    apiFetch("/inventory/alerts/low-stock").then(setLowStock).catch(() => setLowStock([]));
    apiFetch("/inventory/alerts/expiring").then(setExpiry).catch(() => setExpiry(null));
  }, []);

  return (
    <div className="space-y-6">
      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">{t("مخزون منخفض / حرج", "Low / critical stock")}</h2>
        <table className="w-full text-start text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t("المادة", "Item")}</th>
              <th className="px-4 py-2 font-medium">{t("المتوفر", "Available")}</th>
              <th className="px-4 py-2 font-medium">{t("الحد الأدنى", "Minimum")}</th>
              <th className="px-4 py-2 font-medium">{t("المستوى", "Level")}</th>
            </tr>
          </thead>
          <tbody>
            {lowStock.map((a) => (
              <tr key={a.itemId} className="border-t border-slate-100">
                <td className="px-4 py-2">{a.itemName}</td>
                <td className="px-4 py-2">{formatNumber(Number(a.available))}</td>
                <td className="px-4 py-2 text-slate-500">{formatNumber(Number(a.minimumStock))}</td>
                <td className={`px-4 py-2 font-medium ${a.level === "CRITICAL" ? "text-red-600" : "text-amber-600"}`}>
                  {a.level === "CRITICAL" ? t("حرج", "Critical") : t("منخفض", "Low")}
                </td>
              </tr>
            ))}
            {lowStock.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">{t("لا توجد تنبيهات مخزون حالياً", "No stock alerts at the moment")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-500">
          {t("دفعات منتهية / قريبة الانتهاء (خلال", "Expired / expiring batches (within")} {formatNumber(expiry?.withinDays ?? 30)} {t("يوماً)", "days)")}
        </h2>
        <table className="w-full text-start text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">{t("المادة", "Item")}</th>
              <th className="px-4 py-2 font-medium">{t("الموقع", "Location")}</th>
              <th className="px-4 py-2 font-medium">{t("رقم الدفعة", "Batch number")}</th>
              <th className="px-4 py-2 font-medium">{t("الكمية", "Quantity")}</th>
              <th className="px-4 py-2 font-medium">{t("تاريخ الصلاحية", "Expiry date")}</th>
              <th className="px-4 py-2 font-medium">{t("الحالة", "Status")}</th>
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
                  <td className="px-4 py-2">{formatNumber(Number(b.quantity))}</td>
                  <td className="px-4 py-2 text-slate-500">{formatDate(b.expiryDate)}</td>
                  <td className={`px-4 py-2 font-medium ${isExpired ? "text-red-600" : "text-amber-600"}`}>
                    {isExpired ? t("منتهية", "Expired") : t("قريبة الانتهاء", "Expiring soon")}
                  </td>
                </tr>
              );
            })}
            {(expiry?.expired.length ?? 0) === 0 && (expiry?.expiringSoon.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate-400">{t("لا توجد دفعات منتهية أو قريبة الانتهاء", "No expired or expiring batches")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
