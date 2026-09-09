import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryBatchesService } from "./inventory-batches.service";

interface ItemConsumptionRow {
  item: { id: string; name: string; category: string; cost: Prisma.Decimal };
  quantity: number;
}

// The read-only side of Phase 11: alerts and the underlying calculations the
// docs ask for (docs/PROJECT-PHASES-PLAN.md: "لا يشمل: التقارير النهائية
// المعروضة (فيز 14) - هنا فقط البيانات والحسابات الأساسية"). No new
// persisted state - everything here is derived from StockBalance/
// InventoryBatch/StockMovement/SessionSupplyIssueItem/PrescriptionDispense,
// which already exist.
@Injectable()
export class WarehouseAnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly batchesService: InventoryBatchesService,
  ) {}

  // Low/Critical Stock (docs/PROJECT-PHASES-PLAN.md Phase 11 acceptance
  // criterion 2). "Available" is summed across every location - Phase 11's
  // whole point is a multi-location view, not just MAIN_WAREHOUSE. The docs
  // name "Low Stock" and "Critical Stock" without ever giving Critical a
  // separate numeric definition beyond "قريب من Minimum Stock" for Low; half
  // of minimumStock is this implementation's documented interim threshold
  // for the stricter tier, adjustable in one place if the center specifies
  // something else later.
  async getLowStockAlerts() {
    const items = await this.prisma.inventoryItem.findMany({ include: { balances: true } });
    return items
      .map((item) => {
        const available = item.balances.reduce((sum, b) => sum + Number(b.quantity), 0);
        const minimumStock = Number(item.minimumStock);
        if (minimumStock <= 0) return null;
        if (available <= minimumStock / 2) {
          return { itemId: item.id, itemName: item.name, available, minimumStock, level: "CRITICAL" as const };
        }
        if (available <= minimumStock) {
          return { itemId: item.id, itemName: item.name, available, minimumStock, level: "LOW" as const };
        }
        return null;
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);
  }

  // Expired / Expiring Soon (docs/PROJECT-PHASES-PLAN.md Phase 11 acceptance
  // criterion 3). withinDays is this implementation's documented default
  // "specified window" (30 days) - the docs don't name an exact value.
  async getExpiryAlerts(withinDays = 30) {
    return this.batchesService.listExpiryAlerts(withinDays);
  }

  // Days of Stock Remaining = Available / Average Daily Consumption (docs/
  // PROJECT-PHASES-PLAN.md Phase 11 acceptance criterion 4). Average Daily
  // Consumption is computed from real ISSUE movements over a trailing
  // window (30 days by default) - not a guess, and null (not 0 or Infinity)
  // when there's no consumption history yet to divide by.
  async getDaysOfStockRemaining(itemId: string, lookbackDays = 30) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id: itemId }, include: { balances: true } });
    if (!item) {
      throw new NotFoundException("Inventory item not found");
    }
    const available = item.balances.reduce((sum, b) => sum + Number(b.quantity), 0);

    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);
    const consumedAgg = await this.prisma.stockMovement.aggregate({
      where: { itemId, movementType: "ISSUE", createdAt: { gte: since } },
      _sum: { quantity: true },
    });
    const totalConsumed = Number(consumedAgg._sum.quantity ?? 0);
    const averageDailyConsumption = totalConsumed / lookbackDays;

    return {
      itemId,
      itemName: item.name,
      available,
      lookbackDays,
      totalConsumed,
      averageDailyConsumption,
      daysOfStockRemaining: averageDailyConsumption > 0 ? available / averageDailyConsumption : null,
    };
  }

  private groupByItem(rows: ItemConsumptionRow[]) {
    const map = new Map<string, { itemId: string; name: string; category: string; totalQuantity: number; totalCost: number }>();
    for (const row of rows) {
      const existing = map.get(row.item.id) ?? {
        itemId: row.item.id,
        name: row.item.name,
        category: row.item.category,
        totalQuantity: 0,
        totalCost: 0,
      };
      existing.totalQuantity += row.quantity;
      existing.totalCost += row.quantity * Number(row.item.cost);
      map.set(row.item.id, existing);
    }
    return [...map.values()];
  }

  // Patient Consumption Report for one calendar month (docs/PROJECT-PHASES-
  // PLAN.md Phase 11 acceptance criterion 5): Dialyzers/Blood Lines/Needles
  // (SessionSupplyIssueItem, scoped by the session's scheduledDate falling
  // in that month) and Medication (PrescriptionDispense, scoped by
  // dispensedAt) - both tables are exactly what already creates the
  // matching StockMovement rows, so this is precisely "مجموع الحركات
  // الفعلية المرتبطة بجلساته", not a separate derived estimate.
  async getPatientConsumptionReport(patientId: string, month: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }
    const [year, monthNum] = month.split("-").map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 1));

    const supplyItems = await this.prisma.sessionSupplyIssueItem.findMany({
      where: {
        status: { in: ["ISSUED", "SUBSTITUTED"] },
        schedule: { patientId, scheduledDate: { gte: monthStart, lt: monthEnd } },
      },
      include: { item: true },
    });
    const consumables = this.groupByItem(
      supplyItems.map((s) => ({ item: s.item, quantity: Number(s.quantityIssued) })),
    );

    const dispenses = await this.prisma.prescriptionDispense.findMany({
      where: { prescription: { patientId }, dispensedAt: { gte: monthStart, lt: monthEnd } },
      include: { item: true },
    });
    const medication = this.groupByItem(dispenses.map((d) => ({ item: d.item, quantity: Number(d.quantity) })));

    return { patientId, month, consumables, medication };
  }

  // Session Cost = Consumables + Medication + Lab Consumables actually
  // linked to it (docs/PROJECT-PHASES-PLAN.md Phase 11 acceptance criterion
  // 6). Consumables key off scheduleId (SessionSupplyIssueItem's own FK);
  // Medication and Lab Consumables key off the DialysisSession's own id via
  // Prescription/LabOrder's linkedSessionId - a session with no linked
  // dispense or lab order simply contributes 0 to those two, not an error.
  async getSessionCost(scheduleId: string) {
    const schedule = await this.prisma.dialysisSchedule.findUnique({
      where: { id: scheduleId },
      include: { session: true },
    });
    if (!schedule) {
      throw new NotFoundException("Schedule entry not found");
    }

    const supplyItems = await this.prisma.sessionSupplyIssueItem.findMany({
      where: { scheduleId, status: { in: ["ISSUED", "SUBSTITUTED"] } },
      include: { item: true },
    });
    const consumablesCost = supplyItems.reduce(
      (sum, s) => sum + Number(s.quantityIssued) * Number(s.item.cost),
      0,
    );

    let medicationCost = 0;
    let labConsumablesCost = 0;
    if (schedule.session) {
      const dispenses = await this.prisma.prescriptionDispense.findMany({
        where: { linkedSessionId: schedule.session.id },
        include: { item: true },
      });
      medicationCost = dispenses.reduce((sum, d) => sum + Number(d.quantity) * Number(d.item.cost), 0);

      const labMovements = await this.prisma.stockMovement.findMany({
        where: { relatedLabOrderItem: { labOrder: { linkedSessionId: schedule.session.id } } },
        include: { item: true },
      });
      labConsumablesCost = labMovements.reduce((sum, m) => sum + Number(m.quantity) * Number(m.item.cost), 0);
    }

    return {
      scheduleId,
      sessionId: schedule.session?.id ?? null,
      consumablesCost,
      medicationCost,
      labConsumablesCost,
      totalCost: consumablesCost + medicationCost + labConsumablesCost,
    };
  }
}
