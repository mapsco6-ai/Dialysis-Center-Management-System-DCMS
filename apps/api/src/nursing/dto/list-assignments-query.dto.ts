import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ListAssignmentsQueryDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  wardId!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  shiftId?: string;

  @ApiProperty({ type: String })
  @IsDateString()
  date!: string;
}
