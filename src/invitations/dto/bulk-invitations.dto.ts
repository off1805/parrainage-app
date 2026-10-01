import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';

/**
 * Invitation groupée. Sans `studentIds`, tous les étudiants dont le profil
 * est incomplet (photo ou WhatsApp manquant) sont invités.
 */
export class BulkInvitationsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  studentIds?: string[];
}
