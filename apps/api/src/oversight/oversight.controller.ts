import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiProperty, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PermissionsGuard } from "../common/guards/permissions.guard";
import { RequirePermissions } from "../common/decorators/require-permissions.decorator";
import { LogAccess } from "../common/decorators/log-access.decorator";
import { OversightService } from "./oversight.service";

class RangeQuery {
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsDateString() from?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsDateString() to?: string;
}

class TimelineQuery extends RangeQuery {
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() type?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() module?: string;
  @ApiProperty({ type: "integer", required: false }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiProperty({ type: "integer", required: false }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

// The only surface the committee/health-authority account has.
@ApiTags("Oversight")
@ApiBearerAuth("bearer")
@Controller("oversight")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions("oversight.view")
@LogAccess("OVERSIGHT_VIEWED")
export class OversightController {
  constructor(private readonly service: OversightService) {}

  @Get("summary")
  summary(@Query() query: RangeQuery) {
    return this.service.summary(query.from, query.to);
  }

  @Get("timeline")
  timeline(@Query() query: TimelineQuery) {
    return this.service.timeline(query);
  }
}
