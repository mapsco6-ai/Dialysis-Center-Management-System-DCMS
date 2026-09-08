"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { SessionSuppliesResponse } from "@/lib/types";

const statusLabel: Record<string, string> = {
  ISSUED: "صُرف",
  UNAVAILABLE: "غير متوفر",
  SUBSTITUTED: "بديل",
};

export default function SessionSuppliesPage() {
  const params = useParams<{ id: string }>();
  const user = useCurrentUser();
  const [data, setData] = useState<SessionSuppliesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [substitutingFor, setSubstitutingFor] = useState<string | null>(null);
  const [substituteItemId, setSubstituteItemId] = useState("");
  const [substituteQty, setSubstituteQty] = useState("");
  const [substituteReason, setSubstituteReason] = useState("");
  const [catalog, setCatalog] = useState<{ id: string; name: string; quantityInStock: string }[]>([]);

  function refresh() {
    apiFetch(`/sessions/${params.id}/supplies`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "تعذر تحميل مستلزمات الجلسة"));
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    apiFetch("/inventory/items").then(setCatalog).catch(() => setCatalog([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, params.id]);

  async function handleConfirmIssue() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch(`/sessions/${params.id}/supplies/confirm-issue`, { method: "POST" });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تأكيد الصرف");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubstitute(originalItemId: string) {
    if (!substituteItemId || !substituteQty || !substituteReason.trim()) {
      setError("أكمل بيانات البديل (المادة، الكمية، السبب)");
      return;
    }
    setError(null);
    try {
      await apiFetch(`/sessions/${params.id}/supplies/substitute`, {
        method: "POST",
        body: JSON.stringify({
          originalItemId,
          substituteItemId,
          quantity: Number(substituteQty),
          reason: substituteReason.trim(),
        }),
      });
      setSubstitutingFor(null);
      setSubstituteItemId("");
      setSubstituteQty("");
      setSubstituteReason("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل البديل");
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  if (error && !data) {
    return <main className="p-8 text-red-600">{error}</main>;
  }

  if (!data) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">مستلزمات الجلسة</h1>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">بانتظار التأكيد</h2>
        {data.pending.length === 0 ? (
          <p className="text-sm text-slate-400">لا توجد مواد بانتظار الصرف</p>
        ) : (
          <ul className="space-y-1">
            {data.pending.map((line) => (
              <li key={line.itemId} className="flex items-center justify-between text-sm">
                <span>
                  {line.item.name} &times; {line.quantity} {line.item.unit}
                  {line.isOverridden && <span className="mr-2 text-xs text-amber-600">(معدّلة لهذه الجلسة)</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {user.permissions.includes("inventory.issue") && data.pending.length > 0 && (
          <button
            onClick={handleConfirmIssue}
            disabled={busy}
            className="mt-4 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "جاري التأكيد..." : "تأكيد الصرف (Confirm Issue)"}
          </button>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">ما تم صرفه فعلياً</h2>
        {data.issued.length === 0 ? (
          <p className="text-sm text-slate-400">لا يوجد شيء مصروف بعد</p>
        ) : (
          <ul className="space-y-2">
            {data.issued.map((row) => (
              <li key={row.id} className="rounded-md border border-slate-100 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    <span
                      className={
                        row.status === "UNAVAILABLE"
                          ? "font-semibold text-red-600"
                          : row.status === "SUBSTITUTED"
                            ? "font-semibold text-amber-600"
                            : "font-semibold text-emerald-600"
                      }
                    >
                      [{statusLabel[row.status]}]
                    </span>{" "}
                    {row.item.name} &times; {row.quantityIssued} {row.item.unit}
                    {row.substituteForItem && (
                      <span className="text-xs text-slate-500"> (بديل عن {row.substituteForItem.name})</span>
                    )}
                  </span>
                  {row.status === "UNAVAILABLE" && user.permissions.includes("inventory.issue") && (
                    <button
                      onClick={() => setSubstitutingFor(row.itemId)}
                      className="text-xs font-medium text-slate-600 hover:underline"
                    >
                      اختيار بديل
                    </button>
                  )}
                </div>

                {substitutingFor === row.itemId && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-slate-50 p-2">
                    <select
                      value={substituteItemId}
                      onChange={(e) => setSubstituteItemId(e.target.value)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="">اختر البديل...</option>
                      {catalog
                        .filter((c) => c.id !== row.itemId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} (متوفر: {c.quantityInStock})
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="الكمية"
                      value={substituteQty}
                      onChange={(e) => setSubstituteQty(e.target.value)}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <input
                      placeholder="السبب"
                      value={substituteReason}
                      onChange={(e) => setSubstituteReason(e.target.value)}
                      className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => handleSubstitute(row.itemId)}
                      className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                    >
                      حفظ
                    </button>
                    <button onClick={() => setSubstitutingFor(null)} className="text-xs text-slate-400">
                      إلغاء
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
