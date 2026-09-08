import { IsNotEmpty, IsString } from "class-validator";

export class ListLabOrdersQueryDto {
  @IsString()
  @IsNotEmpty()
  patientId!: string;
}
