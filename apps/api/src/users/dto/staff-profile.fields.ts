import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsEmail, IsOptional, IsString } from "class-validator";

// Optional employment/licensing details, shared by create and update.
export class StaffProfileFields {
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() employeeNo?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() phone?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsEmail() email?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() jobTitle?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() specialty?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() licenseNo?: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() department?: string;
  @ApiProperty({ type: String, required: false, description: "Account stops working after this instant (external inspectors)" })
  @IsOptional() @IsDateString() expiresAt?: string;
}
