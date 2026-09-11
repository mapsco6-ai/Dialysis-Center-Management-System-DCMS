import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class RejectStockTransferDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
