import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { UpdateShiftCapacityDto } from "./dto/update-shift-capacity.dto";

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll() {
    return this.prisma.shift.findMany({ orderBy: { name: "asc" } });
  }

  async updateCapacity(id: string, dto: UpdateShiftCapacityDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.shift.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Shift not found");
    }

    const nominalCapacity = dto.nominalCapacity;
    const reservedCapacity = dto.reservedCapacity ?? existing.reservedCapacity;
    // reservedCapacity carves seats out of nominalCapacity for emergencies -
    // it cannot exceed the total the shift actually has (DCMS-031: this was
    // previously accepted unchecked, e.g. nominal=1/reserved=5).
    if (reservedCapacity > nominalCapacity) {
      throw new BadRequestException("reservedCapacity cannot exceed nominalCapacity");
    }

    const shift = await this.prisma.shift.update({
      where: { id },
      data: {
        nominalCapacity,
        reservedCapacity,
        lateThresholdMinutes: dto.lateThresholdMinutes ?? existing.lateThresholdMinutes,
      },
    });

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "SHIFT_CAPACITY_UPDATED",
      entityType: "Shift",
      entityId: id,
      oldValue: {
        nominalCapacity: existing.nominalCapacity,
        reservedCapacity: existing.reservedCapacity,
        lateThresholdMinutes: existing.lateThresholdMinutes,
      },
      newValue: {
        nominalCapacity: shift.nominalCapacity,
        reservedCapacity: shift.reservedCapacity,
        lateThresholdMinutes: shift.lateThresholdMinutes,
      },
    });

    return shift;
  }
}
