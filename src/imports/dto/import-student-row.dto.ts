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
} from 'class-validator';
import { StudentLevel } from '../../students/student.entity.js';

/**
 * Une ligne du fichier d'import, telle que normalisée par l'ImportsService.
 * `maxMentees` est ignoré pour un ING3 (seul un ING4 peut parrainer).
 */
export class ImportStudentRowDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @IsEmail({}, { message: 'email est invalide' })
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  matricule?: string;

  @IsEnum(StudentLevel, { message: 'level doit valoir ING3 ou ING4' })
  level: StudentLevel;

  @IsOptional()
  @IsInt({ message: 'maxMentees doit être un entier' })
  @Min(1, { message: 'maxMentees doit être supérieur ou égal à 1' })
  @Max(50, { message: 'maxMentees ne peut pas dépasser 50' })
  maxMentees?: number;
}
