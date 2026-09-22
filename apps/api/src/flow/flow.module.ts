import { Controller, Get, Injectable, Module, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { DialysisSessionStatus, ScheduleStatus } from "@prisma/client";
import { IsOptional, IsUUID } from "class-validator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { SchedulingModule } from "../scheduling/scheduling.module";
import { SchedulingService } from "../scheduling/scheduling.service";

// The patient's day as one journey instead of one screen per department:
// arrival -> pre-dialysis -> supplies -> machine -> dialysis -> discharge.
export const FLOW_STEPS = ["arrival", "pre", "supplies", "machine", "dialysis", "discharge"] as const;
export type FlowStep = (typeof FLOW_STEPS)[number];
type StepState = "done" | "current" | "todo";

// What the person standing at the bed should do next, and the permission that
// action needs (the API decides; the UI just renders the button).
const ACTIONS: Record<string, { permission: string }> = {
  "check-in": { permission: "attendance.checkin" },
  "record-pre-dialysis": { permission: "dialysis.pre.record" },
  "confirm-supplies": { permission: "dialysis.pre.record" },
  "assign-machine": { permission: "machine.assign" },
  "start-dialysis": { permission: "dialysis.start" },
  "resume-dialysis": { permission: "dialysis.start" },
  "record-readings": { permission: "dialysis.reading.create" },
  "end-dialysis": { permission: "dialysis.end" },
  discharge: { permission: "dialysis.end" },
};

const PAST_SUPPLIES: DialysisSessionStatus[] = ["SUPPLIES_READY", "WAITING_MACHINE", "ASSIGNED", "IN_DIALYSIS", "POST_DIALYSIS", "COMPLETED", "DISCHARGED", "INTERRUPTED"];
const PAST_MACHINE: DialysisSessionStatus[] = ["ASSIGNED", "IN_DIALYSIS", "POST_DIALYSIS", "COMPLETED", "DISCHARGED", "INTERRUPTED"];
const PAST_DIALYSIS: DialysisSessionStatus[] = ["POST_DIALYSIS", "COMPLETED", "DISCHARGED"];
const CLOSED_SCHEDULE: ScheduleStatus[] = ["CANCELLED", "RESCHEDULED"];

interface Input {
  scheduleStatus: ScheduleStatus;
  sessionStatus: DialysisSessionStatus | null;
  hasMachine: boolean;
}

// Pure so it can be unit-checked: which step is current and what is next.
export function deriveFlow({ scheduleStatus, sessionStatus, hasMachine }: Input) {
  if (CLOSED_SCHEDULE.includes(scheduleStatus)) {
    return { steps: FLOW_STEPS.map((key) => ({ key, state: "todo" as StepState })), current: null, action: null, attention: null };
  }
  const arrived = sessionStatus !== null || scheduleStatus === "ARRIVED" || scheduleStatus === "LATE";
  const done: Record<FlowStep, boolean> = {
    arrival: arrived,
    pre: sessionStatus !== null,
    supplies: sessionStatus !== null && PAST_SUPPLIES.includes(sessionStatus),
    machine: sessionStatus !== null && PAST_MACHINE.includes(sessionStatus) && (hasMachine || sessionStatus !== "ASSIGNED"),
    dialysis: sessionStatus !== null && PAST_DIALYSIS.includes(sessionStatus),
    discharge: sessionStatus === "DISCHARGED",
  };
  const current = FLOW_STEPS.find((key) => !done[key]) ?? null;
  const steps = FLOW_STEPS.map((key) => ({ key, state: (done[key] ? "done" : key === current ? "current" : "todo") as StepState }));

  let action: string | null = null;
  if (current === "arrival") action = "check-in";
  else if (current === "pre") action = "record-pre-dialysis";
  else if (current === "supplies") action = "confirm-supplies";
  else if (current === "machine") action = "assign-machine";
  else if (current === "dialysis") action = sessionStatus === "IN_DIALYSIS" ? "record-readings" : sessionStatus === "INTERRUPTED" ? "resume-dialysis" : "start-dialysis";
  else if (current === "discharge") action = "discharge";

  const attention =
    sessionStatus === "INTERRUPTED" ? "INTERRUPTED"
    : sessionStatus === "WAITING_MACHINE" ? "WAITING_MACHINE"
    : !arrived && scheduleStatus === "ABSENT" ? "ABSENT"
    : !arrived && scheduleStatus === "SCHEDULED" ? null
    : null;
  return { steps, current, action, attention };
}

@Injectable()
export class FlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduling: SchedulingService,
  ) {}

  async today(user: AuthenticatedUser, shiftId?: string) {
    // Same call the daily schedule makes: generates today's rows and marks absences.
    const schedules = await this.scheduling.getScheduleForToday();
    const rows = shiftId ? schedules.filter((s) => s.shiftId === shiftId) : schedules;
    const sessions = await this.prisma.dialysisSession.findMany({
      where: { scheduleId: { in: rows.map((r) => r.id) } },
      select: { scheduleId: true, status: true, machineId: true, updatedAt: true, machine: { select: { machineCode: true } } },
    });
    const bySchedule = new Map(sessions.map((s) => [s.scheduleId, s]));
    const now = Date.now();

    const items = rows.map((schedule) => {
      const session = bySchedule.get(schedule.id) ?? null;
      const flow = deriveFlow({ scheduleStatus: schedule.status, sessionStatus: session?.status ?? null, hasMachine: Boolean(session?.machineId ?? schedule.machineId) });
      const allowed = flow.action !== null && user.permissions.includes(ACTIONS[flow.action].permission);
      const since = session?.updatedAt ?? schedule.checkInTime;
      return {
        appointmentId: schedule.id,
        patient: { id: schedule.patient.id, patientCode: schedule.patient.patientCode, fullName: schedule.patient.fullName },
        shift: { id: schedule.shift.id, name: schedule.shift.name },
        type: schedule.type,
        scheduleStatus: schedule.status,
        lateMinutes: schedule.lateMinutes,
        sessionStatus: session?.status ?? null,
        machineCode: session?.machine?.machineCode ?? null,
        steps: flow.steps,
        current: flow.current,
        attention: flow.attention ?? (schedule.status === "LATE" ? "LATE" : null),
        nextAction: flow.action ? { key: flow.action, permission: ACTIONS[flow.action].permission, allowed } : null,
        // How long the patient has been at this stage (drives "who waits longest").
        minutesInStep: since ? Math.max(0, Math.round((now - since.getTime()) / 60_000)) : null,
      };
    });

    // Needs-attention first, then furthest-along last so the front of the list is what needs hands.
    const rank = (i: (typeof items)[number]) => (i.attention === "INTERRUPTED" ? 0 : i.attention === "WAITING_MACHINE" ? 1 : i.attention === "ABSENT" || i.attention === "LATE" ? 2 : i.current === null ? 9 : 3);
    items.sort((a, b) => rank(a) - rank(b) || (b.minutesInStep ?? 0) - (a.minutesInStep ?? 0));

    const byStep: Record<string, number> = {};
    for (const item of items) byStep[item.current ?? "closed"] = (byStep[item.current ?? "closed"] ?? 0) + 1;
    return { generatedAt: new Date(), total: items.length, byStep, needsAttention: items.filter((i) => i.attention).length, items };
  }
}

class FlowQuery {
  @ApiProperty({ type: String, required: false, format: "uuid" })
  @IsOptional()
  @IsUUID()
  shiftId?: string;
}

@ApiTags("Flow")
@ApiBearerAuth("bearer")
@Controller("flow")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FlowController {
  constructor(private readonly service: FlowService) {}

  @Get("today")
  @RequireAnyPermission("scheduling.manage", "attendance.checkin", "dialysis.session.view", "nursing.ward.view")
  today(@CurrentUser() user: AuthenticatedUser, @Query() query: FlowQuery) {
    return this.service.today(user, query.shiftId);
  }
}

@Module({ imports: [SchedulingModule], controllers: [FlowController], providers: [FlowService] })
export class FlowModule {}
