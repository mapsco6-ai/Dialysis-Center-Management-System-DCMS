import { DoctorOrderType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

// payload's exact shape depends on `type` - validated in DoctorOrdersService
// (docs/MODULES-SPEC.md: "payload JSON - تفاصيل حسب النوع") since each of
// the six order types needs genuinely different required fields.
export class CreateDoctorOrderDto {
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @IsEnum(DoctorOrderType)
  type!: DoctorOrderType;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  reason?: string;
}
