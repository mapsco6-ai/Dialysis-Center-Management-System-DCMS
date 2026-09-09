import { IsNotEmpty, IsString } from "class-validator";

export class AssignTicketDto {
  @IsString()
  @IsNotEmpty()
  assignedToId!: string;
}
