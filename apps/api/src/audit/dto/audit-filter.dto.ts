import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, Min } from "class-validator";

// Shared filter for the oversight views (search, per-user activity, export).
export class AuditFilterDto {
  @ApiProperty({ type: String, required: false, format: "uuid" }) @IsOptional() @IsUUID() actorId?: string;
  @ApiProperty({ type: String, required: false, format: "uuid" }) @IsOptional() @IsUUID() patientId?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() action?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() entityType?: string;
  @ApiProperty({ type: String, required: false, description: "ISO date/time, inclusive" }) @IsOptional() @IsDateString() from?: string;
  @ApiProperty({ type: String, required: false, description: "ISO date/time, inclusive" }) @IsOptional() @IsDateString() to?: string;

  @ApiProperty({ type: "integer", required: false, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiProperty({ type: "integer", required: false, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
