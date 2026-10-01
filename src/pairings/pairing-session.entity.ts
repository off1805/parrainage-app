import { StudentSection } from '../students/student.entity.js';
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

  /** Le tirage ne porte que sur les étudiants et contraintes de cette section. */
  @Column({ type: 'varchar', length: 2, default: StudentSection.FR })
  section: StudentSection;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  generatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  finalizedAt: Date | null;
}
