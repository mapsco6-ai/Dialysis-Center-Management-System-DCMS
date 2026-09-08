import { DialysisEventType } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class CreateEventDto {
  @IsEnum(DialysisEventType)
  type!: DialysisEventType;

  @IsOptional()
  @IsString()
  note?: string;
}
