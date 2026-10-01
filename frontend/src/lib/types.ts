export interface StudentRef {
  id: string; firstName: string; lastName: string; email: string;
  matricule: string | null; whatsapp: string | null; profilePictureUrl: string | null;
}
export interface Pairing { id: string; origin: 'RANDOM' | 'PRECONFIGURED' | 'MANUAL'; sponsor: StudentRef; mentee: StudentRef }
export type SessionStatus = 'DRAFT' | 'GENERATED' | 'FINALIZED';
export interface PairingSession { id: string; status: SessionStatus; createdAt: string; generatedAt: string | null; finalizedAt: string | null }
export interface PairingSessionView extends PairingSession { pairings: Pairing[] }

export type StudentLevel = 'ING3' | 'ING4';

export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  matricule: string | null;
  level: StudentLevel;
  whatsapp: string | null;
  profilePictureUrl: string | null;
  maxMentees: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportResult {
  imported: number;
  rejected: number;
  errors: {
    row: number;
    email?: string;
    message: string;
  }[];
}

export interface InvitationResult {
  invitation: {
    id: string;
    studentId: string;
    status: 'PENDING' | 'USED' | 'EXPIRED' | 'CANCELLED';
    sentAt: string;
    expiresAt: string;
    usedAt: string | null;
    createdAt: string;
  };
  email: {
    total: number;
    sent: number;
    failed: { email: string; reason: string }[];
  };
}

export interface InvitationPreview {
  firstName: string;
  expiresAt: string;
}

export type ConstraintType = 'REQUIRED' | 'FORBIDDEN';

export interface PairingConstraint {
  id: string;
  sponsorId: string;
  menteeId: string;
  type: ConstraintType;
  reason: string | null;
  createdAt: string;
}

export interface PairingValidationReport {
  valid: boolean;
  issues: { code: string; message: string }[];
  stats: {
    sponsors: number;
    mentees: number;
    totalCapacity: number;
    required: number;
    forbidden: number;
  };
}
