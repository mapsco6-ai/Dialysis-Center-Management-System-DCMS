import { ApiProperty } from "@nestjs/swagger";
import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from "class-validator";

export class CreateLabPanelDto {
  @ApiProperty({ type: String })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ type: () => [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  labTestIds!: string[];
}
