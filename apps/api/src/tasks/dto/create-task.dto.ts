import { ApiProperty } from "@nestjs/swagger";
import { TaskPriority } from "@prisma/client";
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";

// Exactly one of assignedToId/assignedToRoleId is required - validated in
// TasksService.create (not here) since it needs both fields at once and a
// clear "must set exactly one" error, not two separate field errors.
export class CreateTaskDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  assignedToRoleId?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiProperty({ enum: TaskPriority, required: false, nullable: true })
  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @ApiProperty({ type: String, required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
