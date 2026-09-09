import { IsOptional, IsString } from "class-validator";

export class CloseTicketDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
