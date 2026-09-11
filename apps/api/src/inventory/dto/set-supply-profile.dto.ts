import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsNotEmpty, IsNumber, IsString, Min, ValidateNested } from "class-validator";

class SupplyProfileEntryDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty({ type: Number, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  defaultQuantity!: number;
}

export class SetSupplyProfileDto {
  @ApiProperty({ type: () => [SupplyProfileEntryDto], maxItems: 50 })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SupplyProfileEntryDto)
  entries!: SupplyProfileEntryDto[];
}
