import { ArrayMinSize, IsArray, IsNotEmpty, IsString } from "class-validator";

export class CreateLabPanelDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  labTestIds!: string[];
}
