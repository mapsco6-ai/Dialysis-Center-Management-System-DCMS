import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, Matches } from "class-validator";

export class VerifyPinDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ type: String, pattern: "^\\d{4,6}$" })
  @Matches(/^\d{4,6}$/, { message: "pin must be 4 to 6 digits" })
  pin!: string;
}
