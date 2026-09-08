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
}
