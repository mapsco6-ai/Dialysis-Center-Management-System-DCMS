import { ApiProperty } from "@nestjs/swagger";
import { Weekday } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsNotEmpty, IsString, ValidateNested } from "class-validator";

class DialysisPlanEntryDto {
  @ApiProperty({ enum: Weekday })
  @IsEnum(Weekday)
  weekday!: Weekday;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  shiftId!: string;
}

export class SetDialysisPlanDto {
  @ApiProperty({ type: () => [DialysisPlanEntryDto], minItems: 1, maxItems: 4 })
  @IsArray()
  @ArrayMinSize(1) // policy: 1-4 sessions/week (docs/MODULES-SPEC.md)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => DialysisPlanEntryDto)
  entries!: DialysisPlanEntryDto[];
}
