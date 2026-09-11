import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class CloseTicketDto {
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;
}
