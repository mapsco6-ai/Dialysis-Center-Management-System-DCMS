import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateLabOrderDto } from "./dto/create-lab-order.dto";

const ORDER_INCLUDE = {
  patient: { select: { id: true, fullName: true, patientCode: true } },
  orderedByDoctor: { select: { id: true, fullName: true } },
  items: {
    include: {
      labTest: true,
      results: { orderBy: { createdAt: "desc" as const } },
    },
  },
} satisfies Prisma.LabOrderInclude;

@Injectable()
export class LabOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  // Groups every result from this request under one episodeCode so they
  // display together as a single Lab Episode (docs/MODULES-SPEC.md: "يجمّع
  // كل نتائج نفس الطلب/التاريخ"). Derived from the same zero-collision-
  // under-concurrency sequence trick as Patient.patientCode.
  private async buildOrderWithItems(
    tx: Prisma.TransactionClient,
    patientId: string,
    doctorId: string,
    labTestIds: string[],
  ) {
    const created = await tx.labOrder.create({
      data: { patientId, orderedByDoctorId: doctorId, episodeCode: "PENDING" },
    });
    const episodeCode = `LAB-${String(created.humanNumber).padStart(6, "0")}`;
    await tx.labOrder.update({ where: { id: created.id }, data: { episodeCode } });

    await tx.labOrderItem.createMany({
      data: labTestIds.map((labTestId) => ({ labOrderId: created.id, labTestId })),
    });

    return created.id;
  }

  // Creates a bare episode with zero items - used when a doctor requests
  // labs through the generic /doctor-orders path (payload is free-text
  // `details`, no catalog test selection) instead of the dedicated /lab/
  // orders flow (docs review DCMS-061). This doesn't assert which tests are
  // needed - that would be inventing a clinical decision this endpoint has
  // no authority to make - it only guarantees the request becomes real,
  // visible lab-module work instead of text nobody in the lab ever sees.
  // Lab staff still specify the actual test(s) before any processing can
  // start; the episode exists so that link isn't lost.
  async createPendingSpecification(tx: Prisma.TransactionClient, patientId: string, doctorId: string): Promise<string> {
    return this.buildOrderWithItems(tx, patientId, doctorId, []);
  }

  async create(dto: CreateLabOrderDto, actor: AuthenticatedUser) {
    const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
    if (!patient) {
      throw new BadRequestException("Patient not found");
    }

    const testIds = new Set<string>(dto.labTestIds ?? []);
    let panelName: string | null = null;
    if (dto.labPanelId) {
      const panel = await this.prisma.labPanel.findUnique({
        where: { id: dto.labPanelId },
        include: { tests: true },
      });
      if (!panel) {
        throw new BadRequestException("labPanelId does not refer to an existing panel");
      }
      panelName = panel.name;
      for (const t of panel.tests) testIds.add(t.labTestId);
    }
    if (testIds.size === 0) {
      throw new BadRequestException("At least one of labPanelId or labTestIds must resolve to a test");
    }

    const existingCount = await this.prisma.labTest.count({ where: { id: { in: [...testIds] } } });
    if (existingCount !== testIds.size) {
      throw new BadRequestException("One or more labTestIds do not exist");
    }

    return this.prisma.$transaction(async (tx) => {
      const labOrderId = await this.buildOrderWithItems(tx, dto.patientId, actor.id, [...testIds]);
      const order = await tx.labOrder.findUniqueOrThrow({ where: { id: labOrderId }, include: ORDER_INCLUDE });

      // Also logged as a DoctorOrder so it shows up in Phase 8's Orders tab
      // alongside every other doctor action for this patient - the two
      // phases share one coherent order history rather than two disjoint
      // lists.
      await tx.doctorOrder.create({
        data: {
          patientId: dto.patientId,
          doctorId: actor.id,
          type: "LAB_REQUEST",
          payload: {
            details: panelName ? `Panel: ${panelName}` : `Tests: ${[...testIds].length}`,
            labOrderId: order.id,
            episodeCode: order.episodeCode,
          },
          reason: dto.reason,
        },
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "LAB_ORDER_CREATED",
          entityType: "LabOrder",
          entityId: order.id,
          newValue: { episodeCode: order.episodeCode, testCount: testIds.size },
        },
        tx,
      );

      await tx.patientTimelineEvent.create({
        data: {
          patientId: dto.patientId,
          type: "LAB_ORDER_CREATED",
          payload: { labOrderId: order.id, episodeCode: order.episodeCode },
          performedById: actor.id,
          sourceModule: "lab",
        },
      });

      return order;
    });
  }

  async listForPatient(patientId: string) {
    return this.prisma.labOrder.findMany({
      where: { patientId },
      include: ORDER_INCLUDE,
      orderBy: { orderedAt: "desc" },
    });
  }

  async listQueue(status?: string) {
    return this.prisma.labOrderItem.findMany({
      where: status ? { status: status as never } : { status: { notIn: ["FINAL", "AMENDED", "CANCELLED"] } },
      include: {
        labTest: true,
        labOrder: {
          include: {
            patient: { select: { id: true, fullName: true, patientCode: true } },
            orderedByDoctor: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async requireOrderItem(id: string) {
    const item = await this.prisma.labOrderItem.findUnique({
      where: { id },
      include: { labOrder: true, labTest: true },
    });
    if (!item) {
      throw new NotFoundException("Lab order item not found");
    }
    return item;
  }
}
