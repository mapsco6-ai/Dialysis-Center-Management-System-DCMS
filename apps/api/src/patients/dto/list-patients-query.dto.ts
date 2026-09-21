import { ApiProperty } from "@nestjs/swagger";
import { PatientStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";

// Numeric coercion happens here (via ValidationPipe's global transform:true)
// so a malformed value fails class-validator's @IsInt as NaN, instead of
// reaching PatientsService.findAll as NaN and blowing up Prisma's
// skip/take with an unhandled 500 (DCMS-009).
export class ListPatientsQueryDto {
  @ApiProperty({ type: "integer", required: false, nullable: true, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ type: "integer", required: false, nullable: true, minimum: 1, description: "Requested page size; the server caps the returned page at 100 records." })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  // Registry status filter (V1.1 of docs/COMPREHENSIVE-DEVELOPMENT-PLAN-V1.md
  // §2.2) - the 1000+ patient list is only usable with server-side filtering,
  // not client-side slicing of one page.
  @ApiProperty({ enum: PatientStatus, required: false })
  @IsOptional()
  @IsEnum(PatientStatus)
  status?: PatientStatus;
}
