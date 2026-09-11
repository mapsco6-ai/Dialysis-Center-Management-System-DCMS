import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class InterruptSessionDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
