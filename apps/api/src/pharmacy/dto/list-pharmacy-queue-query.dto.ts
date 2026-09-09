import { PrescriptionStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class ListPharmacyQueueQueryDto {
  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;
}
