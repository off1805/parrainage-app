import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { StudentLevel } from '../student.entity.js';

export class QueryStudentsDto {
  @IsOptional()
  @IsEnum(StudentLevel)
  level?: StudentLevel;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
