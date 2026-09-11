import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsNotEmpty, IsString } from "class-validator";

export class CheckInDto {
  // Required: docs/MODULES-SPEC.md Phase 3 says the station is recorded
  // alongside time and user for every check-in. This doesn't cryptographically
  // verify which physical desk made the call (that needs a real device/station
  // registry, which doesn't exist yet - docs review DCMS-040) but it at least
  // stops check-ins with literally no station on record.
  @ApiProperty({ type: String })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  stationId!: string;
}
