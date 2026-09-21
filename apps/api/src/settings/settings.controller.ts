import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsDefined } from "class-validator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { SettingsService } from "./settings.service";

class SetSettingDto {
  @ApiProperty({ description: "boolean or integer, depending on the setting" })
  @IsDefined()
  value!: unknown;
}

@ApiTags("Settings")
@ApiBearerAuth("bearer")
@Controller("settings")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Every signed-in user may read the switches that change their own screens.
  @Get("public")
  async publicSettings() {
    return { shiftReportRequired: await this.settings.get("shiftReportRequired") };
  }

  @Get()
  @RequirePermissions("settings.manage")
  getAll() {
    return this.settings.getAll();
  }

  @Put(":key")
  @RequirePermissions("settings.manage")
  set(@Param("key") key: string, @Body() dto: SetSettingDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.settings.set(key, dto.value, actor);
  }
}
