import { LabOrderItemStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class ListQueueQueryDto {
  @IsOptional()
  @IsEnum(LabOrderItemStatus)
  status?: LabOrderItemStatus;
}
