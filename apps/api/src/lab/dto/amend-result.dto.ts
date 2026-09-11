import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class AmendResultDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  value!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
