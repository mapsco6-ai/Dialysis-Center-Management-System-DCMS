import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsString } from "class-validator";

export class ModifyDoctorOrderDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  // Partial by nature - a dose change only needs {dose: "..."}, not the
  // full original medication triple again (docs/PROJECT-PHASES-PLAN.md
  // Phase 8 acceptance criterion 4).
  @ApiProperty({ type: "object", additionalProperties: true })
  @IsObject()
  payload!: Record<string, unknown>;
}
