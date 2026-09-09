import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ReportColumn, ReportRow } from "./report-export.service";
import { ReportPayload } from "./patient-reports.service";

function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
  return d;
}

@Injectable()
export class DialysisReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // Acceptance criterion 2: must match exactly what is actually in the DB
  // for that day - one row per DialysisSession whose schedule falls on the
  // given date, grouped visually by ward via the row's own ward column
  // (DialysisSession.wardId, not DialysisSchedule - schedules carry no ward
  // reference until a machine is actually assigned).
  async dailySessionsByWard(date: string): Promise<ReportPayload> {
    const day = new Date(`${date}T00:00:00.000Z`);
    const sessions = await this.prisma.dialysisSession.findMany({
      where: { schedule: { scheduledDate: day } },
      include: { schedule: { include: { shift: true } }, patient: true, machine: true, ward: true },
      orderBy: [{ ward: { name: "asc" } }, { schedule: { shift: { name: "asc" } } }],
    });

    const rows: ReportRow[] = sessions.map((s) => ({
      ward: s.ward?.name ?? "غير محدد",
      machineCode: s.machine?.machineCode ?? "",
      shift: s.schedule.shift.name,
      patientCode: s.patient.patientCode,
      patientName: s.patient.fullName,
      status: s.status,
      startTime: s.startTime ? s.startTime.toISOString() : "",
      endTime: s.endTime ? s.endTime.toISOString() : "",
    }));

    const columns: ReportColumn[] = [
      { key: "ward", header: "الردهة" },
      { key: "machineCode", header: "الجهاز" },
      { key: "shift", header: "الوجبة" },
      { key: "patientCode", header: "رقم المريض" },
      { key: "patientName", header: "اسم المريض", width: 2 },
      { key: "status", header: "الحالة" },
      { key: "startTime", header: "بداية" },
      { key: "endTime", header: "نهاية" },
    ];

    return { columns, rows, json: sessions };
  }

  async periodSummary(from: string, to: string, groupBy: "day" | "week" | "month" = "day"): Promise<ReportPayload> {
    const schedules = await this.prisma.dialysisSchedule.findMany({
      where: { scheduledDate: { gte: new Date(from), lte: new Date(`${to}T23:59:59.999Z`) } },
      select: { scheduledDate: true, status: true, type: true },
    });

    const buckets = new Map<
      string,
      { period: string; scheduled: number; arrived: number; late: number; absent: number; emergency: number }
    >();

    for (const s of schedules) {
      const period = this.bucketKey(s.scheduledDate, groupBy);
      const bucket = buckets.get(period) ?? {
        period,
        scheduled: 0,
        arrived: 0,
        late: 0,
        absent: 0,
        emergency: 0,
      };
      bucket.scheduled += 1;
      if (s.status === "ARRIVED") bucket.arrived += 1;
      if (s.status === "LATE") bucket.late += 1;
      if (s.status === "ABSENT") bucket.absent += 1;
      if (s.type === "EMERGENCY") bucket.emergency += 1;
      buckets.set(period, bucket);
    }

    const rows = [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period)) as unknown as ReportRow[];

    const columns: ReportColumn[] = [
      { key: "period", header: "الفترة" },
      { key: "scheduled", header: "مجدول" },
      { key: "arrived", header: "وصل" },
      { key: "late", header: "متأخر" },
      { key: "absent", header: "غائب" },
      { key: "emergency", header: "طوارئ" },
    ];

    return { columns, rows, json: rows };
  }

  private bucketKey(date: Date, groupBy: "day" | "week" | "month"): string {
    if (groupBy === "month") return date.toISOString().slice(0, 7);
    if (groupBy === "week") return startOfIsoWeek(date).toISOString().slice(0, 10);
    return date.toISOString().slice(0, 10);
  }
}
