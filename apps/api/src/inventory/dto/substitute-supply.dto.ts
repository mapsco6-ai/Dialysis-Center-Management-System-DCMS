import { Transform } from "class-transformer";
import { IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class SubstituteSupplyDto {
  @IsString()
  @IsNotEmpty()
  originalItemId!: string;

  @IsString()
  @IsNotEmpty()
  substituteItemId!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
