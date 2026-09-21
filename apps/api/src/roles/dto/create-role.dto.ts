import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, Matches } from "class-validator";

export class CreateRoleDto {
  @ApiProperty({ type: String, example: "ICU_NURSE" })
  @Matches(/^[A-Z][A-Z0-9_]{2,39}$/, { message: "name must be UPPER_SNAKE_CASE (3-40 chars)" })
  name!: string;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  description?: string;
}
