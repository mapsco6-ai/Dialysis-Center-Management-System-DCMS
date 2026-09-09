import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PharmacyService } from "../pharmacy/pharmacy.service";
import { LabOrdersService } from "../lab/lab-orders.service";
import { WarehouseAnalyticsService } from "../inventory/warehouse-analytics.service";
import { ReportColumn, ReportRow } from "./report-export.service";

export interface ReportPayload {
  columns: ReportColumn[];
  rows: ReportRow[];
  json: unknown;
}

@Injectable()
export class PatientReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pharmacyService: PharmacyService,
    private readonly labOrdersService: LabOrdersService,
    private readonly warehouseAnalyticsService: WarehouseAnalyticsService,
  ) {}

  private async requirePatient(patientId: string) {
    const patient = await this.prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new NotFoundException("Patient not found");
    return patient;
  }

  private dateFilter(from?: string, to?: string) {
    if (!from && !to) return undefined;
    const filter: { gte?: Date; lte?: Date } = {};
    if (from) filter.gte = new Date(from);
    if (to) filter.lte = new Date(`${to}T23:59:59.999Z`);
    return filter;
  }

  async summary(patientId: string): Promise<ReportPayload> {
    const patient = await this.prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        alerts: { orderBy: { createdAt: "desc" } },
        dialysisPlans: { where: { isActive: true }, take: 1 },
      },
    });
    if (!patient) throw new NotFoundException("Patient not found");

    const [sessionsCount, absencesCount, emergencyCount] = await Promise.all([
      this.prisma.dialysisSession.count({ where: { patientId } }),
      this.prisma.dialysisSchedule.count({ where: { patientId, status: "ABSENT" } }),
      this.prisma.dialysisSchedule.count({ where: { patientId, type: "EMERGENCY" } }),
    ]);

    const row: ReportRow = {
      patientCode: patient.patientCode,
      fullName: patient.fullName,
      status: patient.status,
      hasActivePlan: patient.dialysisPlans.length > 0,
      totalSessions: sessionsCount,
      totalAbsences: absencesCount,
      totalEmergencySessions: emergencyCount,
      activeAlerts: patient.alerts.filter((a) => !a.resolvedAt).length,
    };

    const columns: ReportColumn[] = [
      { key: "patientCode", header: "الرقم" },
      { key: "fullName", header: "الاسم", width: 2 },
      { key: "status", header: "الحالة" },
      { key: "hasActivePlan", header: "خطة فعّالة" },
      { key: "totalSessions", header: "إجمالي الجلسات" },
      { key: "totalAbsences", header: "الغياب" },
      { key: "totalEmergencySessions", header: "جلسات الطوارئ" },
      { key: "activeAlerts", header: "تنبيهات فعّالة" },
    ];

    return { columns, rows: [row], json: { patient, sessionsCount, absencesCount, emergencyCount } };
  }

  // Acceptance criterion 1: must match exactly the number/details of the
  // patient's actually-recorded sessions for the period - one row per
  // DialysisSession, sourced from the same table Phase 6 writes to.
  async sessionHistory(patientId: string, from?: string, to?: string): Promise<ReportPayload> {
    await this.requirePatient(patientId);
    const scheduledDate = this.dateFilter(from, to);

    const sessions = await this.prisma.dialysisSession.findMany({
      where: { patientId, ...(scheduledDate ? { schedule: { scheduledDate } } : {}) },
      include: { schedule: { include: { shift: true } }, machine: true, ward: true },
      orderBy: { schedule: { scheduledDate: "asc" } },
    });

    const rows: ReportRow[] = sessions.map((s) => ({
      date: s.schedule.scheduledDate.toISOString().slice(0, 10),
      shift: s.schedule.shift.name,
      status: s.status,
      ward: s.ward?.name ?? "",
      machineCode: s.machine?.machineCode ?? "",
      startTime: s.startTime ? s.startTime.toISOString() : "",
      endTime: s.endTime ? s.endTime.toISOString() : "",
      actualDurationMinutes: s.actualDurationMinutes ?? "",
      preWeight: s.preWeight ? Number(s.preWeight) : "",
      postWeight: s.postWeight ? Number(s.postWeight) : "",
      actualUF: s.actualUF ? Number(s.actualUF) : "",
      complications: s.complications ?? "",
    }));

    const columns: ReportColumn[] = [
      { key: "date", header: "التاريخ" },
      { key: "shift", header: "الوجبة" },
      { key: "status", header: "الحالة" },
      { key: "ward", header: "الردهة" },
      { key: "machineCode", header: "الجهاز" },
      { key: "startTime", header: "بداية" },
      { key: "endTime", header: "نهاية" },
      { key: "actualDurationMinutes", header: "المدة (د)" },
      { key: "preWeight", header: "الوزن قبل" },
      { key: "postWeight", header: "الوزن بعد" },
      { key: "actualUF", header: "UF الفعلي" },
      { key: "complications", header: "مضاعفات", width: 2 },
    ];

    return { columns, rows, json: sessions };
  }

  async medicationHistory(patientId: string): Promise<ReportPayload> {
    await this.requirePatient(patientId);
    const prescriptions = await this.pharmacyService.medicationHistory(patientId);

    const rows: ReportRow[] = prescriptions.map((p) => ({
      medicationName: p.medicationName,
      dose: p.dose,
      frequency: p.frequency,
      duration: p.duration,
      status: p.status,
      prescribedAt: p.prescribedAt.toISOString(),
      prescribedBy: p.prescribedBy?.fullName ?? "",
      dispensedCount: p.dispenses.length,
      administeredCount: p.administrations.length,
    }));

    const columns: ReportColumn[] = [
      { key: "medicationName", header: "الدواء", width: 2 },
      { key: "dose", header: "الجرعة" },
      { key: "frequency", header: "التكرار" },
      { key: "duration", header: "المدة" },
      { key: "status", header: "الحالة" },
      { key: "prescribedAt", header: "تاريخ الوصف" },
      { key: "prescribedBy", header: "الطبيب" },
      { key: "dispensedCount", header: "عدد مرات الصرف" },
      { key: "administeredCount", header: "عدد مرات الإعطاء" },
    ];

    return { columns, rows, json: prescriptions };
  }

  async labHistory(patientId: string): Promise<ReportPayload> {
    await this.requirePatient(patientId);
    const orders = await this.labOrdersService.listForPatient(patientId);

    const rows: ReportRow[] = [];
    for (const order of orders) {
      for (const item of order.items) {
        const latest = item.results[0];
        rows.push({
          episodeCode: order.episodeCode,
          orderedAt: order.orderedAt.toISOString(),
          testName: item.labTest.name,
          status: item.status,
          latestResultValue: latest?.value ?? "",
          latestResultAt: latest?.createdAt.toISOString() ?? "",
        });
      }
    }

    const columns: ReportColumn[] = [
      { key: "episodeCode", header: "رقم الحلقة" },
      { key: "orderedAt", header: "تاريخ الطلب" },
      { key: "testName", header: "الفحص", width: 2 },
      { key: "status", header: "الحالة" },
      { key: "latestResultValue", header: "آخر نتيجة" },
      { key: "latestResultAt", header: "تاريخ النتيجة" },
    ];

    return { columns, rows, json: orders };
  }

  async absences(patientId: string, from?: string, to?: string): Promise<ReportPayload> {
    await this.requirePatient(patientId);
    const scheduledDate = this.dateFilter(from, to);

    const schedules = await this.prisma.dialysisSchedule.findMany({
      where: { patientId, status: "ABSENT", ...(scheduledDate ? { scheduledDate } : {}) },
      include: { shift: true },
      orderBy: { scheduledDate: "asc" },
    });

    const rows: ReportRow[] = schedules.map((s) => ({
      date: s.scheduledDate.toISOString().slice(0, 10),
      shift: s.shift.name,
      type: s.type,
    }));

    const columns: ReportColumn[] = [
      { key: "date", header: "التاريخ" },
      { key: "shift", header: "الوجبة" },
      { key: "type", header: "النوع" },
    ];

    return { columns, rows, json: schedules };
  }

  async emergencySessions(patientId: string, from?: string, to?: string): Promise<ReportPayload> {
    await this.requirePatient(patientId);
    const scheduledDate = this.dateFilter(from, to);

    const schedules = await this.prisma.dialysisSchedule.findMany({
      where: { patientId, type: "EMERGENCY", ...(scheduledDate ? { scheduledDate } : {}) },
      include: { shift: true },
      orderBy: { scheduledDate: "asc" },
    });

    const rows: ReportRow[] = schedules.map((s) => ({
      date: s.scheduledDate.toISOString().slice(0, 10),
      shift: s.shift.name,
      status: s.status,
      sourceHospital: s.emergencySourceHospital ?? "",
      reason: s.emergencyReason ?? "",
    }));

    const columns: ReportColumn[] = [
      { key: "date", header: "التاريخ" },
      { key: "shift", header: "الوجبة" },
      { key: "status", header: "الحالة" },
      { key: "sourceHospital", header: "المستشفى المصدر" },
      { key: "reason", header: "السبب", width: 2 },
    ];

    return { columns, rows, json: schedules };
  }

  async consumption(patientId: string, month: string): Promise<ReportPayload> {
    await this.requirePatient(patientId);
    const report = await this.warehouseAnalyticsService.getPatientConsumptionReport(patientId, month);

    const rows: ReportRow[] = [
      ...report.consumables.map((c) => ({ type: "مستلزمات", name: c.name, category: c.category, quantity: c.totalQuantity, cost: c.totalCost })),
      ...report.medication.map((m) => ({ type: "أدوية", name: m.name, category: m.category, quantity: m.totalQuantity, cost: m.totalCost })),
    ];

    const columns: ReportColumn[] = [
      { key: "type", header: "النوع" },
      { key: "name", header: "الصنف", width: 2 },
      { key: "category", header: "الفئة" },
      { key: "quantity", header: "الكمية" },
      { key: "cost", header: "التكلفة" },
    ];

    return { columns, rows, json: report };
  }
}
