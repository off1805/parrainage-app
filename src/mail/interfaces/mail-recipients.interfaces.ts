export interface PhotoUploadRecipient {
    prenom: string;
    email: string;
    uploadToken: string;
    uploadTokenExpiresAt: Date;
}

export interface BulkSendReport {
    total: number;
    sent: number;
    failed: { email: string; reason: string }[];
}