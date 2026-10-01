import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { StudentLevel, StudentSection } from '../student.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** Ajout manuel d'un étudiant (mêmes règles qu'une ligne d'import). */
export class CreateStudentDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @Transform(trim)
  @IsEmail({}, { message: 'email est invalide' })
  @MaxLength(255)
  email: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  matricule?: string;

  @IsEnum(StudentLevel, { message: 'level doit valoir ING3 ou ING4' })
  level: StudentLevel;

  /** Francophone par défaut. */
  @IsOptional()
  @IsEnum(StudentSection, { message: 'section doit valoir FR ou EN' })
  section?: StudentSection;

  /** Obligatoire pour un ING4, ignoré pour un ING3. */
  @ValidateIf((o: CreateStudentDto) => o.level === StudentLevel.ING4)
  @IsInt({ message: 'maxMentees est obligatoire pour un ING4 (entier)' })
  @Min(1, { message: 'maxMentees doit être supérieur ou égal à 1' })
  @Max(50, { message: 'maxMentees ne peut pas dépasser 50' })
  maxMentees?: number;
}
