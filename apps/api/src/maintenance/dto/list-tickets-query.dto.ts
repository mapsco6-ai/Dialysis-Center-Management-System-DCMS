import { ApiProperty } from "@nestjs/swagger";
import { MaintenanceTicketStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class ListTicketsQueryDto {
  @ApiProperty({ enum: MaintenanceTicketStatus, required: false, nullable: true })
  @IsOptional()
  @IsEnum(MaintenanceTicketStatus)
  status?: MaintenanceTicketStatus;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  machineId?: string;
}
