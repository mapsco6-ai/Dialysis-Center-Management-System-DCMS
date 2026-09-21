import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const TZ = process.env.TZ ?? "Asia/Baghdad";
const DEFAULT_DAYS = 30;

type Tally = { key: string; count: number }[];
type Grouped = { _count: { _all: number } };
const tally = <T extends Grouped>(rows: T[], keyOf: (row: T) => string): Tally =>
  rows.map((row) => ({ key: keyOf(row), count: row._count._all }));
const sum = (rows: Grouped[]) => rows.reduce((s, r) => s + r._count._all, 0);
const countOf = (rows: Tally, key: string) => rows.find((r) => r.key === key)?.count ?? 0;

// Read-only aggregates for the committee dashboard: every section of the
// center in one payload, shaped for charts. No patient names anywhere.
@Injectable()
export class OversightService {
  constructor(private readonly prisma: PrismaService) {}

  private range(from?: string, to?: string) {
    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getTime() - DEFAULT_DAYS * 86_400_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException("from/to must be valid dates with from <= to");
    }
    return { start, end };
  }

  // table/column are code constants (never user input).
  private byDay(table: string, start: Date, end: Date, extra: Prisma.Sql = Prisma.empty) {
    return this.prisma.$queryRaw<{ day: string; count: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', "createdAt" AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count
      FROM ${Prisma.raw(`"${table}"`)}
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end} ${extra}
      GROUP BY 1 ORDER BY 1`);
  }

  async summary(from?: string, to?: string) {
    const { start, end } = this.range(from, to);
    const within = { gte: start, lte: end };

    const [
      activePatients, patientsByStatus, sessionsByStatus, sessionsByDay, interruptedByDay,
      incidentsByType, incidentsBySeverity, incidentsByStatus, incidentsByDay,
      machinesByStatus, ticketsByStatus, ticketsBySeverity,
      labItemsByStatus, criticalResults, prescriptionsByStatus,
      entriesByType, complaintsByStatus, complaintsBySource,
      activityByDay, activityByRole, staffByRole, transfersByStatus, roles,
    ] = await Promise.all([
      this.prisma.patient.count({ where: { status: "ACTIVE" } }),
      this.prisma.patient.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.dialysisSession.groupBy({ by: ["status"], where: { createdAt: within }, _count: { _all: true } }),
      this.byDay("dialysis_sessions", start, end),
      this.byDay("dialysis_sessions", start, end, Prisma.sql`AND "status" = 'INTERRUPTED'`),
      this.prisma.incidentReport.groupBy({ by: ["type"], where: { createdAt: within }, _count: { _all: true } }),
      this.prisma.incidentReport.groupBy({ by: ["severity"], where: { createdAt: within }, _count: { _all: true } }),
      this.prisma.incidentReport.groupBy({ by: ["status"], where: { createdAt: within }, _count: { _all: true } }),
      this.byDay("incident_reports", start, end),
      this.prisma.machine.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.maintenanceTicket.groupBy({ by: ["status"], where: { createdAt: within }, _count: { _all: true } }),
      this.prisma.maintenanceTicket.groupBy({ by: ["severity"], where: { createdAt: within }, _count: { _all: true } }),
      this.prisma.labOrderItem.groupBy({ by: ["status"], where: { createdAt: within }, _count: { _all: true } }),
      this.prisma.labResult.count({ where: { isCritical: true, createdAt: within } }),
      this.prisma.prescription.groupBy({ by: ["status"], where: { createdAt: within }, _count: { _all: true } }),
      this.prisma.staffEntry.groupBy({ by: ["type"], where: { createdAt: within }, _count: { _all: true } }),
      this.prisma.staffEntry.groupBy({ by: ["status"], where: { type: "COMPLAINT", createdAt: within }, _count: { _all: true } }),
      this.prisma.staffEntry.groupBy({ by: ["complaintSource"], where: { type: "COMPLAINT", createdAt: within }, _count: { _all: true } }),
      this.byDay("audit_logs", start, end),
      this.prisma.auditLog.groupBy({ by: ["actorRole"], where: { createdAt: within }, _count: { _all: true } }),
      this.prisma.userRole.groupBy({ by: ["roleId"], _count: { _all: true } }),
      this.prisma.stockTransfer.groupBy({ by: ["status"], where: { requestedAt: within }, _count: { _all: true } }),
      this.prisma.role.findMany({ select: { id: true, name: true } }),
    ]);

    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    const sessions = tally(sessionsByStatus, (r) => r.status);
    const incidents = tally(incidentsByStatus, (r) => r.status);
    const machines = tally(machinesByStatus, (r) => r.status);

    return {
      range: { from: start, to: end },
      kpis: {
        activePatients,
        sessions: sum(sessionsByStatus),
        completedSessions: countOf(sessions, "COMPLETED") + countOf(sessions, "DISCHARGED"),
        interruptedSessions: countOf(sessions, "INTERRUPTED"),
        incidents: sum(incidentsByStatus),
        openIncidents: countOf(incidents, "OPEN") + countOf(incidents, "UNDER_REVIEW") + countOf(incidents, "ACTION_REQUIRED"),
        criticalLabResults: criticalResults,
        machines: sum(machinesByStatus),
        machinesAvailable: countOf(machines, "AVAILABLE"),
        complaints: sum(complaintsByStatus),
      },
      charts: {
        sessionsByDay,
        interruptedByDay,
        incidentsByDay,
        activityByDay,
        sessionsByStatus: sessions,
        patientsByStatus: tally(patientsByStatus, (r) => r.status),
        incidentsByType: tally(incidentsByType, (r) => r.type),
        incidentsBySeverity: tally(incidentsBySeverity, (r) => r.severity),
        incidentsByStatus: incidents,
        machinesByStatus: machines,
        ticketsByStatus: tally(ticketsByStatus, (r) => r.status),
        ticketsBySeverity: tally(ticketsBySeverity, (r) => r.severity),
        labItemsByStatus: tally(labItemsByStatus, (r) => r.status),
        prescriptionsByStatus: tally(prescriptionsByStatus, (r) => r.status),
        entriesByType: tally(entriesByType, (r) => r.type),
        complaintsByStatus: tally(complaintsByStatus, (r) => r.status),
        complaintsBySource: tally(complaintsBySource, (r) => r.complaintSource ?? "UNSPECIFIED"),
        activityByRole: tally(activityByRole, (r) => r.actorRole),
        staffByRole: staffByRole.map((r) => ({ key: roleName.get(r.roleId) ?? r.roleId, count: r._count._all })),
        transfersByStatus: tally(transfersByStatus, (r) => r.status),
      },
    };
  }

  // Cross-patient record timeline. Patients appear by code only.
  async timeline(query: { from?: string; to?: string; type?: string; module?: string; page?: number; limit?: number }) {
    const { start, end } = this.range(query.from, query.to);
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: Prisma.PatientTimelineEventWhereInput = {
      performedAt: { gte: start, lte: end },
      type: query.type,
      sourceModule: query.module,
    };
    const [rows, total, modules] = await Promise.all([
      this.prisma.patientTimelineEvent.findMany({
        where,
        orderBy: [{ performedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        include: { patient: { select: { patientCode: true } }, performedBy: { select: { fullName: true } } },
      }),
      this.prisma.patientTimelineEvent.count({ where }),
      this.prisma.patientTimelineEvent.groupBy({
        by: ["sourceModule"],
        where: { performedAt: { gte: start, lte: end } },
        _count: { _all: true },
      }),
    ]);
    return {
      total,
      modules: modules.map((m) => ({ key: m.sourceModule, count: m._count._all })),
      data: rows.map((r) => ({
        id: r.id,
        performedAt: r.performedAt,
        type: r.type,
        sourceModule: r.sourceModule,
        patientCode: r.patient.patientCode,
        performedBy: r.performedBy?.fullName ?? null,
        payload: r.payload,
      })),
    };
  }
}
