import { ApiProperty } from "@nestjs/swagger";
import { Matches } from "class-validator";

export class SetPinDto {
  @ApiProperty({ type: String, pattern: "^\\d{4,6}$" })
  @Matches(/^\d{4,6}$/, { message: "pin must be 4 to 6 digits" })
  pin!: string;
}
