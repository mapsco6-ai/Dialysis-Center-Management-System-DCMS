import type { EventEmitter2 } from "@nestjs/event-emitter";

export const NOTIFY_EVENT = "notify";

// Recipients: explicit users and/or everyone holding a permission.
export interface NotifyEvent {
  userIds?: string[];
  permission?: string;
  excludeUserId?: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

export const emitNotification = (emitter: EventEmitter2, event: NotifyEvent) => emitter.emit(NOTIFY_EVENT, event);
