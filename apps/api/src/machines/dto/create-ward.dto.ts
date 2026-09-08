import { IsNotEmpty, IsString } from "class-validator";

export class CreateWardDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
