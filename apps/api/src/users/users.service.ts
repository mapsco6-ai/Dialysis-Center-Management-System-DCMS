import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { AuthenticatedUser } from "../common/types/authenticated-user";

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  employeeNo: true,
  phone: true,
  email: true,
  jobTitle: true,
  specialty: true,
  licenseNo: true,
  department: true,
  mustChangePassword: true,
  passwordResetRequestedAt: true,
  expiresAt: true,
  roles: { select: { role: { select: { name: true } } } },
} as const;

function toPublicUser(user: any) {
  const { roles, ...rest } = user;
  return { ...rest, roles: roles.map((userRole: any) => userRole.role.name) };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private auditActor(actor: AuthenticatedUser) {
    return { actorId: actor.id, actorRole: actor.roles[0] ?? "UNKNOWN", entityType: "User" };
  }

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException("Username already exists");
    }

    const roles = await this.prisma.role.findMany({
      where: { name: { in: dto.roleNames } },
      include: { permissions: { include: { permission: true } } },
    });
    if (roles.length !== dto.roleNames.length) {
      throw new BadRequestException("One or more roleNames do not exist");
    }

    // An account holder can never grant more power than they themselves have -
    // otherwise anyone with plain `user.create` could mint a SUPER_ADMIN by
    // just naming the role. This must hold regardless of which roles exist.
    const grantedPermissionKeys = new Set(
      roles.flatMap((role) => role.permissions.map((rp) => rp.permission.key)),
    );
    const actorPermissionKeys = new Set(actor.permissions);
    const permissionsBeyondActor = [...grantedPermissionKeys].filter(
      (key) => !actorPermissionKeys.has(key),
    );
    if (permissionsBeyondActor.length > 0) {
      throw new ForbiddenException(
        `Cannot grant permission(s) you do not hold yourself: ${permissionsBeyondActor.join(", ")}`,
      );
    }

    const passwordHash = await argon2.hash(dto.password);
    const { password: _password, roleNames: _roleNames, expiresAt, ...profile } = dto;

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          ...profile,
          passwordHash,
          // Set by an admin, so the person must replace it at first login.
          mustChangePassword: true,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          roles: { create: roles.map((role) => ({ roleId: role.id })) },
        },
        select: PUBLIC_USER_SELECT,
      });

      const publicUser = toPublicUser(user);

      await this.auditService.log(
        { ...this.auditActor(actor), action: "USER_CREATED", entityId: user.id, newValue: publicUser },
        tx,
      );

      return publicUser;
    });
  }

  async findAll(query: ListUsersQueryDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const search = query.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query.isActive === undefined ? {} : { isActive: query.isActive }),
      ...(query.role ? { roles: { some: { role: { name: query.role } } } } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: "insensitive" } },
              { username: { contains: search, mode: "insensitive" } },
              { employeeNo: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: PUBLIC_USER_SELECT,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { data: users.map(toPublicUser), total };
  }

  // Detail view: the merged effective permissions are what the person can
  // actually do, which is what a director wants to check before/after
  // changing roles.
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...PUBLIC_USER_SELECT,
        roles: {
          select: {
            role: { select: { name: true, permissions: { select: { permission: { select: { key: true } } } } } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException("User not found");
    const permissions = [
      ...new Set(user.roles.flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key))),
    ].sort();
    return { ...toPublicUser(user), permissions };
  }

  // Nobody may act on an account holding permissions they lack themselves
  // (same rule as create/role grants), otherwise a user.edit holder could
  // reset a director's password and take the account over.
  private async assertOutranks(targetId: string, actor: AuthenticatedUser) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        roles: { select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } } },
      },
    });
    if (!target) throw new NotFoundException("User not found");
    const beyond = target.roles
      .flatMap((ur) => ur.role.permissions.map((rp) => rp.permission.key))
      .filter((key) => !actor.permissions.includes(key));
    if (beyond.length > 0) {
      throw new ForbiddenException("Cannot manage an account holding permissions you do not hold yourself");
    }
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthenticatedUser) {
    await this.assertOutranks(id, actor);
    const before = await this.findOne(id);
    const { expiresAt, ...rest } = dto;
    const data = { ...rest, ...(expiresAt ? { expiresAt: new Date(expiresAt) } : {}) };
    return this.prisma.$transaction(async (tx) => {
      const updated = toPublicUser(await tx.user.update({ where: { id }, data, select: PUBLIC_USER_SELECT }));
      await this.auditService.log(
        { ...this.auditActor(actor), action: "USER_UPDATED", entityId: id, oldValue: before, newValue: updated },
        tx,
      );
      return updated;
    });
  }

  async setRoles(id: string, roleNames: string[], reason: string, actor: AuthenticatedUser) {
    if (id === actor.id) throw new BadRequestException("Cannot change your own roles");
    await this.assertOutranks(id, actor);
    const roles = await this.prisma.role.findMany({
      where: { name: { in: roleNames } },
      include: { permissions: { include: { permission: true } } },
    });
    if (roles.length !== new Set(roleNames).size) throw new BadRequestException("One or more roleNames do not exist");
    const beyond = roles
      .flatMap((r) => r.permissions.map((rp) => rp.permission.key))
      .filter((key) => !actor.permissions.includes(key));
    if (beyond.length > 0) {
      throw new ForbiddenException(
        `Cannot grant permission(s) you do not hold yourself: ${[...new Set(beyond)].join(", ")}`,
      );
    }

    const before = await this.findOne(id);
    if (before.roles.includes("SUPER_ADMIN") && !roleNames.includes("SUPER_ADMIN")) {
      const others = await this.prisma.user.count({
        where: { id: { not: id }, isActive: true, roles: { some: { role: { name: "SUPER_ADMIN" } } } },
      });
      if (others === 0) throw new BadRequestException("Cannot remove SUPER_ADMIN from the last active SUPER_ADMIN");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId: id } });
      await tx.userRole.createMany({ data: roles.map((r) => ({ userId: id, roleId: r.id })) });
      await this.auditService.log(
        {
          ...this.auditActor(actor),
          action: "USER_ROLES_CHANGED",
          entityId: id,
          oldValue: { roles: before.roles },
          newValue: { roles: roleNames },
          reason,
        },
        tx,
      );
    });
    // Read after commit: findOne uses the pool, not the transaction.
    return this.findOne(id);
  }

  // The temporary password is returned exactly once; the user must replace
  // it at next login (mustChangePassword) and every old session dies.
  async resetPassword(id: string, actor: AuthenticatedUser) {
    if (id === actor.id) throw new BadRequestException("Use change-password for your own account");
    await this.assertOutranks(id, actor);
    const temporaryPassword = randomBytes(9).toString("base64url");
    const passwordHash = await argon2.hash(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), passwordResetRequestedAt: null, tokenVersion: { increment: 1 } },
      });
      await this.auditService.log({ ...this.auditActor(actor), action: "USER_PASSWORD_RESET", entityId: id }, tx);
    });
    return { temporaryPassword };
  }

  async resetPin(id: string, actor: AuthenticatedUser) {
    await this.assertOutranks(id, actor);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { pinHash: null } });
      await this.auditService.log({ ...this.auditActor(actor), action: "USER_PIN_RESET", entityId: id }, tx);
    });
    return { success: true };
  }

  async activate(id: string, actor: AuthenticatedUser) {
    await this.assertOutranks(id, actor);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({ where: { id }, data: { isActive: true }, select: PUBLIC_USER_SELECT });
      await this.auditService.log(
        { ...this.auditActor(actor), action: "USER_ACTIVATED", entityId: id, oldValue: { isActive: false }, newValue: { isActive: true } },
        tx,
      );
      return toPublicUser(updated);
    });
  }

  async deactivate(id: string, actor: AuthenticatedUser, reason: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (id === actor.id) {
      throw new BadRequestException("Cannot deactivate your own account");
    }

    const isSuperAdmin = user.roles.some((ur) => ur.role.name === "SUPER_ADMIN");
    if (isSuperAdmin) {
      const otherActiveSuperAdmins = await this.prisma.user.count({
        where: {
          id: { not: id },
          isActive: true,
          roles: { some: { role: { name: "SUPER_ADMIN" } } },
        },
      });
      if (otherActiveSuperAdmins === 0) {
        throw new BadRequestException(
          "Cannot deactivate the last active SUPER_ADMIN - promote another account first",
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { isActive: false },
        select: PUBLIC_USER_SELECT,
      });

      await this.auditService.log(
        {
          ...this.auditActor(actor),
          action: "USER_DEACTIVATED",
          entityId: id,
          oldValue: { isActive: user.isActive },
          newValue: { isActive: false },
          reason,
        },
        tx,
      );

      return toPublicUser(updated);
    });
  }
}
