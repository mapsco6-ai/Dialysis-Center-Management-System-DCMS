import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class SetSessionOverrideDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty({ type: Number, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  overrideQuantity!: number;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  reason?: string;
}
