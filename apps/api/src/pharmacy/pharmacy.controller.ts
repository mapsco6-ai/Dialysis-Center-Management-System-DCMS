import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PharmacyService } from "./pharmacy.service";
import { TransferToPharmacyDto } from "./dto/transfer-to-pharmacy.dto";
import { DispensePrescriptionDto } from "./dto/dispense-prescription.dto";
import { ListPharmacyQueueQueryDto } from "./dto/list-pharmacy-queue-query.dto";

@Controller("pharmacy")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Post("stock/transfer-in")
  @RequirePermissions("inventory.manage")
  transferToPharmacy(@Body() dto: TransferToPharmacyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.pharmacyService.transferToPharmacy(dto, actor);
  }

  @Get("queue")
  @RequirePermissions("pharmacy.dispense")
  listQueue(@Query() query: ListPharmacyQueueQueryDto) {
    return this.pharmacyService.listQueue(query.status);
  }

  @Post("prescriptions/:id/start-dispensing")
  @RequirePermissions("pharmacy.dispense")
  startDispensing(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.pharmacyService.startDispensing(id, actor);
  }

  @Post("prescriptions/:id/dispense")
  @RequirePermissions("pharmacy.dispense")
  dispense(@Param("id") id: string, @Body() dto: DispensePrescriptionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.pharmacyService.dispense(id, dto, actor);
  }
}
