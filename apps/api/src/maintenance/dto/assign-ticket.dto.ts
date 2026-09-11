import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class AssignTicketDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  assignedToId!: string;
}
