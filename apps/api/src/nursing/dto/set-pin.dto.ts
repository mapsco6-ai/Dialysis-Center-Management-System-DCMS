import { Matches } from "class-validator";

export class SetPinDto {
  @Matches(/^\d{4,6}$/, { message: "pin must be 4 to 6 digits" })
  pin!: string;
}
