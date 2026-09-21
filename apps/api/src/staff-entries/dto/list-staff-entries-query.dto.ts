import { ApiProperty } from "@nestjs/swagger";
import { StaffEntryStatus, StaffEntryType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class ListStaffEntriesQueryDto {
  @ApiProperty({ enum: StaffEntryType, required: false }) @IsOptional() @IsEnum(StaffEntryType) type?: StaffEntryType;
  @ApiProperty({ enum: StaffEntryStatus, required: false }) @IsOptional() @IsEnum(StaffEntryStatus) status?: StaffEntryStatus;
  @ApiProperty({ type: String, required: false, format: "uuid" }) @IsOptional() @IsUUID() authorId?: string;
  @ApiProperty({ type: String, required: false, format: "uuid" }) @IsOptional() @IsUUID() patientId?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsDateString() from?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsDateString() to?: string;
  @ApiProperty({ type: "integer", required: false, minimum: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiProperty({ type: "integer", required: false, minimum: 1, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
