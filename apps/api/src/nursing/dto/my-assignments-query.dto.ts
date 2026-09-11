import { ApiProperty } from "@nestjs/swagger";
import { IsDateString } from "class-validator";

export class MyAssignmentsQueryDto {
  @ApiProperty({ type: String })
  @IsDateString()
  date!: string;
}
