import { ApiProperty } from "@nestjs/swagger";
import { PrescriptionStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class ListPharmacyQueueQueryDto {
  @ApiProperty({ enum: PrescriptionStatus, required: false, nullable: true })
  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;
}
