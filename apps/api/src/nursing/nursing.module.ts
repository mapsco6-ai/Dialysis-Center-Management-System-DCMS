import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuditModule } from "../audit/audit.module";
import { LoginRateLimiterService } from "../auth/login-rate-limiter.service";
import { AssignmentsService } from "./assignments.service";
import { AssignmentsController } from "./assignments.controller";
import { WardDashboardService } from "./ward-dashboard.service";
import { WardDashboardController } from "./ward-dashboard.controller";
import { PinService } from "./pin.service";
import { PinController } from "./pin.controller";
import { PinProofService } from "./pin-proof.service";

@Module({
  imports: [
    AuditModule,
    // Deliberately a distinct secret from AuthModule's login JWT (see
    // pin-proof.service.ts) - a PIN proof must never verify as, or be
    // forgeable from, a real login token.
    JwtModule.register({ secret: `${process.env.JWT_SECRET as string}:pin-proof` }),
  ],
  controllers: [AssignmentsController, WardDashboardController, PinController],
  providers: [AssignmentsService, WardDashboardService, PinService, PinProofService, LoginRateLimiterService],
  exports: [AssignmentsService, PinProofService],
})
export class NursingModule {}
