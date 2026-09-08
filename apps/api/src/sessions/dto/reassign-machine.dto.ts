import { IsNotEmpty, IsString } from "class-validator";

export class ReassignMachineDto {
  @IsString()
  @IsNotEmpty()
  newMachineId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
