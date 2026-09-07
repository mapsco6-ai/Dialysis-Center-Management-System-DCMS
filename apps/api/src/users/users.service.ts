import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as argon2 from "argon2";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { AuthenticatedUser } from "../common/types/authenticated-user";

const PUBLIC_USER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
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

  async create(dto: CreateUserDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw new ConflictException("Username already exists");
    }

    const roles = await this.prisma.role.findMany({ where: { name: { in: dto.roleNames } } });
    if (roles.length !== dto.roleNames.length) {
      throw new BadRequestException("One or more roleNames do not exist");
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        fullName: dto.fullName,
        passwordHash,
        roles: { create: roles.map((role) => ({ roleId: role.id })) },
      },
      select: PUBLIC_USER_SELECT,
    });

    const publicUser = toPublicUser(user);

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "USER_CREATED",
      entityType: "User",
      entityId: user.id,
      newValue: publicUser,
    });

    return publicUser;
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      select: PUBLIC_USER_SELECT,
      orderBy: { createdAt: "desc" },
    });
    return users.map(toPublicUser);
  }

  async deactivate(id: string, actor: AuthenticatedUser, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: PUBLIC_USER_SELECT,
    });

    await this.auditService.log({
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "UNKNOWN",
      action: "USER_DEACTIVATED",
      entityType: "User",
      entityId: id,
      oldValue: { isActive: user.isActive },
      newValue: { isActive: false },
      reason,
    });

    return toPublicUser(updated);
  }
}
