import { ApiProperty } from "@nestjs/swagger";
import { StockTransferStatus } from "@prisma/client";
import { IsEnum, IsOptional } from "class-validator";

export class ListStockTransfersQueryDto {
  @ApiProperty({ enum: StockTransferStatus, required: false, nullable: true })
  @IsOptional()
  @IsEnum(StockTransferStatus)
  status?: StockTransferStatus;
}
