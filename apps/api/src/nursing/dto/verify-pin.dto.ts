import { IsNotEmpty, IsString, Matches } from "class-validator";

export class VerifyPinDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @Matches(/^\d{4,6}$/, { message: "pin must be 4 to 6 digits" })
  pin!: string;
}
