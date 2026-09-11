import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class LoginDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
