import { Transform } from "class-transformer";
import { IsIn, IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class AdjustStockDto {
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsIn(["INCREASE", "DECREASE"])
  direction!: "INCREASE" | "DECREASE";

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
