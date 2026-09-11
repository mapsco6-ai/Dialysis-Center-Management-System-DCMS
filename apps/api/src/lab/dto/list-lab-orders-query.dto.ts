import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class ListLabOrdersQueryDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  patientId!: string;
}
