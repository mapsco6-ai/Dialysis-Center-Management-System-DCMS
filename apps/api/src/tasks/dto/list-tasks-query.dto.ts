import { ApiProperty } from "@nestjs/swagger";
import { TaskStatus } from "@prisma/client";
import { IsEnum, IsOptional, IsString } from "class-validator";

export class ListTasksQueryDto {
  @ApiProperty({ enum: TaskStatus, required: false, nullable: true })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  assignedToId?: string;
}
