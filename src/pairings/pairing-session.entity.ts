import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum PairingSessionStatus {
  DRAFT = 'DRAFT',
  GENERATED = 'GENERATED',
  FINALIZED = 'FINALIZED',
}

@Entity('pairing_sessions')
export class PairingSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16, default: PairingSessionStatus.DRAFT })
  status: PairingSessionStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  generatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;
}
