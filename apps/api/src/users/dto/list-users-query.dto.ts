import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListUsersQueryDto {
  @ApiProperty({ type: String, required: false, description: "Matches name, username, employee no." })
  @IsOptional() @IsString() search?: string;

  @ApiProperty({ type: String, required: false }) @IsOptional() @IsString() role?: string;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @Transform(({ value }) => (value === "true" ? true : value === "false" ? false : value))
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: "integer", required: false, minimum: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;

  @ApiProperty({ type: "integer", required: false, minimum: 1, maximum: 100 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
