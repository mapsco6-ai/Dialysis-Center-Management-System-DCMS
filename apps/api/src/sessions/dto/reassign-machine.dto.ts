import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class ReassignMachineDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  newMachineId!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
