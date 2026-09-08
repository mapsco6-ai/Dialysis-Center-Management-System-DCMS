import { IsNotEmpty, IsString } from "class-validator";

export class AmendResultDto {
  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
