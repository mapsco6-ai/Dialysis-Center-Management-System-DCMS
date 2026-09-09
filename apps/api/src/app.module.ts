import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { validateEnv } from "./config/env.validation";
import { PrismaModule } from "./prisma/prisma.module";
import { GlobalPassportModule } from "./common/global-passport.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { RolesModule } from "./roles/roles.module";
import { AuditModule } from "./audit/audit.module";
import { PatientsModule } from "./patients/patients.module";
import { SchedulingModule } from "./scheduling/scheduling.module";
import { InventoryModule } from "./inventory/inventory.module";
import { MachinesModule } from "./machines/machines.module";
import { SessionsModule } from "./sessions/sessions.module";
import { NursingModule } from "./nursing/nursing.module";
import { DoctorModule } from "./doctor/doctor.module";
import { LabModule } from "./lab/lab.module";
import { PharmacyModule } from "./pharmacy/pharmacy.module";
import { MaintenanceModule } from "./maintenance/maintenance.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { ReportsModule } from "./reports/reports.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global (EventEmitterModule marks itself @Global()) - lets any service
    // emit a "live.update" event for DashboardGateway to broadcast, without
    // every phase's module needing to import DashboardModule directly
    // (docs/PROJECT-PHASES-PLAN.md Phase 13: WebSocket layer, no new
    // cross-module coupling into the already-built phases).
    EventEmitterModule.forRoot(),
    GlobalPassportModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    AuditModule,
    PatientsModule,
    SchedulingModule,
    InventoryModule,
    MachinesModule,
    SessionsModule,
    NursingModule,
    DoctorModule,
    LabModule,
    PharmacyModule,
    MaintenanceModule,
    DashboardModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
