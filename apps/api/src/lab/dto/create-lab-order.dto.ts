import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

// Either labPanelId or labTestIds (or both) must resolve to at least one
// test - checked in the service, since "at least one of two optional
// fields" isn't expressible as a single field-level decorator.
export class CreateLabOrderDto {
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @IsOptional()
  @IsString()
  labPanelId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labTestIds?: string[];

  @IsOptional()
  @IsString()
  reason?: string;

  // Set when the draw actually happens during a specific dialysis session,
  // so that session's cost can attribute this order's lab consumables to it
  // (docs review Phase 11 acceptance criterion 6). Most lab orders have no
  // session context and leave this unset.
  @IsOptional()
  @IsString()
  linkedSessionId?: string;
}
