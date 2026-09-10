import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

interface AuditRow {
  [key: string]: string;
  timestamp: string;
  source: "AUDIT_LOG" | "TIMELINE";
  actor: string;
  action: string;
  entityType: string;
  reason: string;
}

// "Clinical Audit مبني فوق AuditLog وPatientTimelineEvent الموجودين أصلاً"
// (docs/PROJECT-PHASES-PLAN.md Phase 15) - no new entity, purely a read
// layer combining two tables that already exist. AuditLog has no patientId
// column of its own (it is keyed by entityType/entityId for ANY entity in
// the system), so this gathers every entity id that actually belongs to
// this patient first, then filters AuditLog down to just those rows.
@Injectable()
export class ClinicalAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async getPatientAudit(patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId }, select: { id: true } });
    if (!patient) {
      throw new NotFoundException("Patient not found");
    }

    const [schedules, sessions, doctorOrders, prescriptions, alerts, labOrders, incidents] = await Promise.all([
      this.prisma.dialysisSchedule.findMany({ where: { patientId }, select: { id: true } }),
      this.prisma.dialysisSession.findMany({ where: { patientId }, select: { id: true } }),
      this.prisma.doctorOrder.findMany({ where: { patientId }, select: { id: true } }),
      this.prisma.prescription.findMany({ where: { patientId }, select: { id: true } }),
      this.prisma.clinicalAlert.findMany({ where: { patientId }, select: { id: true } }),
      this.prisma.labOrder.findMany({ where: { patientId }, select: { id: true } }),
      this.prisma.incidentReport.findMany({ where: { patientId }, select: { id: true } }),
    ]);

    const entityGroups: { entityType: string; ids: string[] }[] = [
      { entityType: "Patient", ids: [patientId] },
      { entityType: "DialysisSchedule", ids: schedules.map((s) => s.id) },
      { entityType: "DialysisSession", ids: sessions.map((s) => s.id) },
      { entityType: "DoctorOrder", ids: doctorOrders.map((o) => o.id) },
      { entityType: "Prescription", ids: prescriptions.map((p) => p.id) },
      { entityType: "ClinicalAlert", ids: alerts.map((a) => a.id) },
      { entityType: "LabOrder", ids: labOrders.map((o) => o.id) },
      { entityType: "IncidentReport", ids: incidents.map((i) => i.id) },
    ].filter((g) => g.ids.length > 0);

    const [auditLogs, timelineEvents] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { OR: entityGroups.map((g) => ({ entityType: g.entityType, entityId: { in: g.ids } })) },
        include: { actor: { select: { fullName: true } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.patientTimelineEvent.findMany({
        where: { patientId },
        include: { performedBy: { select: { fullName: true } } },
        orderBy: { performedAt: "desc" },
      }),
    ]);

    const rows: AuditRow[] = [
      ...auditLogs.map((log) => ({
        timestamp: log.createdAt.toISOString(),
        source: "AUDIT_LOG" as const,
        actor: log.actor.fullName,
        action: log.action,
        entityType: log.entityType,
        reason: log.reason ?? "",
      })),
      ...timelineEvents.map((event) => ({
        timestamp: event.performedAt.toISOString(),
        source: "TIMELINE" as const,
        actor: event.performedBy?.fullName ?? "",
        action: event.type,
        entityType: event.sourceModule,
        reason: "",
      })),
    ].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return { patientId, auditLogs, timelineEvents, rows };
  }
}
