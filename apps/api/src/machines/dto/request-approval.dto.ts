import { Transform } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";

export class RequestApprovalDto {
  @IsString()
  @IsNotEmpty()
  scheduleId!: string;

  @IsString()
  @IsNotEmpty()
  machineId!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
