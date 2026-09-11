import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class CreateInventoryBatchDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  batchNumber!: string;

  @ApiProperty({ type: Number, minimum: 0.01 })
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @ApiProperty({ type: String })
  @IsDateString()
  expiryDate!: string;
}
