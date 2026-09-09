import { MaintenanceTicketStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class ListTicketsQueryDto {
  @IsOptional()
  @IsEnum(MaintenanceTicketStatus)
  status?: MaintenanceTicketStatus;

  @IsOptional()
  @IsString()
  machineId?: string;
}
