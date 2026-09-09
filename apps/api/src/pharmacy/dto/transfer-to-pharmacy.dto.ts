import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class TransferToPharmacyDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
