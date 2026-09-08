import { Weekday } from "@prisma/client";

const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

// All schedule dates are normalized to UTC midnight so a "day" means the same
// thing regardless of the server's local timezone.
export function toDateOnly(input: string | Date): Date {
  const source = typeof input === "string" ? new Date(input) : input;
  return new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
}

// Deliberately uses local getters (not getUTC*): "today" must mean the
// center's calendar day (server is expected to run in the center's local
// timezone), not whatever day it currently is in UTC. Using UTC here would
// make the schedule flip to the wrong day for several hours around midnight
// in any timezone ahead of UTC.
export function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[date.getUTCDay()];
}
