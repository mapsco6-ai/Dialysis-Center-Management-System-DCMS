import { StockTransferStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class ListStockTransfersQueryDto {
  @IsOptional()
  @IsEnum(StockTransferStatus)
  status?: StockTransferStatus;
}
