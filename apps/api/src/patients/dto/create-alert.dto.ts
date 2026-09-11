import { ApiProperty } from "@nestjs/swagger";
import { AlertSeverity } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";

export class CreateAlertDto {
  @ApiProperty({ enum: AlertSeverity })
  @IsEnum(AlertSeverity)
  severity!: AlertSeverity;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  message!: string;
}
