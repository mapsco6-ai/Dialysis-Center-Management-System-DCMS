import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class AdjustStockDto {
  @ApiProperty({ type: Number, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @ApiProperty({ enum: ["INCREASE", "DECREASE"] })
  @IsIn(["INCREASE", "DECREASE"])
  direction!: "INCREASE" | "DECREASE";

  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
