import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateClinicalNoteDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  text!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  sessionId?: string;
}
