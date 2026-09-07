import { IsNotEmpty, IsString } from "class-validator";

export class DeactivateUserDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
