import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { PrismaService } from "../prisma/prisma.service";
import { NOTIFY_EVENT, NotifyEvent } from "../common/notify";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // Fired by any service via emitNotification(); a failure here must never
  // affect the business operation that raised it.
  @OnEvent(NOTIFY_EVENT, { async: true })
  async handle(event: NotifyEvent) {
    try {
      const recipients = new Set(event.userIds ?? []);
      if (event.permission) {
        const holders = await this.prisma.user.findMany({
          where: {
            isActive: true,
            roles: { some: { role: { permissions: { some: { permission: { key: event.permission } } } } } },
          },
          select: { id: true },
        });
        holders.forEach((u) => recipients.add(u.id));
      }
      if (event.excludeUserId) recipients.delete(event.excludeUserId);

      for (const userId of recipients) {
        const notification = await this.prisma.notification.create({
          data: { userId, type: event.type, title: event.title, body: event.body, titleAr: event.titleAr, bodyAr: event.bodyAr, link: event.link },
        });
        this.eventEmitter.emit("notification.created", { userId, notification });
      }
    } catch (error) {
      this.logger.error(`Notification ${event.type} failed: ${error}`);
    }
  }

  async list(userId: string, options: { unreadOnly?: boolean; page?: number; limit?: number }) {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const where = { userId, ...(options.unreadOnly ? { readAt: null } : {}) };
    const [data, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { data, total, unread };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    return { success: true };
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }
}
