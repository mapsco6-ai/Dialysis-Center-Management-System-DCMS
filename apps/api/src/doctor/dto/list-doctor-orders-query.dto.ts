import { IsNotEmpty, IsString } from "class-validator";

export class ListDoctorOrdersQueryDto {
  @IsString()
  @IsNotEmpty()
  patientId!: string;
}
