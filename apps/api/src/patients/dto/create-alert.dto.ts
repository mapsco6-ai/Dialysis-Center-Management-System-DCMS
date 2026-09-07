import { AlertSeverity } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export class CreateAlertDto {
  @IsEnum(AlertSeverity)
  severity!: AlertSeverity;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;
}
