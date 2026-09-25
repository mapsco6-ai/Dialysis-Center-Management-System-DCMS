import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, TaskStatus } from "@prisma/client";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { emitNotification, word } from "../common/notify";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskStatusDto } from "./dto/update-task-status.dto";
import { ListTasksQueryDto } from "./dto/list-tasks-query.dto";

const PERSON = { select: { id: true, fullName: true } } as const;

const TASK_INCLUDE = {
  createdBy: PERSON,
  assignedTo: PERSON,
  assignedToRole: { select: { id: true, name: true } },
  claimedBy: PERSON,
  patient: { select: { id: true, fullName: true, patientCode: true } },
} satisfies Prisma.TaskInclude;

// A task is only ever picked up (OPEN -> IN_PROGRESS) or resolved directly;
// DONE/CANCELLED are final, same "forward-only, never reopened past the
// terminal state" shape as every other status-history model in this codebase.
const ALLOWED_TRANSITIONS: Partial<Record<TaskStatus, TaskStatus[]>> = {
  OPEN: ["IN_PROGRESS", "DONE", "CANCELLED"],
  IN_PROGRESS: ["DONE", "CANCELLED"],
};

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private actor(user: AuthenticatedUser) {
    return { actorId: user.id, actorRole: user.roles[0] ?? "UNKNOWN", entityType: "Task" };
  }

  // The role names a user currently holds have their ids resolved once here,
  // then reused by both create() (name -> id) and listMine()/isVisibleTo()
  // (id -> "is this one of mine") - a single source for "my role ids".
  private async myRoleIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return rows.map((r) => r.roleId);
  }

  async create(dto: CreateTaskDto, user: AuthenticatedUser) {
    if (Boolean(dto.assignedToId) === Boolean(dto.assignedToRoleId)) {
      throw new BadRequestException("Set exactly one of assignedToId or assignedToRoleId");
    }
    if (dto.assignedToId) {
      const assignee = await this.prisma.user.findUnique({ where: { id: dto.assignedToId } });
      if (!assignee || !assignee.isActive) {
        throw new BadRequestException("assignedToId does not refer to an active user");
      }
    }
    if (dto.assignedToRoleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.assignedToRoleId } });
      if (!role) {
        throw new BadRequestException("assignedToRoleId does not refer to an existing role");
      }
    }
    if (dto.patientId) {
      const patient = await this.prisma.patient.findUnique({ where: { id: dto.patientId } });
      if (!patient) {
        throw new BadRequestException("patientId does not refer to an existing patient");
      }
    }

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: dto.title,
          description: dto.description,
          createdById: user.id,
          assignedToId: dto.assignedToId,
          assignedToRoleId: dto.assignedToRoleId,
          patientId: dto.patientId,
          priority: dto.priority,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        },
        include: TASK_INCLUDE,
      });
      await tx.taskStatusHistory.create({
        data: { taskId: created.id, toStatus: "OPEN", changedById: user.id },
      });
      await this.auditService.log(
        {
          ...this.actor(user),
          action: "TASK_CREATED",
          entityId: created.id,
          patientId: dto.patientId,
          newValue: { title: dto.title, assignedToId: dto.assignedToId, assignedToRoleId: dto.assignedToRoleId },
        },
        tx,
      );
      return created;
    });

    if (dto.assignedToId) {
      emitNotification(this.eventEmitter, {
        userIds: [dto.assignedToId],
        excludeUserId: user.id,
        type: "TASK_ASSIGNED",
        title: task.title,
        link: "/admin/me/calendar",
      });
    } else {
      // Role-broadcast: notify every active member of that role directly -
      // simpler and exact here than the permission-based fan-out other
      // modules use, since the target is a specific role, not a permission.
      const members = await this.prisma.user.findMany({
        where: { isActive: true, roles: { some: { roleId: dto.assignedToRoleId } } },
        select: { id: true },
      });
      emitNotification(this.eventEmitter, {
        userIds: members.map((m) => m.id),
        excludeUserId: user.id,
        type: "TASK_ASSIGNED",
        title: task.title,
        body: `Routed to ${word(task.assignedToRole?.name, "en")}`,
        bodyAr: `مُسندة إلى ${word(task.assignedToRole?.name, "ar")}`,
        link: "/admin/me/calendar",
      });
    }

    return task;
  }

  async listRoutableRoles() {
    return this.prisma.role.findMany({
      where: { name: { not: "SUPER_ADMIN" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  }

  async list(query: ListTasksQueryDto) {
    return this.prisma.task.findMany({
      where: { status: query.status, assignedToId: query.assignedToId },
      include: TASK_INCLUDE,
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    });
  }

  // Everything routed to me by name, plus anything still open/in-progress
  // routed to any role I hold that nobody has claimed yet (or that I claimed
  // myself) - a role broadcast a colleague already finished shouldn't keep
  // cluttering the rest of the role's inbox.
  async listMine(user: AuthenticatedUser, fromStr?: string, toStr?: string) {
    const roleIds = await this.myRoleIds(user.id);
    const dueRange =
      fromStr || toStr
        ? { dueAt: { gte: fromStr ? new Date(fromStr) : undefined, lte: toStr ? new Date(toStr) : undefined } }
        : {};
    return this.prisma.task.findMany({
      where: {
        ...dueRange,
        OR: [
          { assignedToId: user.id },
          {
            assignedToRoleId: { in: roleIds },
            status: { not: "CANCELLED" },
            OR: [{ claimedById: null }, { claimedById: user.id }],
          },
        ],
      },
      include: TASK_INCLUDE,
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    });
  }

  private async requireVisible(id: string, user: AuthenticatedUser) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Task not found");
    if (task.assignedToId === user.id || user.permissions.includes("task.manage")) return task;
    if (task.assignedToRoleId) {
      const roleIds = await this.myRoleIds(user.id);
      if (roleIds.includes(task.assignedToRoleId)) return task;
    }
    throw new NotFoundException("Task not found");
  }

  async updateStatus(id: string, dto: UpdateTaskStatusDto, user: AuthenticatedUser) {
    const task = await this.requireVisible(id, user);
    const allowed = ALLOWED_TRANSITIONS[task.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new ConflictException(`Cannot move a task from ${task.status} to ${dto.status}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.task.updateMany({
        where: { id, status: task.status },
        data: {
          status: dto.status,
          // The first person (in a role broadcast) to act claims it, so it
          // stops appearing as unclaimed to the rest of the role.
          claimedById: task.claimedById ?? user.id,
        },
      });
      if (result.count === 0) {
        throw new ConflictException("This task's status changed since it was read");
      }
      await tx.taskStatusHistory.create({
        data: { taskId: id, fromStatus: task.status, toStatus: dto.status, changedById: user.id },
      });
      await this.auditService.log(
        {
          ...this.actor(user),
          action: "TASK_STATUS_CHANGED",
          entityId: id,
          oldValue: { status: task.status },
          newValue: { status: dto.status },
        },
        tx,
      );
      return tx.task.findUniqueOrThrow({ where: { id }, include: TASK_INCLUDE });
    });
  }
}
