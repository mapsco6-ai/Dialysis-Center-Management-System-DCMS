import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MachinesService } from "../machines/machines.service";
import { WarehouseAnalyticsService } from "../inventory/warehouse-analytics.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { toDateOnly, todayDateOnly } from "../scheduling/date.util";

// Phase 13 is explicitly consumption-only (docs/MODULES-SPEC.md: "لا كيانات
// جديدة ... Views/Queries مجمّعة فوق الكيانات الموجودة") - every method here
// is a live aggregation query against tables Phases 1-12 already write to,
// never a cached/duplicated copy. Each widget is its own method (and its
// own controller route + permission) rather than one giant payload, so a
// limited-permission user's request for a widget they can't see is a plain
// 403 at the route level - not a value silently filtered out after the
// query already ran (docs/PROJECT-PHASES-PLAN.md Phase 13 acceptance
// criterion 5).
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly machinesService: MachinesService,
    private readonly warehouseAnalyticsService: WarehouseAnalyticsService,
  ) {}

  // Live Center: Scheduled/Arrived/Late/Absent/Cancelled (DialysisSchedule.
  // status), Emergency (DialysisSchedule.type - status never actually holds
  // "EMERGENCY" anywhere in this codebase, only type does), and Waiting/In
  // Dialysis/Completed (DialysisSession.status, joined through the same
  // day's schedules) - docs/PROJECT-PHASES-PLAN.md Phase 13 acceptance
  // criteria 1 and 3.
  async getLiveCenter(dateStr?: string, shiftId?: string) {
    const date = dateStr ? toDateOnly(dateStr) : todayDateOnly();
    const scheduleWhere = { scheduledDate: date, ...(shiftId ? { shiftId } : {}) };

    const [scheduleGroups, emergencyCount, sessionGroups] = await Promise.all([
      this.prisma.dialysisSchedule.groupBy({ by: ["status"], where: scheduleWhere, _count: { _all: true } }),
      this.prisma.dialysisSchedule.count({ where: { ...scheduleWhere, type: "EMERGENCY" } }),
      this.prisma.dialysisSession.groupBy({
        by: ["status"],
        where: { schedule: scheduleWhere },
        _count: { _all: true },
      }),
    ]);

    const scheduleCounts: Record<string, number> = {};
    for (const g of scheduleGroups) scheduleCounts[g.status] = g._count._all;
    const sessionCounts: Record<string, number> = {};
    for (const g of sessionGroups) sessionCounts[g.status] = g._count._all;

    const waiting =
      (sessionCounts.PRE_DIALYSIS ?? 0) +
      (sessionCounts.SUPPLIES_READY ?? 0) +
      (sessionCounts.WAITING_MACHINE ?? 0) +
      (sessionCounts.ASSIGNED ?? 0);

    return {
      date: date.toISOString().slice(0, 10),
      shiftId: shiftId ?? null,
      scheduled: scheduleCounts.SCHEDULED ?? 0,
      arrived: scheduleCounts.ARRIVED ?? 0,
      late: scheduleCounts.LATE ?? 0,
      absent: scheduleCounts.ABSENT ?? 0,
      cancelled: scheduleCounts.CANCELLED ?? 0,
      emergency: emergencyCount,
      waiting,
      inDialysis: sessionCounts.IN_DIALYSIS ?? 0,
      completed: (sessionCounts.COMPLETED ?? 0) + (sessionCounts.DISCHARGED ?? 0),
    };
  }

  // Live Machines: reuses Phase 5's own capacity snapshot as-is (same
  // numbers the /machines/capacity route already returns) and adds a
  // dashboard-specific utilization figure on top rather than recomputing
  // the underlying counts a second way.
  async getMachinesSummary() {
    const snapshot = await this.machinesService.getCapacitySnapshot();
    const inUse = snapshot.byStatus.IN_USE ?? 0;
    const utilizationPercent =
      snapshot.totalMachines > 0 ? Math.round((inUse / snapshot.totalMachines) * 1000) / 10 : 0;
    return { ...snapshot, utilizationPercent };
  }

  // Ward Dashboard summary: a per-ward machine-status count only (no
  // patient identity at all) - the full per-patient card view with its
  // established Permission Filter (nursing.ward.view vs .view.all) already
  // exists at GET /wards/:id/dashboard (Phase 7); this is the cross-ward
  // overview a manager scans before drilling into one ward.
  async getWardsSummary() {
    const [wards, machineGroups] = await Promise.all([
      this.prisma.ward.findMany({ orderBy: { name: "asc" } }),
      this.prisma.machine.groupBy({ by: ["wardId", "status"], _count: { _all: true } }),
    ]);
    const byWard = new Map<string, Record<string, number>>();
    for (const g of machineGroups) {
      const bucket = byWard.get(g.wardId) ?? {};
      bucket[g.status] = g._count._all;
      byWard.set(g.wardId, bucket);
    }
    return wards.map((w) => ({ id: w.id, name: w.name, byStatus: byWard.get(w.id) ?? {} }));
  }

  // Low/Critical Stock + Expired/Expiring Soon counts, straight from
  // Phase 11's own alert queries (docs/PROJECT-PHASES-PLAN.md Phase 13
  // acceptance criterion 4) - a compact tile; the full lists are still
  // available at their own Phase 11 routes for anyone who drills in.
  async getInventoryAlertsSummary() {
    const [lowStock, expiry] = await Promise.all([
      this.warehouseAnalyticsService.getLowStockAlerts(),
      this.warehouseAnalyticsService.getExpiryAlerts(),
    ]);
    return {
      lowStockCount: lowStock.filter((a) => a.level === "LOW").length,
      criticalStockCount: lowStock.filter((a) => a.level === "CRITICAL").length,
      expiringSoonCount: expiry.expiringSoon.length,
      expiredCount: expiry.expired.length,
    };
  }

  // Lab/Pharmacy Pending: one endpoint for both since the docs group them
  // together, but each count is only computed - not just hidden - when the
  // actor actually holds that queue's own permission, so a Reception user
  // calling this never has pharmacy/lab volume in the response body at all
  // (docs/PROJECT-PHASES-PLAN.md Phase 13 acceptance criterion 5).
  async getPendingWork(actor: AuthenticatedUser) {
    const [labPending, pharmacyPending] = await Promise.all([
      actor.permissions.includes("lab.queue.view")
        ? this.prisma.labOrderItem.count({ where: { status: { notIn: ["FINAL", "AMENDED", "CANCELLED"] } } })
        : Promise.resolve(null),
      actor.permissions.includes("pharmacy.dispense")
        ? this.prisma.prescription.count({ where: { status: { in: ["ACTIVE", "DISPENSING"] } } })
        : Promise.resolve(null),
    ]);
    return { labPending, pharmacyPending };
  }

  // Today's total Session Cost so far, summed from Phase 11's own
  // per-session calculation. One query per schedule - fine for a single
  // day's roster (tens of rows), not benchmarked beyond that (same
  // measured-vs-assumed caveat as DCMS-065).
  async getSessionCostSummary(dateStr?: string) {
    const date = dateStr ? toDateOnly(dateStr) : todayDateOnly();
    const schedules = await this.prisma.dialysisSchedule.findMany({
      where: { scheduledDate: date },
      select: { id: true },
    });

    let totalCost = 0;
    let consumablesCost = 0;
    let medicationCost = 0;
    let labConsumablesCost = 0;
    for (const schedule of schedules) {
      const cost = await this.warehouseAnalyticsService.getSessionCost(schedule.id);
      totalCost += cost.totalCost;
      consumablesCost += cost.consumablesCost;
      medicationCost += cost.medicationCost;
      labConsumablesCost += cost.labConsumablesCost;
    }

    return {
      date: date.toISOString().slice(0, 10),
      scheduleCount: schedules.length,
      totalCost,
      consumablesCost,
      medicationCost,
      labConsumablesCost,
    };
  }
}
