import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";

export class RequestApprovalDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  scheduleId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  machineId!: string;

  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
