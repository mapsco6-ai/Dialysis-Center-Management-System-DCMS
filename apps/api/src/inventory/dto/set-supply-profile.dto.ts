import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsNotEmpty, IsNumber, IsString, Min, ValidateNested } from "class-validator";

class SupplyProfileEntryDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsNumber()
  @Min(0.01)
  defaultQuantity!: number;
}

export class SetSupplyProfileDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SupplyProfileEntryDto)
  entries!: SupplyProfileEntryDto[];
}
