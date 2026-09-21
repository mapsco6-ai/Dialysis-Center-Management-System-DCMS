import { ApiProperty } from "@nestjs/swagger";
import { IncidentType, StaffEntryStatus } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class UpdateStaffEntryStatusDto {
  @ApiProperty({ enum: StaffEntryStatus }) @IsEnum(StaffEntryStatus) status!: StaffEntryStatus;
  @ApiProperty({ type: String, required: false, description: "Required when rejecting" }) @IsOptional() @IsString() @IsNotEmpty() reason?: string;
  @ApiProperty({ type: String, required: false, description: "Management reply, visible to the author" }) @IsOptional() @IsString() @IsNotEmpty() response?: string;
}

export class AssignStaffEntryDto {
  @ApiProperty({ type: String, format: "uuid" }) @IsUUID() assignedToId!: string;
}

export class EscalateStaffEntryDto {
  @ApiProperty({ enum: IncidentType }) @IsEnum(IncidentType) incidentType!: IncidentType;
}
