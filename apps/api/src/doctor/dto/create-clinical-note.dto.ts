import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateClinicalNoteDto {
  @IsString()
  @IsNotEmpty()
  text!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
