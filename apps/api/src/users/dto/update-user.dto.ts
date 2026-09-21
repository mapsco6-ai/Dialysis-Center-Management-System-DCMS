import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";
import { StaffProfileFields } from "./staff-profile.fields";

export class UpdateUserDto extends StaffProfileFields {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;
}
