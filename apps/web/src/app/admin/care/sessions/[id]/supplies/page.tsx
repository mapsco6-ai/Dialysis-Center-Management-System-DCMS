"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import { SessionSuppliesResponse } from "@/lib/types";

const getStatusLabels = (t: (arabic: string, english: string) => string): Record<string, string> => ({
  ISSUED: t("صُرف", "Issued"),
  UNAVAILABLE: t("غير متوفر", "Unavailable"),
  SUBSTITUTED: t("بديل", "Substituted"),
});

export default function SessionSuppliesPage() {
  const { t, formatNumber } = useI18n();
  const statusLabel = getStatusLabels(t);
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
    apiFetch(`/appointments/${params.id}/session/supplies`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : t("تعذر تحميل مستلزمات الجلسة", "Unable to load session supplies")));
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
      const result = await apiFetch(`/appointments/${params.id}/session/supplies/issues`, { method: "POST" });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر تأكيد الصرف", "Unable to confirm issue"));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubstitute(originalItemId: string) {
    if (!substituteItemId || !substituteQty || !substituteReason.trim()) {
      setError(t("أكمل بيانات البديل (المادة، الكمية، السبب)", "Complete the substitution details (item, quantity, reason)"));
      return;
    }
    setError(null);
    try {
      await apiFetch(`/appointments/${params.id}/session/supplies/substitutions`, {
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
      setError(err instanceof Error ? err.message : t("تعذر تسجيل البديل", "Unable to record substitution"));
    }
  }

  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  if (error && !data) {
    return <main className="p-8 text-red-600">{error}</main>;
  }

  if (!data) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">{t("مستلزمات الجلسة", "Session supplies")}</h1>

      <ErrorNote message={error} className="mt-4" />

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("بانتظار التأكيد", "Awaiting confirmation")}</h2>
        {data.pending.length === 0 ? (
          <p className="text-sm text-slate-400">{t("لا توجد مواد بانتظار الصرف", "No items awaiting issue")}</p>
        ) : (
          <ul className="space-y-1">
            {data.pending.map((line) => (
              <li key={line.itemId} className="flex items-center justify-between text-sm">
                <span>
                  {line.item.name} &times; {formatNumber(Number(line.quantity))} {line.item.unit}
                  {line.isOverridden && <span className="ms-2 text-xs text-amber-600">{t("(معدّلة لهذه الجلسة)", "(Adjusted for this session)")}</span>}
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
            {busy ? t("جاري التأكيد...", "Confirming...") : t("تأكيد الصرف (Confirm Issue)", "Confirm issue")}
          </button>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">{t("ما تم صرفه فعلياً", "Items issued")}</h2>
        {data.issued.length === 0 ? (
          <p className="text-sm text-slate-400">{t("لا يوجد شيء مصروف بعد", "No items issued yet")}</p>
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
                    {row.item.name} &times; {formatNumber(Number(row.quantityIssued))} {row.item.unit}
                    {row.substituteForItem && (
                      <span className="text-xs text-slate-500"> {t("(بديل عن", "(Substitute for")} {row.substituteForItem.name})</span>
                    )}
                  </span>
                  {row.status === "UNAVAILABLE" && user.permissions.includes("inventory.issue") && (
                    <button
                      onClick={() => setSubstitutingFor(row.itemId)}
                      className="text-xs font-medium text-slate-600 hover:underline"
                    >
                      {t("اختيار بديل", "Choose substitute")}
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
                      <option value="">{t("اختر البديل...", "Select a substitute...")}</option>
                      {catalog
                        .filter((c) => c.id !== row.itemId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {t("(متوفر:", "(Available:")} {formatNumber(Number(c.quantityInStock))})
                          </option>
                        ))}
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      placeholder={t("الكمية", "Quantity")}
                      value={substituteQty}
                      onChange={(e) => setSubstituteQty(e.target.value)}
                      className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <input
                      placeholder={t("السبب", "Reason")}
                      value={substituteReason}
                      onChange={(e) => setSubstituteReason(e.target.value)}
                      className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => handleSubstitute(row.itemId)}
                      className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                    >
                      {t("حفظ", "Save")}
                    </button>
                    <button onClick={() => setSubstitutingFor(null)} className="text-xs text-slate-400">
                      {t("إلغاء", "Cancel")}
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
