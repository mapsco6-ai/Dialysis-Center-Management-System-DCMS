import { ApiProperty } from "@nestjs/swagger";
import { DoctorOrderType } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

// payload's exact shape depends on `type` - validated in DoctorOrdersService
// (docs/MODULES-SPEC.md: "payload JSON - تفاصيل حسب النوع") since each of
// the six order types needs genuinely different required fields.
export class CreateDoctorOrderDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ enum: DoctorOrderType })
  @IsEnum(DoctorOrderType)
  type!: DoctorOrderType;

  @ApiProperty({ type: "object", additionalProperties: true, description: "Fields depend on type. MEDICATION: medicationName, dose, frequency. DRY_WEIGHT_CHANGE: numeric newDryWeight. NURSING_INSTRUCTION: instruction. LAB_REQUEST: details plus labTestIds and/or labPanelId; requires lab.request permission. Other request types: details." })
  @IsObject()
  payload!: Record<string, unknown>;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;
}
