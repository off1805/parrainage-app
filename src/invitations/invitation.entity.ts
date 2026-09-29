import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum InvitationStatus {
  PENDING = 'PENDING',
  USED = 'USED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

@Entity('profile_invitations')
export class ProfileInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_profile_invitations_student')
  @Column({ type: 'uuid' })
  studentId: string;

  /** SHA-256 du token. Le token en clair n'est jamais persisté. */
  @Index('uq_profile_invitations_token', { unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ type: 'varchar', length: 16, default: InvitationStatus.PENDING })
  status: InvitationStatus;

  @Column({ type: 'timestamptz' })
  sentAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
