import { Transform } from "class-transformer";
import { IsOptional, IsString } from "class-validator";

export class ResolveAlertDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  reason?: string;
}
