import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class SubstituteSupplyDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  originalItemId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  substituteItemId!: string;

  @ApiProperty({ type: Number, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
