"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@heroui/react";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLiveEvents } from "@/lib/useLiveEvents";
import { AdminShell } from "@/components/AdminShell";
import { WorkQueue } from "@/components/WorkQueue";
import {
  AuthenticatedUser,
  InventoryAlertsSummary,
  LiveCenterSummary,
  MachineStatus,
  MachinesDashboardSummary,
  PendingWorkSummary,
  SessionCostDashboardSummary,
  WardDashboardSummary,
} from "@/lib/types";

export default function AdminPage() {
  const { t } = useI18n();
  const user = useCurrentUser();

  if (!user) {
    return <main className="p-8 text-slate-500">{t("جاري التحميل...", "Loading...")}</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">{t("لوحة المركز الحية", "Center overview")}</h1>
      <p className="mt-1 text-sm text-muted">
        {t("متابعة جلسات اليوم، جاهزية الأجهزة، واحتياجات فرق الرعاية.", "Today’s sessions, machine availability, and care team priorities.")}
      </p>
      <WorkQueue />
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <LiveCenterWidget user={user} />
        <MachinesWidget user={user} />
        <WardsWidget user={user} />
        <InventoryAlertsWidget user={user} />
        <PendingWorkWidget user={user} />
        <SessionCostWidget user={user} />
      </div>
    </AdminShell>
  );
}

function Tile({ label, value, tone }: { label: string; value: number | string; tone?: "amber" | "red" | "emerald" }) {
  const { formatNumber } = useI18n();
  const toneClass =
    tone === "red" ? "text-danger" : tone === "amber" ? "text-warning" : tone === "emerald" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-lg bg-surface-secondary px-2 py-4 text-center">
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{typeof value === "number" ? formatNumber(value) : value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function WidgetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-4 rounded-xl border border-border bg-surface p-5 shadow-none">
      <Card.Header>
        <Card.Title className="text-sm font-semibold text-foreground">{title}</Card.Title>
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}

function LiveCenterWidget({ user }: { user: AuthenticatedUser }) {
  const { t } = useI18n();
  const canView =
    user.permissions.includes("scheduling.manage") ||
    user.permissions.includes("attendance.checkin") ||
    user.permissions.includes("dialysis.session.view");
  const [data, setData] = useState<LiveCenterSummary | null>(null);

  const refresh = useCallback(() => {
    apiFetch("/dashboard/live-center").then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => {
    if (!canView) return;
    refresh();
  }, [canView, refresh]);

  useLiveEvents(
    useCallback(
      (event) => {
        if (canView && (event.entity === "session" || event.entity === "schedule")) refresh();
      },
      [canView, refresh],
    ),
  );

  if (!canView) return null;

  return (
    <WidgetCard title={t("مركز اليوم الحي", "Today at the center")}>
      {!data ? (
        <p className="text-sm text-slate-400">{t("جاري التحميل...", "Loading...")}</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <Tile label={t("مجدول", "Scheduled")} value={data.scheduled} />
          <Tile label={t("وصل", "Arrived")} value={data.arrived} />
          <Tile label={t("متأخر", "Late")} value={data.late} tone="amber" />
          <Tile label={t("غائب", "Absent")} value={data.absent} tone="red" />
          <Tile label={t("بالانتظار", "Waiting")} value={data.waiting} />
          <Tile label={t("قيد الديلزة", "In dialysis")} value={data.inDialysis} tone="emerald" />
          <Tile label={t("مكتمل", "Completed")} value={data.completed} />
          <Tile label={t("طوارئ", "Emergency")} value={data.emergency} tone="red" />
        </div>
      )}
    </WidgetCard>
  );
}

function MachinesWidget({ user }: { user: AuthenticatedUser }) {
  const { t, formatNumber } = useI18n();
  const canView = user.permissions.includes("machine.view");
  const [data, setData] = useState<MachinesDashboardSummary | null>(null);

  const refresh = useCallback(() => {
    apiFetch("/dashboard/machines").then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => {
    if (!canView) return;
    refresh();
  }, [canView, refresh]);

  useLiveEvents(
    useCallback(
      (event) => {
        if (canView && event.entity === "machine") refresh();
      },
      [canView, refresh],
    ),
  );

  if (!canView) return null;

  return (
    <WidgetCard title={t("الأجهزة الحية", "Machine status")}>
      {!data ? (
        <p className="text-sm text-slate-400">{t("جاري التحميل...", "Loading...")}</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <Tile label={t("متاح", "Available")} value={data.byStatus.AVAILABLE ?? 0} tone="emerald" />
            <Tile label={t("قيد الاستخدام", "In use")} value={data.byStatus.IN_USE ?? 0} />
            <Tile label={t("تعقيم", "Cleaning")} value={(data.byStatus.CLEANING ?? 0) + (data.byStatus.WAITING_CLEANING ?? 0)} tone="amber" />
            <Tile label={t("صيانة", "Maintenance")} value={(data.byStatus.MAINTENANCE ?? 0) + (data.byStatus.OUT_OF_SERVICE ?? 0)} tone="red" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {t("نسبة الإشغال:", "Utilization:")} <span className="font-medium text-slate-700">{formatNumber(data.utilizationPercent / 100, { style: "percent", maximumFractionDigits: 1 })}</span> {t("— الإجمالي", "— Total")} {formatNumber(data.totalMachines)}
          </p>
        </>
      )}
    </WidgetCard>
  );
}

function WardsWidget({ user }: { user: AuthenticatedUser }) {
  const { t, formatNumber } = useI18n();
  const machineStatusLabel: Record<MachineStatus, string> = {
    AVAILABLE: t("متاح", "Available"),
    IN_USE: t("قيد الاستخدام", "In use"),
    RESERVED: t("محجوز", "Reserved"),
    EMERGENCY_RESERVED: t("محجوز للطوارئ", "Emergency reserved"),
    APPROVAL_REQUIRED: t("بانتظار الموافقة", "Awaiting approval"),
    WAITING_CLEANING: t("بانتظار التعقيم", "Awaiting cleaning"),
    CLEANING: t("قيد التعقيم", "Cleaning"),
    MAINTENANCE: t("صيانة", "Maintenance"),
    OUT_OF_SERVICE: t("خارج الخدمة", "Out of service"),
  };

  const canView = user.permissions.includes("nursing.ward.view");
  const [data, setData] = useState<WardDashboardSummary[]>([]);

  const refresh = useCallback(() => {
    apiFetch("/dashboard/wards").then(setData).catch(() => setData([]));
  }, []);

  useEffect(() => {
    if (!canView) return;
    refresh();
  }, [canView, refresh]);

  useLiveEvents(
    useCallback(
      (event) => {
        if (canView && event.entity === "machine") refresh();
      },
      [canView, refresh],
    ),
  );

  if (!canView) return null;

  return (
    <WidgetCard title={t("خريطة الردهات", "Ward overview")}>
      {data.length === 0 ? (
        <p className="text-sm text-slate-400">{t("لا توجد ردهات بعد", "No wards yet")}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((w) => (
            <li key={w.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{w.name}</span>
              <span className="text-xs text-slate-500">
                {Object.entries(w.byStatus)
                  .map(([status, count]) => `${machineStatusLabel[status as MachineStatus]}: ${formatNumber(count)}`)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

function InventoryAlertsWidget({ user }: { user: AuthenticatedUser }) {
  const { t } = useI18n();
  const canView = user.permissions.includes("inventory.view");
  const [data, setData] = useState<InventoryAlertsSummary | null>(null);

  useEffect(() => {
    if (!canView) return;
    apiFetch("/dashboard/inventory-alerts").then(setData).catch(() => setData(null));
  }, [canView]);

  if (!canView) return null;

  return (
    <WidgetCard title={t("تنبيهات المخزون", "Inventory alerts")}>
      {!data ? (
        <p className="text-sm text-slate-400">{t("جاري التحميل...", "Loading...")}</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <Tile label={t("منخفض", "Low stock")} value={data.lowStockCount} tone="amber" />
          <Tile label={t("حرج", "Critical")} value={data.criticalStockCount} tone="red" />
          <Tile label={t("قريب الانتهاء", "Expiring soon")} value={data.expiringSoonCount} tone="amber" />
          <Tile label={t("منتهي", "Expired")} value={data.expiredCount} tone="red" />
        </div>
      )}
    </WidgetCard>
  );
}

function PendingWorkWidget({ user }: { user: AuthenticatedUser }) {
  const { t } = useI18n();
  const canView = user.permissions.includes("lab.queue.view") || user.permissions.includes("pharmacy.dispense");
  const [data, setData] = useState<PendingWorkSummary | null>(null);

  useEffect(() => {
    if (!canView) return;
    apiFetch("/dashboard/pending-work").then(setData).catch(() => setData(null));
  }, [canView]);

  if (!canView) return null;

  return (
    <WidgetCard title={t("العمل المعلّق", "Pending work")}>
      {!data ? (
        <p className="text-sm text-slate-400">{t("جاري التحميل...", "Loading...")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {data.labPending !== null && <Tile label={t("طلبات المختبر", "Lab orders")} value={data.labPending} />}
          {data.pharmacyPending !== null && <Tile label={t("وصفات الصيدلية", "Pharmacy prescriptions")} value={data.pharmacyPending} />}
        </div>
      )}
    </WidgetCard>
  );
}

function SessionCostWidget({ user }: { user: AuthenticatedUser }) {
  const { t, formatNumber } = useI18n();
  const canView = user.permissions.includes("inventory.view");
  const [data, setData] = useState<SessionCostDashboardSummary | null>(null);

  useEffect(() => {
    if (!canView) return;
    apiFetch("/dashboard/session-cost").then(setData).catch(() => setData(null));
  }, [canView]);

  if (!canView) return null;

  return (
    <WidgetCard title={t("تكلفة جلسات اليوم", "Today’s session costs")}>
      {!data ? (
        <p className="text-sm text-slate-400">{t("جاري التحميل...", "Loading...")}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Tile label={t("مستلزمات", "Supplies")} value={formatNumber(data.consumablesCost, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
          <Tile label={t("أدوية", "Medication")} value={formatNumber(data.medicationCost, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
          <Tile label={t("مختبر", "Laboratory")} value={formatNumber(data.labConsumablesCost, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} />
          <div className="col-span-3 mt-1 text-center text-sm text-slate-600">
            {t("الإجمالي:", "Total:")} <span className="font-semibold text-slate-800">{formatNumber(data.totalCost, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> {t(`(${formatNumber(data.scheduleCount)} جلسة)`, `(${formatNumber(data.scheduleCount)} sessions)`)}
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
