import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Le lien d'invitation ne permet de renseigner que la photo de profil et le
 * WhatsApp. Le nom, le prénom, l'email, le matricule et le niveau ne sont pas
 * modifiables depuis ce formulaire.
 */
export class CompleteProfileDto {
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token: string;

  @IsString()
  @MaxLength(512)
  profilePictureUrl: string;

  @IsString()
  @Matches(/^[+0-9][0-9\s().-]{5,31}$/, {
    message: 'whatsapp doit être un numéro de téléphone valide',
  })
  whatsapp: string;
}
