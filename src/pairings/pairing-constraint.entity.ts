import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum PairingConstraintType {
  REQUIRED = 'REQUIRED',
  FORBIDDEN = 'FORBIDDEN',
}

@Entity('pairing_constraints')
@Unique('uq_pairing_constraints_pair', ['sponsorId', 'menteeId'])
export class PairingConstraint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_pairing_constraints_sponsor')
  @Column({ type: 'uuid' })
  sponsorId: string;

  @Column({ type: 'uuid' })
  menteeId: string;

  @Column({ type: 'varchar', length: 16 })
  type: PairingConstraintType;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
