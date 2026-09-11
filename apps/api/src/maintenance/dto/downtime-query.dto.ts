import { ApiProperty } from "@nestjs/swagger";
import { IsDateString } from "class-validator";

export class DowntimeQueryDto {
  @ApiProperty({ type: String })
  @IsDateString()
  from!: string;

  @ApiProperty({ type: String })
  @IsDateString()
  to!: string;
}
