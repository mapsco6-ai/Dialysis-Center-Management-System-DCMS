import { Global, Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { SettingsService } from "./settings.service";
import { SettingsController } from "./settings.controller";

// Global: AuthService (logout rule) and the audit retention report read it.
@Global()
@Module({
  imports: [AuditModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
