"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { Button, Card } from "@heroui/react";
import { AdminShell } from "@/components/AdminShell";
import { ErrorNote } from "@/components/ErrorNote";
import { StatusBadge } from "@/components/StatusBadge";
import { SessionSuppliesResponse } from "@/lib/types";

export default function SessionSuppliesPage() {
  const { t, formatNumber } = useI18n();
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
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  if (error && !data) {
    return <main className="p-8 text-danger">{error}</main>;
  }

  if (!data) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-foreground">{t("مستلزمات الجلسة", "Session supplies")}</h1>

      <ErrorNote message={error} className="mt-4" />

      <Card className="mt-4 border border-border bg-surface shadow-none">
        <Card.Header><Card.Title className="text-sm font-semibold text-muted">{t("بانتظار التأكيد", "Awaiting confirmation")}</Card.Title></Card.Header>
        <Card.Content>
        {data.pending.length === 0 ? (
          <p className="text-sm text-muted">{t("لا توجد مواد بانتظار الصرف", "No items awaiting issue")}</p>
        ) : (
          <ul className="space-y-1">
            {data.pending.map((line) => (
              <li key={line.itemId} className="flex items-center justify-between text-sm">
                <span>
                  {line.item.name} &times; {formatNumber(Number(line.quantity))} {line.item.unit}
                  {line.isOverridden && <span className="ms-2 text-xs text-warning">{t("(معدّلة لهذه الجلسة)", "(Adjusted for this session)")}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}

        {user.permissions.includes("inventory.issue") && data.pending.length > 0 && (
          <Button className="mt-4" size="sm" variant="primary" isDisabled={busy} onPress={handleConfirmIssue}>
            {busy ? t("جاري التأكيد...", "Confirming...") : t("تأكيد الصرف (Confirm Issue)", "Confirm issue")}
          </Button>
        )}
      </Card.Content>
      </Card>

      <Card className="mt-4 border border-border bg-surface shadow-none">
        <Card.Header><Card.Title className="text-sm font-semibold text-muted">{t("ما تم صرفه فعلياً", "Items issued")}</Card.Title></Card.Header>
        <Card.Content>
        {data.issued.length === 0 ? (
          <p className="text-sm text-muted">{t("لا يوجد شيء مصروف بعد", "No items issued yet")}</p>
        ) : (
          <ul className="space-y-2">
            {data.issued.map((row) => (
              <li key={row.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>
                    <StatusBadge group="supplyIssue" value={row.status} />{" "}
                    {row.item.name} &times; {formatNumber(Number(row.quantityIssued))} {row.item.unit}
                    {row.substituteForItem && (
                      <span className="text-xs text-muted"> {t("(بديل عن", "(Substitute for")} {row.substituteForItem.name})</span>
                    )}
                  </span>
                  {row.status === "UNAVAILABLE" && user.permissions.includes("inventory.issue") && (
                    <Button size="sm" variant="ghost" onPress={() => setSubstitutingFor(row.itemId)}>
                      {t("اختيار بديل", "Choose substitute")}
                    </Button>
                  )}
                </div>

                {substitutingFor === row.itemId && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md bg-surface-secondary p-2">
                    <select
                      value={substituteItemId}
                      onChange={(e) => setSubstituteItemId(e.target.value)}
                      className="rounded-md border border-border px-2 py-1 text-xs"
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
                      className="w-20 rounded-md border border-border px-2 py-1 text-xs"
                    />
                    <input
                      placeholder={t("السبب", "Reason")}
                      value={substituteReason}
                      onChange={(e) => setSubstituteReason(e.target.value)}
                      className="w-40 rounded-md border border-border px-2 py-1 text-xs"
                    />
                    <button
                      onClick={() => handleSubstitute(row.itemId)}
                      className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                    >
                      {t("حفظ", "Save")}
                    </button>
                    <Button size="sm" variant="ghost" onPress={() => setSubstitutingFor(null)}>{t("إلغاء", "Cancel")}</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
      </Card>
    </AdminShell>
  );
}
