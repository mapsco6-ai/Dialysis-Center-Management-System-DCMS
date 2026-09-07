import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { GlobalPassportModule } from "./common/global-passport.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { RolesModule } from "./roles/roles.module";
import { AuditModule } from "./audit/audit.module";
import { PatientsModule } from "./patients/patients.module";
import { HealthController } from "./health/health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GlobalPassportModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    RolesModule,
    AuditModule,
    PatientsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
