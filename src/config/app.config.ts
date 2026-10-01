import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  frontendUrl: (process.env.FRONTEND_URL ?? 'http://localhost:5173').replace(
    /\/+$/,
    '',
  ),
  profileInvitationExpirationHours: Number(
    process.env.PROFILE_INVITATION_EXPIRATION_HOURS ?? 72,
  ),
  // Date limite fixe (ISO 8601 avec fuseau). Si absente : envoi + N heures.
  profileInvitationDeadline: process.env.PROFILE_INVITATION_DEADLINE
    ? new Date(process.env.PROFILE_INVITATION_DEADLINE)
    : null,
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim().replace(/\/+$/, ''))
    : undefined,
}));
