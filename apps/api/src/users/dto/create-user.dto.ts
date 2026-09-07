import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleNames!: string[];
}
