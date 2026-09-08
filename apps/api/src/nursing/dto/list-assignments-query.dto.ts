import { IsDateString, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class ListAssignmentsQueryDto {
  @IsString()
  @IsNotEmpty()
  wardId!: string;

  @IsOptional()
  @IsString()
  shiftId?: string;

  @IsDateString()
  date!: string;
}
