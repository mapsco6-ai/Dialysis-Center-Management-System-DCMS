"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useCurrentUser } from "@/lib/useCurrentUser";
import { useLiveUpdates, LiveUpdateEntity } from "@/lib/useLiveUpdates";
import { AdminShell } from "@/components/AdminShell";
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

const machineStatusLabel: Record<MachineStatus, string> = {
  AVAILABLE: "متاح",
  IN_USE: "قيد الاستخدام",
  RESERVED: "محجوز",
  EMERGENCY_RESERVED: "محجوز للطوارئ",
  APPROVAL_REQUIRED: "بانتظار الموافقة",
  WAITING_CLEANING: "بانتظار التعقيم",
  CLEANING: "قيد التعقيم",
  MAINTENANCE: "صيانة",
  OUT_OF_SERVICE: "خارج الخدمة",
};

// Slow safety-net poll - the WebSocket push (useLiveUpdates) is what makes
// this feel live in practice; this interval just covers a socket that never
// connected or dropped silently (docs/PROJECT-PHASES-PLAN.md Phase 13).
const FALLBACK_POLL_MS = 30000;

export default function AdminPage() {
  const user = useCurrentUser();

  if (!user) {
    return <main className="p-8 text-slate-500">جاري التحميل...</main>;
  }

  return (
    <AdminShell user={user}>
      <h1 className="text-xl font-semibold text-slate-800">لوحة المركز الحية</h1>
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
  const toneClass =
    tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : tone === "emerald" ? "text-emerald-600" : "text-slate-800";
  return (
    <div className="rounded-md bg-slate-50 p-3 text-center">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}

function WidgetCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function LiveCenterWidget({ user }: { user: AuthenticatedUser }) {
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
    const interval = setInterval(refresh, FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [canView, refresh]);

  useLiveUpdates(
    useCallback(
      (entity: LiveUpdateEntity) => {
        if (canView && (entity === "session" || entity === "schedule")) refresh();
      },
      [canView, refresh],
    ),
  );

  if (!canView) return null;

  return (
    <WidgetCard title="مركز اليوم الحي">
      {!data ? (
        <p className="text-sm text-slate-400">جاري التحميل...</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <Tile label="مجدول" value={data.scheduled} />
          <Tile label="وصل" value={data.arrived} />
          <Tile label="متأخر" value={data.late} tone="amber" />
          <Tile label="غائب" value={data.absent} tone="red" />
          <Tile label="بالانتظار" value={data.waiting} />
          <Tile label="قيد الديلزة" value={data.inDialysis} tone="emerald" />
          <Tile label="مكتمل" value={data.completed} />
          <Tile label="طوارئ" value={data.emergency} tone="red" />
        </div>
      )}
    </WidgetCard>
  );
}

function MachinesWidget({ user }: { user: AuthenticatedUser }) {
  const canView = user.permissions.includes("machine.view");
  const [data, setData] = useState<MachinesDashboardSummary | null>(null);

  const refresh = useCallback(() => {
    apiFetch("/dashboard/machines").then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => {
    if (!canView) return;
    refresh();
    const interval = setInterval(refresh, FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [canView, refresh]);

  useLiveUpdates(
    useCallback(
      (entity: LiveUpdateEntity) => {
        if (canView && entity === "machine") refresh();
      },
      [canView, refresh],
    ),
  );

  if (!canView) return null;

  return (
    <WidgetCard title="الأجهزة الحية">
      {!data ? (
        <p className="text-sm text-slate-400">جاري التحميل...</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <Tile label="متاح" value={data.byStatus.AVAILABLE ?? 0} tone="emerald" />
            <Tile label="قيد الاستخدام" value={data.byStatus.IN_USE ?? 0} />
            <Tile label="تعقيم" value={(data.byStatus.CLEANING ?? 0) + (data.byStatus.WAITING_CLEANING ?? 0)} tone="amber" />
            <Tile label="صيانة" value={(data.byStatus.MAINTENANCE ?? 0) + (data.byStatus.OUT_OF_SERVICE ?? 0)} tone="red" />
          </div>
          <p className="mt-3 text-xs text-slate-500">
            نسبة الإشغال: <span className="font-medium text-slate-700">{data.utilizationPercent}%</span> — الإجمالي {data.totalMachines}
          </p>
        </>
      )}
    </WidgetCard>
  );
}

function WardsWidget({ user }: { user: AuthenticatedUser }) {
  const canView = user.permissions.includes("nursing.ward.view");
  const [data, setData] = useState<WardDashboardSummary[]>([]);

  const refresh = useCallback(() => {
    apiFetch("/dashboard/wards").then(setData).catch(() => setData([]));
  }, []);

  useEffect(() => {
    if (!canView) return;
    refresh();
    const interval = setInterval(refresh, FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [canView, refresh]);

  useLiveUpdates(
    useCallback(
      (entity: LiveUpdateEntity) => {
        if (canView && entity === "machine") refresh();
      },
      [canView, refresh],
    ),
  );

  if (!canView) return null;

  return (
    <WidgetCard title="خريطة الردهات">
      {data.length === 0 ? (
        <p className="text-sm text-slate-400">لا توجد ردهات بعد</p>
      ) : (
        <ul className="space-y-2">
          {data.map((w) => (
            <li key={w.id} className="flex items-center justify-between text-sm">
              <span className="text-slate-700">{w.name}</span>
              <span className="text-xs text-slate-500">
                {Object.entries(w.byStatus)
                  .map(([status, count]) => `${machineStatusLabel[status as MachineStatus]}: ${count}`)
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
  const canView = user.permissions.includes("inventory.view");
  const [data, setData] = useState<InventoryAlertsSummary | null>(null);

  useEffect(() => {
    if (!canView) return;
    apiFetch("/dashboard/inventory-alerts").then(setData).catch(() => setData(null));
  }, [canView]);

  if (!canView) return null;

  return (
    <WidgetCard title="تنبيهات المخزون">
      {!data ? (
        <p className="text-sm text-slate-400">جاري التحميل...</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <Tile label="منخفض" value={data.lowStockCount} tone="amber" />
          <Tile label="حرج" value={data.criticalStockCount} tone="red" />
          <Tile label="قريب الانتهاء" value={data.expiringSoonCount} tone="amber" />
          <Tile label="منتهي" value={data.expiredCount} tone="red" />
        </div>
      )}
    </WidgetCard>
  );
}

function PendingWorkWidget({ user }: { user: AuthenticatedUser }) {
  const canView = user.permissions.includes("lab.queue.view") || user.permissions.includes("pharmacy.dispense");
  const [data, setData] = useState<PendingWorkSummary | null>(null);

  useEffect(() => {
    if (!canView) return;
    apiFetch("/dashboard/pending-work").then(setData).catch(() => setData(null));
  }, [canView]);

  if (!canView) return null;

  return (
    <WidgetCard title="العمل المعلّق">
      {!data ? (
        <p className="text-sm text-slate-400">جاري التحميل...</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {data.labPending !== null && <Tile label="طلبات المختبر" value={data.labPending} />}
          {data.pharmacyPending !== null && <Tile label="وصفات الصيدلية" value={data.pharmacyPending} />}
        </div>
      )}
    </WidgetCard>
  );
}

function SessionCostWidget({ user }: { user: AuthenticatedUser }) {
  const canView = user.permissions.includes("inventory.view");
  const [data, setData] = useState<SessionCostDashboardSummary | null>(null);

  useEffect(() => {
    if (!canView) return;
    apiFetch("/dashboard/session-cost").then(setData).catch(() => setData(null));
  }, [canView]);

  if (!canView) return null;

  return (
    <WidgetCard title="تكلفة جلسات اليوم">
      {!data ? (
        <p className="text-sm text-slate-400">جاري التحميل...</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Tile label="مستلزمات" value={data.consumablesCost.toFixed(2)} />
          <Tile label="أدوية" value={data.medicationCost.toFixed(2)} />
          <Tile label="مختبر" value={data.labConsumablesCost.toFixed(2)} />
          <div className="col-span-3 mt-1 text-center text-sm text-slate-600">
            الإجمالي: <span className="font-semibold text-slate-800">{data.totalCost.toFixed(2)}</span> ({data.scheduleCount} جلسة)
          </div>
        </div>
      )}
    </WidgetCard>
  );
}
