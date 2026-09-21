import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString } from "class-validator";

export class SetRolesDto {
  @ApiProperty({ type: () => [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleNames!: string[];

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
