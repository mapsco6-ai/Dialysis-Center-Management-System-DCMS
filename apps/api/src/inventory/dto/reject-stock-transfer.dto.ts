import { IsNotEmpty, IsString } from "class-validator";

export class RejectStockTransferDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
