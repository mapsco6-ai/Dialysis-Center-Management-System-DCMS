import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PharmacyService } from "./pharmacy.service";
import { PharmacyController } from "./pharmacy.controller";
import { MedicationHistoryController } from "./medication-history.controller";

@Module({
  imports: [AuditModule, InventoryModule],
  controllers: [PharmacyController, MedicationHistoryController],
  providers: [PharmacyService],
  // Phase 14 (Reports) reuses medicationHistory() directly rather than
  // re-deriving the same Prescribed->Dispensed->Administered join.
  exports: [PharmacyService],
})
export class PharmacyModule {}
