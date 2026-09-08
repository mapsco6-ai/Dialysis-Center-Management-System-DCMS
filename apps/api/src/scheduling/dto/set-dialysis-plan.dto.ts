import { Weekday } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsString, ValidateNested } from "class-validator";

class DialysisPlanEntryDto {
  @IsEnum(Weekday)
  weekday!: Weekday;

  @IsString()
  @IsNotEmpty()
  shiftId!: string;
}

export class SetDialysisPlanDto {
  @IsArray()
  @ArrayMinSize(1) // policy: 1-4 sessions/week (docs/MODULES-SPEC.md)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => DialysisPlanEntryDto)
  entries!: DialysisPlanEntryDto[];
}
