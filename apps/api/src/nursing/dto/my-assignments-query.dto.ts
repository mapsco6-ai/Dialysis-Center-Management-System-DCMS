import { IsDateString } from "class-validator";

export class MyAssignmentsQueryDto {
  @IsDateString()
  date!: string;
}
