import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { DoctorOrderType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateDoctorOrderDto } from "./dto/create-doctor-order.dto";
import { StopDoctorOrderDto } from "./dto/stop-doctor-order.dto";
import { ModifyDoctorOrderDto } from "./dto/modify-doctor-order.dto";

// What each order type needs in its payload at creation time - there's no
// shared schema across types (docs/MODULES-SPEC.md: "تفاصيل حسب النوع"), and
// LAB_REQUEST/EXTRA_SESSION_REQUEST/PHARMACY_RECOMMENDATION stay a plain
// text `details` field on purpose: the catalogs that would structure them
// (LabTest in Phase 9, the pharmacy/extra-session workflows) don't exist
// yet, and inventing one here would just be a fact this codebase has no
// authority to assert.
const REQUIRED_PAYLOAD_FIELDS: Record<DoctorOrderType, string[]> = {
  MEDICATION: ["medicationName", "dose", "frequency"],
  LAB_REQUEST: ["details"],
  NURSING_INSTRUCTION: ["instruction"],
  DRY_WEIGHT_CHANGE: ["newDryWeight"],
  EXTRA_SESSION_REQUEST: ["details"],
  PHARMACY_RECOMMENDATION: ["details"],
};

function requirePayloadFields(type: DoctorOrderType, payload: Record<string, unknown>) {
  const missing = REQUIRED_PAYLOAD_FIELDS[type].filter(
    (field) => payload[field] === undefined || payload[field] === null || payload[field] === "",
  );
  if (missing.length > 0) {
    throw new BadRequestException(`Missing required payload field(s) for ${type}: ${missing.join(", ")}`);
  }
}

@Injectable()
export class DoctorOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private async requireOrder(id: string) {
    const order = await this.prisma.doctorOrder.findUnique({ where: { id } });
    if (!order) {
      throw new NotFoundException("Doctor order not found");
    }
    return order;
  }

  async listForPatient(patientId: string) {
    return this.prisma.doctorOrder.findMany({
      where: { patientId },
      include: {
        doctor: { select: { id: true, fullName: true } },
        prescription: true,
        previousOrder: { select: { id: true, payload: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(dto: CreateDoctorOrderDto, actor: AuthenticatedUser) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) {
      throw new BadRequestException("Patient not found");
    }
    requirePayloadFields(dto.type, dto.payload);

    if (dto.type === "MEDICATION" && dto.payload.linkedSessionId) {
      const session = await this.prisma.dialysisSession.findUnique({
        where: { id: dto.payload.linkedSessionId as string },
      });
      if (!session) {
        throw new BadRequestException("linkedSessionId does not refer to an existing session");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      let prescriptionId: string | undefined;
      let payload = dto.payload;

      if (dto.type === "MEDICATION") {
        const prescription = await tx.prescription.create({
          data: {
            patientId: dto.patientId,
            doctorId: actor.id,
            medicationName: dto.payload.medicationName as string,
            dose: dto.payload.dose as string,
            frequency: dto.payload.frequency as string,
            duration: (dto.payload.duration as string | undefined) ?? null,
            linkedSessionId: (dto.payload.linkedSessionId as string | undefined) ?? null,
          },
        });
        prescriptionId = prescription.id;
        payload = { ...dto.payload, action: "ADD", prescriptionId: prescription.id };
      }

      if (dto.type === "DRY_WEIGHT_CHANGE") {
        const newDryWeight = Number(dto.payload.newDryWeight);
        if (!Number.isFinite(newDryWeight) || newDryWeight <= 0 || newDryWeight > 300) {
          throw new BadRequestException("newDryWeight must be a positive, realistic number of kilograms");
        }
        const oldDryWeight = patient.dryWeight;
        await tx.patient.update({ where: { id: dto.patientId }, data: { dryWeight: newDryWeight } });
        payload = { ...dto.payload, oldDryWeight };

        // A direct Patient field change gets its own audit entry, same as
        // every other clinical-field mutation in this codebase - the
        // DoctorOrder row below is the order/request record, this is the
        // fact-of-the-matter change (docs/PROJECT-PHASES-PLAN.md Phase 8
        // acceptance criterion 6).
        await this.auditService.log(
          {
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "UNKNOWN",
            action: "PATIENT_DRY_WEIGHT_CHANGED",
            entityType: "Patient",
            entityId: dto.patientId,
            oldValue: { dryWeight: oldDryWeight },
            newValue: { dryWeight: newDryWeight },
          },
          tx,
        );
      }

      const order = await tx.doctorOrder.create({
        data: {
          patientId: dto.patientId,
          doctorId: actor.id,
          type: dto.type,
          payload: payload as Prisma.InputJsonValue,
          reason: dto.reason,
          prescriptionId,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "DOCTOR_ORDER_CREATED",
          entityType: "DoctorOrder",
          entityId: order.id,
          newValue: { type: dto.type, payload },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: dto.patientId,
          type: `DOCTOR_ORDER_${dto.type}`,
          payload: { orderId: order.id, ...payload } as Prisma.InputJsonValue,
          performedById: actor.id,
          sourceModule: "doctor-orders",
        },
      });

      return order;
    });
  }

  // Stopping never creates a new row - there's no "old vs new value"
  // tension to preserve (it just ends), so flipping this row's status in
  // place already satisfies "no delete, full history kept" (docs/
  // PROJECT-PHASES-PLAN.md Phase 8 acceptance criterion 3).
  async stop(orderId: string, dto: StopDoctorOrderDto, actor: AuthenticatedUser) {
    const order = await this.requireOrder(orderId);
    if (order.status !== "ACTIVE") {
      throw new ConflictException(`Cannot stop an order that is ${order.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Atomic and conditional on still being ACTIVE - same pattern as the
      // Phase 3 check-in fix, closes a concurrent double-stop race.
      const result = await tx.doctorOrder.updateMany({
        where: { id: orderId, status: "ACTIVE" },
        data: { status: "STOPPED", reason: dto.reason },
      });
      if (result.count === 0) {
        throw new ConflictException("This order was already stopped or modified");
      }

      if (order.prescriptionId) {
        await tx.prescription.update({ where: { id: order.prescriptionId }, data: { status: "STOPPED" } });
      }

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "DOCTOR_ORDER_STOPPED",
          entityType: "DoctorOrder",
          entityId: orderId,
          oldValue: { status: "ACTIVE" },
          newValue: { status: "STOPPED" },
          reason: dto.reason,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: order.patientId,
          type: "DOCTOR_ORDER_STOPPED",
          payload: { orderId, type: order.type, reason: dto.reason },
          performedById: actor.id,
          sourceModule: "doctor-orders",
        },
      });

      return tx.doctorOrder.findUniqueOrThrow({ where: { id: orderId } });
    });
  }

  // Modifying always creates a new linked row (previousOrderId back to this
  // one) instead of overwriting the payload in place, so the OLD value
  // (old dose, old instruction...) stays queryable forever on the old row
  // (docs/PROJECT-PHASES-PLAN.md Phase 8 acceptance criterion 4: "لا يمحو
  // القيمة القديمة").
  async modify(orderId: string, dto: ModifyDoctorOrderDto, actor: AuthenticatedUser) {
    const order = await this.requireOrder(orderId);
    if (order.status !== "ACTIVE") {
      throw new ConflictException(`Cannot modify an order that is ${order.status}`);
    }
    if (Object.keys(dto.payload).length === 0) {
      throw new BadRequestException("payload must include at least one field to change");
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.doctorOrder.updateMany({
        where: { id: orderId, status: "ACTIVE" },
        data: { status: "MODIFIED", reason: dto.reason },
      });
      if (result.count === 0) {
        throw new ConflictException("This order was already stopped or modified");
      }

      let newPrescriptionId: string | undefined = order.prescriptionId ?? undefined;
      let payload = dto.payload;

      if (order.type === "MEDICATION" && order.prescriptionId) {
        const oldPrescription = await tx.prescription.findUniqueOrThrow({ where: { id: order.prescriptionId } });
        const newPrescription = await tx.prescription.create({
          data: {
            patientId: order.patientId,
            doctorId: actor.id,
            medicationName: (dto.payload.medicationName as string | undefined) ?? oldPrescription.medicationName,
            dose: (dto.payload.dose as string | undefined) ?? oldPrescription.dose,
            frequency: (dto.payload.frequency as string | undefined) ?? oldPrescription.frequency,
            duration: (dto.payload.duration as string | undefined) ?? oldPrescription.duration,
            linkedSessionId: oldPrescription.linkedSessionId,
            previousPrescriptionId: oldPrescription.id,
          },
        });
        // @unique on previousPrescriptionId means a concurrent second
        // modification attempt on the same prescription fails right here
        // with a clean DB constraint violation rather than silently
        // forking the chain.
        await tx.prescription.update({ where: { id: oldPrescription.id }, data: { status: "MODIFIED" } });
        newPrescriptionId = newPrescription.id;
        payload = {
          ...dto.payload,
          prescriptionId: newPrescription.id,
          oldDose: oldPrescription.dose,
          newDose: newPrescription.dose,
        };
      }

      const newOrder = await tx.doctorOrder.create({
        data: {
          patientId: order.patientId,
          doctorId: actor.id,
          type: order.type,
          payload: payload as Prisma.InputJsonValue,
          previousOrderId: order.id,
          prescriptionId: newPrescriptionId,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "DOCTOR_ORDER_MODIFIED",
          entityType: "DoctorOrder",
          entityId: newOrder.id,
          oldValue: { previousOrderId: order.id, payload: order.payload },
          newValue: { payload },
          reason: dto.reason,
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: order.patientId,
          type: "DOCTOR_ORDER_MODIFIED",
          payload: { previousOrderId: order.id, newOrderId: newOrder.id, ...payload } as Prisma.InputJsonValue,
          performedById: actor.id,
          sourceModule: "doctor-orders",
        },
      });

      return newOrder;
    });
  }
}
