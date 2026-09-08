import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PatientsModule } from "../patients/patients.module";
import { SchedulingService } from "./scheduling.service";
import { ShiftsService } from "./shifts.service";
import { DialysisPlanController } from "./dialysis-plan.controller";
import { ScheduleController } from "./schedule.controller";
import { SessionsController } from "./sessions.controller";
import { ShiftsController } from "./shifts.controller";
import { ReceptionController } from "./reception.controller";

@Module({
  imports: [AuditModule, PatientsModule],
  controllers: [
    DialysisPlanController,
    ScheduleController,
    SessionsController,
    ShiftsController,
    ReceptionController,
  ],
  providers: [SchedulingService, ShiftsService],
  exports: [SchedulingService, ShiftsService],
})
export class SchedulingModule {}
