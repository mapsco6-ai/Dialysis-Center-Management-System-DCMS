import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { RequireAnyPermission } from "../common/decorators/require-any-permission.decorator";
import { LabCatalogService } from "./lab-catalog.service";
import { CreateLabTestDto } from "./dto/create-lab-test.dto";
import { CreateLabPanelDto } from "./dto/create-lab-panel.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";

@ApiTags("Lab - Catalog")
@ApiBearerAuth("bearer")
@Controller("lab")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabCatalogController {
  constructor(private readonly labCatalogService: LabCatalogService) {}

  @Post("tests")
  @RequirePermissions("lab.catalog.manage")
  createTest(@Body() dto: CreateLabTestDto) {
    return this.labCatalogService.createTest(dto);
  }

  @Get("tests")
  @RequireAnyPermission("lab.catalog.manage", "lab.request", "lab.queue.view")
  listTests() {
    return this.labCatalogService.listTests();
  }

  @Post("panels")
  @RequirePermissions("lab.catalog.manage")
  createPanel(@Body() dto: CreateLabPanelDto) {
    return this.labCatalogService.createPanel(dto);
  }

  @Get("panels")
  @RequireAnyPermission("lab.catalog.manage", "lab.request", "lab.queue.view")
  listPanels() {
    return this.labCatalogService.listPanels();
  }
}
