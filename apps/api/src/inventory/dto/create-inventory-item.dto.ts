import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateInventoryItemDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  category!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  unit!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty({ type: Number, required: false, nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumStock?: number;

  @ApiProperty({ type: Number, required: false, nullable: true, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiProperty({ type: Boolean, required: false, nullable: true })
  @IsOptional()
  @IsBoolean()
  requiresBatchTracking?: boolean;
}
