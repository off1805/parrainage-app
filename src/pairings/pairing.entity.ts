import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

export enum PairingOrigin {
  RANDOM = 'RANDOM',
  PRECONFIGURED = 'PRECONFIGURED',
  MANUAL = 'MANUAL',
}

@Entity('pairings')
@Unique('uq_pairings_session_mentee', ['sessionId', 'menteeId'])
export class Pairing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_pairings_session')
  @Column({ type: 'uuid' })
  sessionId: string;

  @Column({ type: 'uuid' })
  sponsorId: string;

  @Column({ type: 'uuid' })
  menteeId: string;

  /** Interne : n'est jamais exposé dans l'export final. */
  @Column({ type: 'varchar', length: 16, default: PairingOrigin.RANDOM })
  origin: PairingOrigin;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
