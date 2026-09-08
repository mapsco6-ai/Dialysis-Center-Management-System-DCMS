import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { LoginRateLimiterService } from "../auth/login-rate-limiter.service";
import { AssignmentsService } from "./assignments.service";
import { AssignmentsController } from "./assignments.controller";
import { WardDashboardService } from "./ward-dashboard.service";
import { WardDashboardController } from "./ward-dashboard.controller";
import { PinService } from "./pin.service";
import { PinController } from "./pin.controller";

@Module({
  imports: [AuditModule],
  controllers: [AssignmentsController, WardDashboardController, PinController],
  providers: [AssignmentsService, WardDashboardService, PinService, LoginRateLimiterService],
  exports: [AssignmentsService],
})
export class NursingModule {}
