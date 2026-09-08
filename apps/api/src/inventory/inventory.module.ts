import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { InventoryItemsService } from "./inventory-items.service";
import { InventoryItemsController } from "./inventory-items.controller";
import { PatientSupplyProfileService } from "./patient-supply-profile.service";
import { PatientSupplyProfileController } from "./patient-supply-profile.controller";
import { SessionSuppliesService } from "./session-supplies.service";
import { SessionSuppliesController } from "./session-supplies.controller";

@Module({
  imports: [AuditModule],
  controllers: [InventoryItemsController, PatientSupplyProfileController, SessionSuppliesController],
  providers: [InventoryItemsService, PatientSupplyProfileService, SessionSuppliesService],
  exports: [InventoryItemsService, PatientSupplyProfileService, SessionSuppliesService],
})
export class InventoryModule {}
