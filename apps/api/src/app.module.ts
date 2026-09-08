import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
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
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
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
  ],
  controllers: [HealthController],
})
export class AppModule {}
