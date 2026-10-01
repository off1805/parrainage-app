import { StudentSection } from '../../students/student.entity.js';
import { PairingOrigin } from '../pairing.entity.js';
import { PairingSessionStatus } from '../pairing-session.entity.js';

export interface StudentRefDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  matricule: string | null;
  whatsapp: string | null;
  profilePictureUrl: string | null;
}

export interface PairingViewDto {
  id: string;
  origin: PairingOrigin;
  sponsor: StudentRefDto;
  mentee: StudentRefDto;
}

export interface PairingSessionViewDto {
  id: string;
  status: PairingSessionStatus;
  section: StudentSection;
  createdAt: Date;
  generatedAt: Date | null;
  finalizedAt: Date | null;
  pairings: PairingViewDto[];
}
