import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { StudentLevel, StudentSection } from '../student.entity.js';

export class QueryStudentsDto {
  @IsOptional()
  @IsEnum(StudentLevel)
  level?: StudentLevel;

  @IsOptional()
  @IsEnum(StudentSection, { message: 'section doit valoir FR ou EN' })
  section?: StudentSection;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
