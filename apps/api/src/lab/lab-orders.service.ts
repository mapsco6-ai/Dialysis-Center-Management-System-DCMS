import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { emitNotification } from "../common/notify";
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
    private readonly eventEmitter: EventEmitter2,
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
    linkedSessionId?: string,
  ) {
    const created = await tx.labOrder.create({
      data: { patientId, orderedByDoctorId: doctorId, episodeCode: "PENDING", linkedSessionId },
    });
    const episodeCode = `LAB-${String(created.humanNumber).padStart(6, "0")}`;
    await tx.labOrder.update({ where: { id: created.id }, data: { episodeCode } });

    await tx.labOrderItem.createMany({
      data: labTestIds.map((labTestId) => ({ labOrderId: created.id, labTestId })),
    });

    return created.id;
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

    if (dto.linkedSessionId) {
      const session = await this.prisma.dialysisSession.findUnique({ where: { id: dto.linkedSessionId } });
      if (!session) {
        throw new BadRequestException("linkedSessionId does not refer to an existing session");
      }
      // A session FK proves the row exists, not that it's this patient's -
      // without this a lab order could attribute its cost to another
      // patient's dialysis session (same DCMS-059 reasoning applied here).
      if (session.patientId !== dto.patientId) {
        throw new BadRequestException("linkedSessionId does not belong to this patient");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const labOrderId = await this.buildOrderWithItems(tx, dto.patientId, actor.id, [...testIds], dto.linkedSessionId);
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
    }).then((order) => {
      const tests = order.items.map((item) => item.labTest.name).join(", ");
      emitNotification(this.eventEmitter, {
        permission: "lab.queue.view",
        excludeUserId: actor.id,
        type: "LAB_ORDER_REQUESTED",
        title: `New lab request: ${order.episodeCode}`,
        body: `${order.patient.fullName} — ${tests}`,
        link: "/admin/care/lab",
      });
      return order;
    });
  }

  // ponytail: capped at the 500 most recent orders (most-recent-first, so a
  // long-standing patient's newest results are never the ones dropped) -
  // add real page/limit query params if a patient's history ever exceeds
  // this in practice.
  async listForPatient(patientId: string) {
    return this.prisma.labOrder.findMany({
      where: { patientId },
      include: ORDER_INCLUDE,
      orderBy: { orderedAt: "desc" },
      take: 500,
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
