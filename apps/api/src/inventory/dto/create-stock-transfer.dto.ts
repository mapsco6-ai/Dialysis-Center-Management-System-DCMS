import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateStockTransferDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  fromLocationId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  toLocationId!: string;

  @ApiProperty({ type: Number, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;
}
