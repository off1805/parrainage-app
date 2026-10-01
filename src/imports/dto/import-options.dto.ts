import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { StudentLevel } from '../../students/student.entity.js';

/**
 * Champs multipart facultatifs envoyés avec le fichier d'import.
 * - `level` : niveau appliqué à toutes les lignes (remplace la colonne du fichier,
 *   qui devient facultative).
 * - `maxMentees` : capacité par défaut des ING4 dont la ligne n'en précise pas.
 */
export class ImportOptionsDto {
  @IsOptional()
  @IsEnum(StudentLevel, { message: 'level doit valoir ING3 ou ING4' })
  level?: StudentLevel;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'maxMentees doit être un entier' })
  @Min(1, { message: 'maxMentees doit être supérieur ou égal à 1' })
  @Max(50, { message: 'maxMentees ne peut pas dépasser 50' })
  maxMentees?: number;
}
