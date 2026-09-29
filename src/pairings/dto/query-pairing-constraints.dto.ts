import { IsEnum, IsOptional } from 'class-validator';
import { PairingConstraintType } from '../pairing-constraint.entity.js';

export class QueryPairingConstraintsDto {
  @IsOptional()
  @IsEnum(PairingConstraintType)
  type?: PairingConstraintType;
}
