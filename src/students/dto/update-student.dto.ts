import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { StudentLevel, StudentSection } from '../student.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Mise à jour administrateur : tous les champs sont facultatifs.
 * Les règles de cohérence (email unique, capacité d'un ING4, contraintes
 * existantes) sont vérifiées par le service.
 */
export class UpdateStudentDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'email est invalide' })
  @MaxLength(255)
  email?: string;

  /** Chaîne vide : efface le matricule. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  matricule?: string;

  @IsOptional()
  @IsEnum(StudentLevel, { message: 'level doit valoir ING3 ou ING4' })
  level?: StudentLevel;

  @IsOptional()
  @IsEnum(StudentSection, { message: 'section doit valoir FR ou EN' })
  section?: StudentSection;

  @IsOptional()
  @ValidateIf((_, v) => v !== '')
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  profilePictureUrl?: string;

  /** Chaîne vide : efface le numéro. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(32)
  whatsapp?: string;

  @IsOptional()
  @IsInt({ message: 'maxMentees doit être un entier' })
  @Min(1, { message: 'maxMentees doit être supérieur ou égal à 1' })
  @Max(50, { message: 'maxMentees ne peut pas dépasser 50' })
  maxMentees?: number;
}
