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

// dateOnly stores a calendar day as UTC midnight (see toDateOnly/todayDateOnly
// above); combining it with a shift's "HH:MM" must reconstruct a real,
// comparable-to-`new Date()` moment in the server's LOCAL time (which is
// expected to be the center's timezone) - not re-apply UTC, or every
// comparison against "now" would be off by the UTC offset.
export function combineLocalDateAndTime(dateOnly: Date, hhmm: string): Date {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return new Date(
    dateOnly.getUTCFullYear(),
    dateOnly.getUTCMonth(),
    dateOnly.getUTCDate(),
    hours,
    minutes,
    0,
    0,
  );
}
