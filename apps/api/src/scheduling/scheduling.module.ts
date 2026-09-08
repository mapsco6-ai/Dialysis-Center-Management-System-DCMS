import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { SchedulingService } from "./scheduling.service";
import { ShiftsService } from "./shifts.service";
import { DialysisPlanController } from "./dialysis-plan.controller";
import { ScheduleController } from "./schedule.controller";
import { SessionsController } from "./sessions.controller";
import { ShiftsController } from "./shifts.controller";

@Module({
  imports: [AuditModule],
  controllers: [DialysisPlanController, ScheduleController, SessionsController, ShiftsController],
  providers: [SchedulingService, ShiftsService],
  exports: [SchedulingService, ShiftsService],
})
export class SchedulingModule {}
