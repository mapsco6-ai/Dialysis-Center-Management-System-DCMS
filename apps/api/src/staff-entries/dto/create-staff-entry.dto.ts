import { ApiProperty } from "@nestjs/swagger";
import { ComplaintSource, IncidentSeverity, StaffEntryType } from "@prisma/client";
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateStaffEntryDto {
  @ApiProperty({ enum: StaffEntryType }) @IsEnum(StaffEntryType) type!: StaffEntryType;
  @ApiProperty({ type: String }) @IsString() @IsNotEmpty() title!: string;
  @ApiProperty({ type: String }) @IsString() @IsNotEmpty() body!: string;
  @ApiProperty({ type: String, required: false, description: "equipment, patient, colleague, stock, environment..." })
  @IsOptional() @IsString() category?: string;
  @ApiProperty({ enum: IncidentSeverity, required: false }) @IsOptional() @IsEnum(IncidentSeverity) severity?: IncidentSeverity;
  @ApiProperty({ type: String, required: false, format: "uuid" }) @IsOptional() @IsUUID() shiftId?: string;
  @ApiProperty({ type: String, required: false, format: "uuid" }) @IsOptional() @IsUUID() patientId?: string;
  @ApiProperty({ type: String, required: false, format: "uuid" }) @IsOptional() @IsUUID() sessionId?: string;
  @ApiProperty({ type: String, required: false, format: "uuid" }) @IsOptional() @IsUUID() machineId?: string;
  @ApiProperty({ enum: ComplaintSource, required: false, description: "Only meaningful for COMPLAINT" })
  @IsOptional() @IsEnum(ComplaintSource) complaintSource?: ComplaintSource;
  @ApiProperty({ type: Boolean, required: false, description: "Hide from everyone except the author and reviewers" })
  @IsOptional() @IsBoolean() isConfidential?: boolean;
}
