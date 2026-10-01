import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum StudentLevel {
  ING3 = 'ING3',
  ING4 = 'ING4',
}

/** Section du programme : chaque section a son propre parrainage, indépendant. */
export enum StudentSection {
  FR = 'FR', // francophone
  EN = 'EN', // anglophone
}

@Entity('students')
export class Student {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  firstName: string;

  @Column({ type: 'varchar', length: 100 })
  lastName: string;

  @Index('uq_students_email', { unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  matricule: string | null;

  @Column({ type: 'varchar', length: 10 })
  level: StudentLevel;

  @Index('idx_students_section')
  @Column({ type: 'varchar', length: 2, default: StudentSection.FR })
  section: StudentSection;

  @Column({ type: 'varchar', length: 32, nullable: true })
  whatsapp: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  profilePictureUrl: string | null;

  @Column({ type: 'int', nullable: true })
  maxMentees: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
