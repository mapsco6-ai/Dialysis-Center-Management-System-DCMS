import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class CreateWardDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
