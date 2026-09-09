import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ReportColumn, ReportRow } from "./report-export.service";
import { ReportPayload } from "./patient-reports.service";

@Injectable()
export class OperationalReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async stockMovements(from: string, to: string, itemId?: string): Promise<ReportPayload> {
    const movements = await this.prisma.stockMovement.findMany({
      where: {
        createdAt: { gte: new Date(from), lte: new Date(`${to}T23:59:59.999Z`) },
        ...(itemId ? { itemId } : {}),
      },
      include: { item: true, fromLocation: true, toLocation: true, performedBy: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });

    const rows: ReportRow[] = movements.map((m) => ({
      date: m.createdAt.toISOString(),
      item: m.item.name,
      movementType: m.movementType,
      quantity: Number(m.quantity),
      from: m.fromLocation?.name ?? "",
      to: m.toLocation?.name ?? "",
      performedBy: m.performedBy.fullName,
      reason: m.reason ?? "",
    }));

    const columns: ReportColumn[] = [
      { key: "date", header: "التاريخ" },
      { key: "item", header: "الصنف", width: 2 },
      { key: "movementType", header: "نوع الحركة" },
      { key: "quantity", header: "الكمية" },
      { key: "from", header: "من" },
      { key: "to", header: "إلى" },
      { key: "performedBy", header: "بواسطة" },
      { key: "reason", header: "السبب", width: 2 },
    ];

    return { columns, rows, json: movements };
  }

  // Acceptance criterion 4: must match the actual sum of Phase 10 dispense
  // movements for the month - grouped straight off PrescriptionDispense,
  // the same table pharmacy.service.ts's dispense() writes to.
  async drugConsumption(month: string): Promise<ReportPayload> {
    const [year, monthNum] = month.split("-").map(Number);
    const monthStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const monthEnd = new Date(Date.UTC(year, monthNum, 1));

    const grouped = await this.prisma.prescriptionDispense.groupBy({
      by: ["itemId"],
      where: { dispensedAt: { gte: monthStart, lt: monthEnd } },
      _sum: { quantity: true },
      _count: { _all: true },
    });

    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: grouped.map((g) => g.itemId) } },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    const rows: ReportRow[] = grouped
      .map((g) => {
        const item = itemById.get(g.itemId);
        return {
          item: item?.name ?? g.itemId,
          category: item?.category ?? "",
          unit: item?.unit ?? "",
          totalQuantity: Number(g._sum.quantity ?? 0),
          dispenseCount: g._count._all,
        };
      })
      .sort((a, b) => b.totalQuantity - a.totalQuantity);

    const columns: ReportColumn[] = [
      { key: "item", header: "الدواء", width: 2 },
      { key: "category", header: "الفئة" },
      { key: "unit", header: "الوحدة" },
      { key: "totalQuantity", header: "الكمية الإجمالية" },
      { key: "dispenseCount", header: "عدد مرات الصرف" },
    ];

    return { columns, rows, json: { month, rows } };
  }

  async labVolume(from: string, to: string): Promise<ReportPayload> {
    const items = await this.prisma.labOrderItem.findMany({
      where: { createdAt: { gte: new Date(from), lte: new Date(`${to}T23:59:59.999Z`) } },
      include: { labTest: true, results: { where: { isFinal: true }, orderBy: { createdAt: "asc" }, take: 1 } },
    });

    const rows: ReportRow[] = items.map((i) => {
      const finalResult = i.results[0];
      const turnaroundHours = finalResult
        ? Number(((finalResult.createdAt.getTime() - i.createdAt.getTime()) / 3_600_000).toFixed(2))
        : null;
      return {
        testName: i.labTest.name,
        orderedAt: i.createdAt.toISOString(),
        status: i.status,
        turnaroundHours,
      };
    });

    const byTest = new Map<string, { testName: string; count: number; totalTurnaround: number; withResult: number }>();
    for (const r of rows) {
      const entry = byTest.get(r.testName as string) ?? { testName: r.testName as string, count: 0, totalTurnaround: 0, withResult: 0 };
      entry.count += 1;
      if (typeof r.turnaroundHours === "number") {
        entry.totalTurnaround += r.turnaroundHours;
        entry.withResult += 1;
      }
      byTest.set(r.testName as string, entry);
    }

    const summaryRows: ReportRow[] = [...byTest.values()].map((e) => ({
      testName: e.testName,
      orderCount: e.count,
      avgTurnaroundHours: e.withResult > 0 ? Number((e.totalTurnaround / e.withResult).toFixed(2)) : null,
    }));

    const columns: ReportColumn[] = [
      { key: "testName", header: "الفحص", width: 2 },
      { key: "orderCount", header: "عدد الطلبات" },
      { key: "avgTurnaroundHours", header: "متوسط زمن الإنجاز (ساعة)" },
    ];

    return { columns, rows: summaryRows, json: { details: rows, summary: summaryRows } };
  }
}
