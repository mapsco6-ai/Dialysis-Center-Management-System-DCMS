import { IsNotEmpty, IsString } from "class-validator";

export class InterruptSessionDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
