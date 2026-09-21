import { ApiProperty } from "@nestjs/swagger";
import { AccessRecordStatus, VascularAccessType } from "@prisma/client";
import { IsBoolean, IsDateString, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateAccessRecordDto {
  @ApiProperty({ enum: VascularAccessType }) @IsEnum(VascularAccessType) type!: VascularAccessType;
  @ApiProperty({ type: String }) @IsString() @IsNotEmpty() location!: string;
  @ApiProperty({ type: String }) @IsDateString() placedAt!: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() notes?: string;
}

export class UpdateAccessRecordDto {
  @ApiProperty({ enum: ["REMOVED", "FAILED"] }) @IsIn(["REMOVED", "FAILED"]) status!: Extract<AccessRecordStatus, "REMOVED" | "FAILED">;
  @ApiProperty({ type: String }) @IsDateString() removedAt!: string;
  @ApiProperty({ type: String }) @IsString() @IsNotEmpty() reason!: string;
}

export class SetRestrictedDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() restricted!: boolean;
  @ApiProperty({ type: String }) @IsString() @IsNotEmpty() reason!: string;
}
