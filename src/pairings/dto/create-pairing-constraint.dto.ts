import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PairingConstraintType } from '../pairing-constraint.entity.js';

export class CreatePairingConstraintDto {
  @IsUUID()
  sponsorId: string;

  @IsUUID()
  menteeId: string;

  @IsEnum(PairingConstraintType)
  type: PairingConstraintType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
