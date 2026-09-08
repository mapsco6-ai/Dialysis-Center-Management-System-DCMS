import { Transform } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";

export class DeactivateUserDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
