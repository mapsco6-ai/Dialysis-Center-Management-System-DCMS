import { IsDateString, IsNotEmpty, IsNumber, IsString, Min } from "class-validator";

export class CreateInventoryBatchDto {
  @IsString()
  @IsNotEmpty()
  locationId!: string;

  @IsString()
  @IsNotEmpty()
  batchNumber!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsDateString()
  expiryDate!: string;
}
