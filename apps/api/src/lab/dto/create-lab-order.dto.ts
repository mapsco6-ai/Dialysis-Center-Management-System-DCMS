import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

// Either labPanelId or labTestIds (or both) must resolve to at least one
// test - checked in the service, since "at least one of two optional
// fields" isn't expressible as a single field-level decorator.
export class CreateLabOrderDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  labPanelId?: string;

  @ApiProperty({ type: () => [String], required: false, nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labTestIds?: string[];

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;

  // Set when the draw actually happens during a specific dialysis session,
  // so that session's cost can attribute this order's lab consumables to it
  // (docs review Phase 11 acceptance criterion 6). Most lab orders have no
  // session context and leave this unset.
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  linkedSessionId?: string;
}
