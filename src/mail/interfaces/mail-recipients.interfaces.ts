export interface PhotoUploadRecipient {
  prenom: string;
  email: string;
  uploadToken: string;
  uploadTokenExpiresAt: Date;
}

/**
 * Destinataire d'une invitation à compléter son profil.
 * `token` est le token en clair : il n'apparaît que dans l'email, jamais en base.
 */
export interface ProfileInvitationRecipient {
  prenom: string;
  email: string;
  token: string;
  expiresAt: Date;
}

export interface BulkSendReport {
  total: number;
  sent: number;
  failed: { email: string; reason: string }[];
}
