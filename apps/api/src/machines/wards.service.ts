import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateWardDto } from "./dto/create-ward.dto";
import { isUniqueConstraintOn } from "../patients/prisma-errors.util";

@Injectable()
export class WardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateWardDto, actor: AuthenticatedUser) {
    try {
      const ward = await this.prisma.ward.create({ data: { name: dto.name } });
      await this.auditService.log({
        actorId: actor.id,
        actorRole: actor.roles[0] ?? "UNKNOWN",
        action: "WARD_CREATED",
        entityType: "Ward",
        entityId: ward.id,
        newValue: ward,
      });
      return ward;
    } catch (error) {
      if (isUniqueConstraintOn(error, "name")) {
        throw new ConflictException("A ward with this name already exists");
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.ward.findMany({ orderBy: { name: "asc" } });
  }

  async findMachines(wardId: string) {
    const ward = await this.prisma.ward.findUnique({ where: { id: wardId } });
    if (!ward) {
      throw new NotFoundException("Ward not found");
    }
    // Live status, straight from the source of truth - no cached/denormalized
    // count (docs/PROJECT-PHASES-PLAN.md acceptance criterion 7: "بدقة لحظية").
    return this.prisma.machine.findMany({ where: { wardId }, orderBy: { machineCode: "asc" } });
  }
}
