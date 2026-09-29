import { InvitationStatus } from '../invitation.entity.js';

/** Vue exposed par l'API : `tokenHash` n'est jamais renvoyé. */
export class InvitationViewDto {
  id: string;
  studentId: string;
  status: InvitationStatus;
  sentAt: Date;
  expiresAt: Date | null;
  usedAt: Date | null;
  createdAt: Date;
}
