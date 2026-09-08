import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { toDateOnly, todayDateOnly } from "../scheduling/date.util";

// A session still occupying its machine in a clinically-relevant way - the
// live board cares about these, not SCHEDULED/ARRIVED (pre-machine) or
// COMPLETED/DISCHARGED (already vacated).
const LIVE_SESSION_STATUSES = ["ASSIGNED", "IN_DIALYSIS", "POST_DIALYSIS", "INTERRUPTED"] as const;

@Injectable()
export class WardDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(wardId: string, dateStr: string | undefined, shiftId: string | undefined, actor: AuthenticatedUser) {
    const ward = await this.prisma.ward.findUnique({ where: { id: wardId } });
    if (!ward) {
      throw new NotFoundException("Ward not found");
    }
    const date = dateStr ? toDateOnly(dateStr) : todayDateOnly();

    const machines = await this.prisma.machine.findMany({
      where: { wardId },
      orderBy: { machineCode: "asc" },
    });

    const machineIds = machines.map((m) => m.id);
    const sessions = machineIds.length
      ? await this.prisma.dialysisSession.findMany({
          where: { machineId: { in: machineIds }, status: { in: [...LIVE_SESSION_STATUSES] } },
          include: {
            patient: { select: { id: true, fullName: true, patientCode: true } },
            nurse: { select: { id: true, fullName: true } },
            readings: { orderBy: { time: "desc" }, take: 1 },
            events: { orderBy: { recordedAt: "desc" }, take: 5 },
          },
        })
      : [];
    const sessionByMachineId = new Map(sessions.filter((s) => s.machineId).map((s) => [s.machineId as string, s]));

    // Permission Filter (docs/PROJECT-PHASES-PLAN.md Phase 7 acceptance
    // criterion 1): without nursing.ward.view.all, a nurse sees the ward's
    // machines but only the clinical detail of patients actually assigned
    // to them for this ward/shift/date - other patients' slots show as
    // empty rather than leaking their identity/status.
    const canViewAll = actor.permissions.includes("nursing.ward.view.all");
    let assignedPatientIds: Set<string> | null = null;
    if (!canViewAll) {
      const myAssignments = await this.prisma.nursingAssignmentPatient.findMany({
        where: { wardId, date, ...(shiftId ? { shiftId } : {}), assignment: { nurseId: actor.id } },
        select: { patientId: true },
      });
      assignedPatientIds = new Set(myAssignments.map((a) => a.patientId));
    }

    const patientIds = sessions.map((s) => s.patientId);
    const alertCounts = patientIds.length
      ? await this.prisma.clinicalAlert.groupBy({
          by: ["patientId"],
          where: { patientId: { in: patientIds }, resolvedAt: null },
          _count: { _all: true },
        })
      : [];
    const alertCountByPatientId = new Map(alertCounts.map((a) => [a.patientId, a._count._all]));

    const machineViews = machines.map((machine) => {
      const session = sessionByMachineId.get(machine.id);
      const visible = !!session && (canViewAll || (assignedPatientIds?.has(session.patientId) ?? false));
      const sessionView = visible && session
        ? {
            id: session.id,
            status: session.status,
            patientId: session.patientId,
            patient: session.patient,
            nurseId: session.nurseId,
            nurse: session.nurse,
            startTime: session.startTime,
            lastReadingAt: session.readings[0]?.time ?? null,
            minutesSinceLastReading: session.readings[0]
              ? Math.round((Date.now() - session.readings[0].time.getTime()) / 60000)
              : null,
            openAlertsCount: alertCountByPatientId.get(session.patientId) ?? 0,
            recentEvents: session.events.map((e) => ({ id: e.id, type: e.type, note: e.note, recordedAt: e.recordedAt })),
          }
        : null;

      return {
        id: machine.id,
        machineCode: machine.machineCode,
        status: machine.status,
        isProtected: machine.isProtected,
        isEmergencyDedicated: machine.isEmergencyDedicated,
        session: sessionView,
      };
    });

    return {
      ward: { id: ward.id, name: ward.name },
      date: date.toISOString().slice(0, 10),
      machines: machineViews,
      // Always empty until Phase 8 adds the DoctorOrder model - the shape is
      // ready so the nursing screen doesn't need reworking then (docs/
      // PROJECT-PHASES-PLAN.md Phase 7 acceptance criterion 4, deferred
      // because DoctorOrder is explicitly out of this phase's scope).
      doctorOrders: [] as unknown[],
    };
  }
}
