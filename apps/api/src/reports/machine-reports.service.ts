import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { MaintenanceService } from "../maintenance/maintenance.service";
import { ReportColumn, ReportRow } from "./report-export.service";
import { ReportPayload } from "./patient-reports.service";

@Injectable()
export class MachineReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly maintenanceService: MaintenanceService,
  ) {}

  // Utilization = actual dialysis minutes recorded on this machine's
  // sessions within [from, to], as a share of the window's total minutes -
  // sourced from DialysisSession.actualDurationMinutes (Phase 6), the same
  // number END DIALYSIS itself records, not a separate re-derivation.
  async utilization(from: string, to: string, wardId?: string): Promise<ReportPayload> {
    const fromDate = new Date(from);
    const toDate = new Date(`${to}T23:59:59.999Z`);
    const windowMinutes = Math.max(1, (toDate.getTime() - fromDate.getTime()) / 60000);

    const machines = await this.prisma.machine.findMany({
      where: wardId ? { wardId } : undefined,
      include: { ward: true },
      orderBy: { machineCode: "asc" },
    });

    const sessions = await this.prisma.dialysisSession.findMany({
      where: {
        machineId: { in: machines.map((m) => m.id) },
        schedule: { scheduledDate: { gte: fromDate, lte: toDate } },
      },
      select: { machineId: true, actualDurationMinutes: true },
    });

    const minutesByMachine = new Map<string, { minutes: number; count: number }>();
    for (const s of sessions) {
      if (!s.machineId) continue;
      const entry = minutesByMachine.get(s.machineId) ?? { minutes: 0, count: 0 };
      entry.minutes += s.actualDurationMinutes ?? 0;
      entry.count += 1;
      minutesByMachine.set(s.machineId, entry);
    }

    const rows: ReportRow[] = machines.map((m) => {
      const entry = minutesByMachine.get(m.id) ?? { minutes: 0, count: 0 };
      return {
        machineCode: m.machineCode,
        ward: m.ward.name,
        sessionsCount: entry.count,
        totalMinutes: entry.minutes,
        utilizationPercent: Number(((entry.minutes / windowMinutes) * 100).toFixed(1)),
      };
    });

    const columns: ReportColumn[] = [
      { key: "machineCode", header: "الجهاز" },
      { key: "ward", header: "الردهة" },
      { key: "sessionsCount", header: "عدد الجلسات" },
      { key: "totalMinutes", header: "دقائق الاستخدام" },
      { key: "utilizationPercent", header: "نسبة الإشغال %" },
    ];

    return { columns, rows, json: rows };
  }

  async downtime(machineId: string, from: string, to: string): Promise<ReportPayload> {
    const report = await this.maintenanceService.getDowntimeReport(machineId, from, to);
    const rows: ReportRow[] = report.intervals.map((i) => ({
      start: i.start.toISOString(),
      end: i.end.toISOString(),
      durationHours: Number(((i.end.getTime() - i.start.getTime()) / 3_600_000).toFixed(2)),
    }));

    const columns: ReportColumn[] = [
      { key: "start", header: "بداية التوقف" },
      { key: "end", header: "نهاية التوقف" },
      { key: "durationHours", header: "المدة (ساعة)" },
    ];

    return { columns, rows, json: report };
  }

  async maintenanceHistory(machineId: string): Promise<ReportPayload> {
    const events = await this.maintenanceService.getMachineTimeline(machineId);
    const rows: ReportRow[] = events.map((e) => ({
      timestamp: e.timestamp.toISOString(),
      category: e.category,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      changedBy: e.changedBy.fullName,
      reason: e.reason ?? "",
      source: e.source,
    }));

    const columns: ReportColumn[] = [
      { key: "timestamp", header: "التاريخ" },
      { key: "category", header: "الفئة" },
      { key: "fromStatus", header: "من" },
      { key: "toStatus", header: "إلى" },
      { key: "changedBy", header: "بواسطة" },
      { key: "reason", header: "السبب", width: 2 },
      { key: "source", header: "المصدر" },
    ];

    return { columns, rows, json: events };
  }

  async failureFrequency(from: string, to: string): Promise<ReportPayload> {
    const tickets = await this.prisma.maintenanceTicket.findMany({
      where: { createdAt: { gte: new Date(from), lte: new Date(`${to}T23:59:59.999Z`) } },
      include: { machine: { include: { ward: true } } },
    });

    const byMachine = new Map<
      string,
      { machineCode: string; ward: string; total: number; low: number; medium: number; high: number; critical: number }
    >();
    for (const t of tickets) {
      const entry = byMachine.get(t.machineId) ?? {
        machineCode: t.machine.machineCode,
        ward: t.machine.ward.name,
        total: 0,
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };
      entry.total += 1;
      if (t.severity === "LOW") entry.low += 1;
      if (t.severity === "MEDIUM") entry.medium += 1;
      if (t.severity === "HIGH") entry.high += 1;
      if (t.severity === "CRITICAL") entry.critical += 1;
      byMachine.set(t.machineId, entry);
    }

    const rows = [...byMachine.values()].sort((a, b) => b.total - a.total) as unknown as ReportRow[];

    const columns: ReportColumn[] = [
      { key: "machineCode", header: "الجهاز" },
      { key: "ward", header: "الردهة" },
      { key: "total", header: "إجمالي الأعطال" },
      { key: "low", header: "منخفضة" },
      { key: "medium", header: "متوسطة" },
      { key: "high", header: "عالية" },
      { key: "critical", header: "حرجة" },
    ];

    return { columns, rows, json: rows };
  }
}
