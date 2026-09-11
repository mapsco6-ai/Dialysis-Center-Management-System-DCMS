import { ApiProperty } from "@nestjs/swagger";
import { DialysisEventType } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class CreateEventDto {
  @ApiProperty({ enum: DialysisEventType })
  @IsEnum(DialysisEventType)
  type!: DialysisEventType;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  note?: string;

  // See create-reading.dto.ts - same quick-PIN attribution mechanism.
  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  verifiedActorToken?: string;
}
