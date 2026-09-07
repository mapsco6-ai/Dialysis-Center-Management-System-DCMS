import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: { name: "asc" },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      permissions: role.permissions.map((rp) => rp.permission.key),
    }));
  }

  async findAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: { key: "asc" } });
  }

  async updateRolePermissions(
    roleId: string,
    permissionKeys: string[],
    actor: AuthenticatedUser,
  ) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) {
      throw new NotFoundException("Role not found");
    }

    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });
    if (permissions.length !== permissionKeys.length) {
      throw new BadRequestException("One or more permissionKeys do not exist");
    }

    const oldKeys = role.permissions.map((rp) => rp.permission.key);

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
      }),
    ]);

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "ROLE_PERMISSIONS_UPDATED",
      entityType: "Role",
      entityId: roleId,
      oldValue: { permissions: oldKeys },
      newValue: { permissions: permissionKeys },
    });

    return this.findAll().then((roles) => roles.find((r) => r.id === roleId));
  }
}
