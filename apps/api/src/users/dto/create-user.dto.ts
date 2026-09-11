import { ApiProperty } from "@nestjs/swagger";
import { ArrayNotEmpty, IsArray, IsNotEmpty, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ type: String, minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  fullName!: string;

  @ApiProperty({ type: () => [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleNames!: string[];
}
