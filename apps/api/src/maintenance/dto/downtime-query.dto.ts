import { IsDateString } from "class-validator";

export class DowntimeQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;
}
