"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { Button } from "@heroui/react";
import { AdminShell } from "@/components/AdminShell";
import { FilterSelect } from "@/components/FilterSelect";
import { ErrorNote } from "@/components/ErrorNote";
import { StatusBadge } from "@/components/StatusBadge";
import { Machine, MachineStatus, MachineUsageApprovalRequest, Ward } from "@/lib/types";

const GENERIC_STATUSES: MachineStatus[] = ["AVAILABLE", "CLEANING", "WAITING_CLEANING", "MAINTENANCE", "OUT_OF_SERVICE"];

function getLabels(t: (arabic: string, english: string) => string) {
  const statusLabel: Record<MachineStatus, string> = {
    AVAILABLE: t("متاح", "Available"),
    IN_USE: t("قيد الاستخدام", "In use"),
    RESERVED: t("محجوز", "Reserved"),
    EMERGENCY_RESERVED: t("محجوز للطوارئ", "Reserved for emergencies"),
    APPROVAL_REQUIRED: t("بانتظار الموافقة", "Awaiting approval"),
    WAITING_CLEANING: t("بانتظار التعقيم", "Awaiting cleaning"),
    CLEANING: t("قيد التعقيم", "Cleaning"),
    MAINTENANCE: t("صيانة", "Maintenance"),
    OUT_OF_SERVICE: t("خارج الخدمة", "Out of service"),
  };
  return { statusLabel };
}

export default function MachinesPage() {
  const { t } = useI18n();
  const { statusLabel } = getLabels(t);
  const user = useCurrentUser();
  const [wards, setWards] = useState<Ward[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [approvals, setApprovals] = useState<MachineUsageApprovalRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showWardForm, setShowWardForm] = useState(false);
  const [showMachineForm, setShowMachineForm] = useState(false);
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);
  const [statusChoice, setStatusChoice] = useState<MachineStatus>("MAINTENANCE");
  const [statusReason, setStatusReason] = useState("");
  const [decisionReason, setDecisionReason] = useState<Record<string, string>>({});

  function refresh() {
    apiFetch("/wards")
      .then(setWards)
      .catch((err) => setError(err instanceof Error ? err.message : t("تعذر تحميل الردهات", "Unable to load wards")));
    apiFetch("/machines")
      .then(setMachines)
      .catch(() => setMachines([]));
    if (user?.permissions.includes("machine.assign") || user?.permissions.includes("approval.machine.decide")) {
      apiFetch("/machine-approvals?decision=PENDING")
        .then(setApprovals)
        .catch(() => setApprovals([]));
    }
  }

  useEffect(() => {
    if (!user) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useLiveEvents((event) => {
    if (event.entity === "machine") refresh();
  });

  async function handleCreateWard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/wards", { method: "POST", body: JSON.stringify({ name: form.get("name") }) });
      setShowWardForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إضافة الردهة", "Unable to add the ward"));
    }
  }

  async function handleCreateMachine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/machines", {
        method: "POST",
        body: JSON.stringify({
          machineCode: form.get("machineCode"),
          wardId: form.get("wardId"),
          serialNumber: form.get("serialNumber") || undefined,
          manufacturer: form.get("manufacturer") || undefined,
          model: form.get("model") || undefined,
          isProtected: form.get("isProtected") === "on",
          isEmergencyDedicated: form.get("isEmergencyDedicated") === "on",
        }),
      });
      setShowMachineForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر إضافة الجهاز", "Unable to add the machine"));
    }
  }

  async function handleChangeStatus(machineId: string) {
    if (!statusReason.trim()) {
      setError(t("أدخل سبب تغيير الحالة", "Enter a reason for the status change"));
      return;
    }
    setError(null);
    try {
      await apiFetch(`/machines/${machineId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusChoice, reason: statusReason.trim() }),
      });
      setChangingStatusId(null);
      setStatusReason("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر تغيير حالة الجهاز", "Unable to change the machine status"));
    }
  }

  async function handleDecision(approvalId: string, decision: "APPROVED" | "REJECTED") {
    setError(null);
    try {
      await apiFetch(`/machine-approvals/${approvalId}`, {
        method: "PATCH",
        body: JSON.stringify({ decision, reason: decisionReason[approvalId]?.trim() || undefined }),
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("تعذر تسجيل القرار", "Unable to record the decision"));
    }
  }

  if (!user) {
    return <main className="p-8 text-muted">{t("جاري التحميل...", "Loading...")}</main>;
  }

  const machinesByWard = machines.reduce<Record<string, Machine[]>>((acc, m) => {
    (acc[m.wardId] ??= []).push(m);
    return acc;
  }, {});

  return (
    <AdminShell user={user}>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground">{t("الردهات والأجهزة", "Wards & machines")}</h1>
        {user.permissions.includes("machine.manage") && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onPress={() => setShowWardForm((v) => !v)}>
              {t("+ ردهة", "+ Add ward")}
            </Button>
            <Button size="sm" variant="primary" onPress={() => setShowMachineForm((v) => !v)}>
              {t("+ جهاز", "+ Add machine")}
            </Button>
          </div>
        )}
      </div>

      <ErrorNote message={error} className="mt-4" />

      {showWardForm && (
        <form onSubmit={handleCreateWard} className="mt-4 max-w-sm space-y-2 rounded-lg border border-border bg-surface p-4">
          <input name="name" required placeholder={t("اسم الردهة", "Ward name")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground ">
            {t("حفظ", "Save")}
          </button>
        </form>
      )}

      {showMachineForm && (
        <form onSubmit={handleCreateMachine} className="mt-4 max-w-lg space-y-2 rounded-lg border border-border bg-surface p-4">
          <input name="machineCode" required placeholder={t("رمز الجهاز", "Machine code")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
          <FilterSelect
            name="wardId"
            required
            className="w-full"
            aria-label={t("الردهة", "Ward")}
            placeholder={t("اختر الردهة...", "Select a ward...")}
            options={wards.map((w) => ({ id: w.id, label: w.name }))}
          />
          <input name="serialNumber" placeholder={t("الرقم التسلسلي", "Serial number")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
          <input name="manufacturer" placeholder={t("الشركة المصنعة", "Manufacturer")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
          <input name="model" placeholder={t("الموديل", "Model")} className="w-full rounded-md border border-border px-3 py-1.5 text-sm" />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="isProtected" /> {t("يتطلب Approval قبل الاستخدام الاعتيادي", "Requires approval before routine use")}
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="isEmergencyDedicated" /> {t("مخصص للطوارئ دائماً", "Permanently reserved for emergencies")}
          </label>
          <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground ">
            {t("حفظ", "Save")}
          </button>
        </form>
      )}

      {(user.permissions.includes("machine.assign") || user.permissions.includes("approval.machine.decide")) && (
        <section className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted">{t("طلبات موافقة معلّقة", "Pending approval requests")}</h2>
          {approvals.length === 0 ? (
            <p className="text-sm text-muted">{t("لا توجد طلبات معلّقة", "No pending requests")}</p>
          ) : (
            <ul className="space-y-2">
              {approvals.map((a) => (
                <li key={a.id} className="rounded-md border border-border p-3 text-sm">
                  <div>
                    <span className="font-medium text-foreground">{a.patient?.fullName}</span>{" "}
                    <span className="text-muted">{t("— جهاز", "— Machine")} {a.machine?.machineCode}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted">{t("السبب:", "Reason:")} {a.reason}</div>
                  {user.permissions.includes("approval.machine.decide") && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        placeholder={t("سبب القرار (اختياري)", "Decision reason (optional)")}
                        value={decisionReason[a.id] ?? ""}
                        onChange={(e) => setDecisionReason((prev) => ({ ...prev, [a.id]: e.target.value }))}
                        className="w-48 rounded-md border border-border px-2 py-1 text-xs"
                      />
                      <Button size="sm" variant="primary" onPress={() => handleDecision(a.id, "APPROVED")}>
                        {t("موافقة", "Approve")}
                      </Button>
                      <Button size="sm" variant="danger" onPress={() => handleDecision(a.id, "REJECTED")}>
                        {t("رفض", "Reject")}
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="mt-6 space-y-6">
        {wards.map((ward) => (
          <section key={ward.id} className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="border-b border-border bg-surface-secondary px-4 py-2 text-sm font-semibold text-muted">
              {ward.name}
            </div>
            <table className="w-full text-start text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">{t("الجهاز", "Machine")}</th>
                  <th className="px-4 py-2 font-medium">{t("الحالة", "Status")}</th>
                  <th className="px-4 py-2 font-medium">{t("خصائص", "Properties")}</th>
                  <th className="px-4 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {(machinesByWard[ward.id] ?? []).map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="px-4 py-2 text-foreground">{m.machineCode}</td>
                    <td className="px-4 py-2">
                      <StatusBadge group="machine" value={m.status} />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {m.isProtected && <span className="me-2">{t("محمي", "Protected")}</span>}
                      {m.isEmergencyDedicated && <span>{t("مخصص للطوارئ", "Emergency use")}</span>}
                    </td>
                    <td className="px-4 py-2">
                      {user.permissions.includes("machine.manage") && GENERIC_STATUSES.includes(m.status) && (
                        <>
                          {changingStatusId === m.id ? (
                            <div className="flex flex-wrap items-center gap-1">
                              <FilterSelect
                                className="min-w-[10rem]"
                                aria-label={t("الحالة", "Status")}
                                value={statusChoice}
                                onChange={(id) => setStatusChoice(id as MachineStatus)}
                                options={GENERIC_STATUSES.map((s) => ({ id: s, label: statusLabel[s] }))}
                              />
                              <input
                                placeholder={t("السبب", "Reason")}
                                value={statusReason}
                                onChange={(e) => setStatusReason(e.target.value)}
                                className="w-32 rounded-md border border-border px-2 py-1 text-xs"
                              />
                              <button
                                onClick={() => handleChangeStatus(m.id)}
                                className="rounded-md bg-accent px-2 py-1 text-xs text-white"
                              >
                                {t("حفظ", "Save")}
                              </button>
                              <Button size="sm" variant="ghost" onPress={() => setChangingStatusId(null)}>{t("إلغاء", "Cancel")}</Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="ghost" onPress={() => { setChangingStatusId(m.id); setStatusChoice("MAINTENANCE"); setStatusReason(""); }}>
                              {t("تغيير الحالة", "Change status")}
                            </Button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {(machinesByWard[ward.id] ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-muted">
                      {t("لا توجد أجهزة في هذه الردهة", "No machines in this ward")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        ))}
        {wards.length === 0 && <p className="text-sm text-muted">{t("لا توجد ردهات بعد", "No wards yet")}</p>}
      </div>
    </AdminShell>
  );
}
