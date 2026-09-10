import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ReportsModule } from "../reports/reports.module";
import { IncidentsService } from "./incidents.service";
import { IncidentsController } from "./incidents.controller";
import { ClinicalAuditService } from "./clinical-audit.service";
import { ClinicalAuditController } from "./clinical-audit.controller";

// Phase 15 (Quality & Safety): docs/PROJECT-PHASES-PLAN.md + docs/MODULES-SPEC.md
// Documentation-only layer - see the schema comment above IncidentReport for
// why nothing here ever triggers an automatic clinical decision.
@Module({
  imports: [AuditModule, ReportsModule],
  controllers: [IncidentsController, ClinicalAuditController],
  providers: [IncidentsService, ClinicalAuditService],
})
export class QualityModule {}
