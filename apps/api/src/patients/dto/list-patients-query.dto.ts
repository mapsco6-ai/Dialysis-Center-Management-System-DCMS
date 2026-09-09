import { Type } from "class-transformer";
import { IsInt, IsOptional, Min } from "class-validator";

// Numeric coercion happens here (via ValidationPipe's global transform:true)
// so a malformed value fails class-validator's @IsInt as NaN, instead of
// reaching PatientsService.findAll as NaN and blowing up Prisma's
// skip/take with an unhandled 500 (DCMS-009).
export class ListPatientsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
