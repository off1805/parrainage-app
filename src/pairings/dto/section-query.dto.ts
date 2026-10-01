import { IsEnum, IsOptional } from 'class-validator';
import { StudentSection } from '../../students/student.entity.js';

/** Section ciblée (FR francophone / EN anglophone). */
export class SectionQueryDto {
  @IsOptional()
  @IsEnum(StudentSection, { message: 'section doit valoir FR ou EN' })
  section?: StudentSection;
}
