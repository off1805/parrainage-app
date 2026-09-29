import {
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Mise à jour administrateur.
 * `email` et `level` ne sont volontairement pas modifiables : l'identité de
 * l'étudiant provient de l'import et n'est jamais éditable depuis l'API.
 */
export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  matricule?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(512)
  profilePictureUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  whatsapp?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxMentees?: number;
}
