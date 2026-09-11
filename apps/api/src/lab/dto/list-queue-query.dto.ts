import { ApiProperty } from "@nestjs/swagger";
import { LabOrderItemStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class ListQueueQueryDto {
  @ApiProperty({ enum: LabOrderItemStatus, required: false, nullable: true })
  @IsOptional()
  @IsEnum(LabOrderItemStatus)
  status?: LabOrderItemStatus;
}
