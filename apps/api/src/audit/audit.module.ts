import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";
import { OversightController } from "./oversight.controller";
import { AuditSealService } from "./audit-seal.service";
import { AccessLogInterceptor } from "../common/interceptors/access-log.interceptor";

@Module({
  controllers: [AuditController, OversightController],
  providers: [AuditService, AuditSealService, { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor }],
  exports: [AuditService, AuditSealService],
})
export class AuditModule {}
