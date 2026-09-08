import { IsNotEmpty, IsString } from "class-validator";
import { CreateReadingDto } from "./create-reading.dto";

// Append-or-Amend: this creates a new reading row pointing back at the one
// it corrects - never an UPDATE (docs/MODULES-SPEC.md Phase 6). The reason
// is mandatory here (unlike a fresh reading) because an amendment is always
// a correction to something already on the record.
export class AmendReadingDto extends CreateReadingDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
