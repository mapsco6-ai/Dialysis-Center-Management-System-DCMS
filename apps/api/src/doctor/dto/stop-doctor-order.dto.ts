import { IsNotEmpty, IsString } from "class-validator";

export class StopDoctorOrderDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
