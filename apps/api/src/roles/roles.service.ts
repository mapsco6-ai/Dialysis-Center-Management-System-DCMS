import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ROLES } from "@dcms/shared";
import { CreateRoleDto } from "./dto/create-role.dto";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";

// The one permission that can ever fix an RBAC lockout. If a change to a
// role's permissions would leave zero active users holding it (through any
// of their roles), the system becomes unrecoverable without a direct DB
// edit - so that change is rejected (docs review DCMS-023).
const RECOVERY_PERMISSION = "permission.manage";

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

  async findPermissionsGrouped() {
    const permissions = await this.findAllPermissions();
    const grouped: Record<string, typeof permissions> = {};
    for (const permission of permissions) (grouped[permission.module] ??= []).push(permission);
    return Object.entries(grouped).map(([module, items]) => ({ module, permissions: items }));
  }

  // Custom roles start with no permissions; the director grants them via
  // PATCH /roles/:id/permissions (which enforces the recovery-holder rule).
  async createRole(dto: CreateRoleDto, actor: AuthenticatedUser) {
    if (await this.prisma.role.findUnique({ where: { name: dto.name } })) {
      throw new ConflictException("Role name already exists");
    }
    return this.prisma.$transaction(async (tx) => {
      const role = await tx.role.create({ data: { name: dto.name, description: dto.description } });
      await this.auditService.log(
        { actorId: actor.id, actorRole: actor.roles[0] ?? "UNKNOWN", action: "ROLE_CREATED", entityType: "Role", entityId: role.id, newValue: role },
        tx,
      );
      return role;
    });
  }

  // Built-in roles are referenced by name in code (seed, templates, checks)
  // and roles in use would silently strip access - both are refused.
  async deleteRole(id: string, actor: AuthenticatedUser) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw new NotFoundException("Role not found");
    if ((ROLES as readonly string[]).includes(role.name)) {
      throw new BadRequestException("Built-in roles cannot be deleted");
    }
    if (role._count.users > 0) {
      throw new BadRequestException("Role is still assigned to users - reassign them first");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.auditService.log(
        { actorId: actor.id, actorRole: actor.roles[0] ?? "UNKNOWN", action: "ROLE_DELETED", entityType: "Role", entityId: id, oldValue: { name: role.name } },
        tx,
      );
    });
    return { success: true };
  }

  private async wouldLoseLastRecoveryHolder(roleId: string, newPermissionKeys: string[]) {
    const activeUsers = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        roles: {
          select: {
            roleId: true,
            role: { select: { permissions: { select: { permission: { select: { key: true } } } } } },
          },
        },
      },
    });

    const stillHasRecoveryPermission = activeUsers.some((user) =>
      user.roles.some((userRole) => {
        const keys =
          userRole.roleId === roleId
            ? newPermissionKeys
            : userRole.role.permissions.map((rp) => rp.permission.key);
        return keys.includes(RECOVERY_PERMISSION);
      }),
    );

    return !stillHasRecoveryPermission;
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

    if (await this.wouldLoseLastRecoveryHolder(roleId, permissionKeys)) {
      throw new BadRequestException(
        `This change would leave no active user holding '${RECOVERY_PERMISSION}' - the system ` +
          "would become unmanageable. Grant it to another active user's role first.",
      );
    }

    const oldKeys = role.permissions.map((rp) => rp.permission.key);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId, permissionId: permission.id })),
      });

      await this.auditService.log(
        {
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "UNKNOWN",
          action: "ROLE_PERMISSIONS_UPDATED",
          entityType: "Role",
          entityId: roleId,
          oldValue: { permissions: oldKeys },
          newValue: { permissions: permissionKeys },
        },
        tx,
      );
    });

    return this.findAll().then((roles) => roles.find((r) => r.id === roleId));
  }
}
