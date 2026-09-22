import { Controller, Get, Module, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { TasksModule } from "../tasks/tasks.module";
import { TasksService } from "../tasks/tasks.service";

interface WorkItem {
  key: string;
  count: number;
  link: string;
}

// "What is waiting for me": counts limited to the sections this user's
// permissions actually open, so each role's landing view is its own to-do.
@ApiTags("Me")
@ApiBearerAuth("bearer")
@Controller("me")
@UseGuards(JwtAuthGuard)
export class WorkQueueController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
  ) {}

  @Get("work-queue")
  async workQueue(@CurrentUser() user: AuthenticatedUser): Promise<{ items: WorkItem[] }> {
    const can = (permission: string) => user.permissions.includes(permission);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86_400_000);

    const jobs: [string, string, boolean, () => Promise<number>][] = [
      ["unreadNotifications", "/admin", true, () => this.prisma.notification.count({ where: { userId: user.id, readAt: null } })],
      ["myOpenTasks", "/admin/me/calendar", true, async () => (await this.tasksService.listMine(user)).filter((task) => task.status === "OPEN" || task.status === "IN_PROGRESS").length],
      ["openTasksToManage", "/admin/people/staff", can("task.manage"), () => this.prisma.task.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } })],
      ["myOpenEntries", "/admin/people/entries", can("entry.create"), () => this.prisma.staffEntry.count({ where: { authorId: user.id, status: { in: ["SUBMITTED", "ACKNOWLEDGED", "IN_PROGRESS"] } } })],
      ["entriesToReview", "/admin/people/entries", can("entry.review"), () => this.prisma.staffEntry.count({ where: { status: { in: ["SUBMITTED", "ACKNOWLEDGED", "IN_PROGRESS"] } } })],
      ["prescriptionsToDispense", "/admin/care/pharmacy", can("pharmacy.dispense"), () => this.prisma.prescription.count({ where: { status: { in: ["ACTIVE", "DISPENSING"] } } })],
      ["labItemsPending", "/admin/care/lab", can("lab.queue.view"), () => this.prisma.labOrderItem.count({ where: { status: { in: ["ORDERED", "SAMPLE_COLLECTED", "PROCESSING"] } } })],
      ["openMaintenanceTickets", "/admin/facility/maintenance", can("maintenance.manage"), () => this.prisma.maintenanceTicket.count({ where: { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_PART"] } } })],
      ["transfersAwaitingApproval", "/admin/facility/inventory", can("inventory.transfer.approve"), () => this.prisma.stockTransfer.count({ where: { status: "REQUESTED" } })],
      ["openIncidents", "/admin/governance/quality", can("incident.review"), () => this.prisma.incidentReport.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW", "ACTION_REQUIRED"] } } })],
      ["patientsToCheckIn", "/admin/care/reception", can("attendance.checkin"), () => this.prisma.dialysisSchedule.count({ where: { scheduledDate: { gte: today, lt: tomorrow }, status: { in: ["SCHEDULED", "LATE"] } } })],
    ];

    const items = await Promise.all(
      jobs.filter(([, , allowed]) => allowed).map(async ([key, link, , count]) => ({ key, link, count: await count() })),
    );
    return { items };
  }
}

@Module({ imports: [TasksModule], controllers: [WorkQueueController] })
export class WorkQueueModule {}
