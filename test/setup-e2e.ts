/**
 * Variables d'environnement par défaut pour la suite e2e.
 *
 * Chargé via `setupFiles`, donc AVANT l'import de `AppModule` (dont la
 * validation Joi s'exécute à l'import). Les valeurs déjà présentes dans
 * l'environnement ou dans un `.env` sont conservées : il suffit de pointer
 * `DATABASE_URL` vers une base de test pour surcharger.
 *
 * Prérequis : une base PostgreSQL accessible avec le schéma créé au démarrage
 * (`DATABASE_SYNCHRONIZE=true`).
 */
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3998',
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: '5432',
  DATABASE_USER: 'parrainage',
  DATABASE_PASSWORD: 'parrainage',
  DATABASE_NAME: 'parrainage_test',
  DATABASE_SYNCHRONIZE: 'true',
  DATABASE_LOGGING: 'false',
  FRONTEND_URL: 'http://localhost:5173',
  PROFILE_INVITATION_EXPIRATION_HOURS: '72',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_SECURE: 'false',
  SMTP_USER: 'test',
  SMTP_PASS: 'test',
  SMTP_FROM_NAME: 'Programme de parrainage',
  SMTP_FROM_EMAIL: 'parrainage@example.com',
  APP_BASE_URL: 'http://localhost:3998',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}

// Forcés, même si le `.env` local les définit : les tests ne doivent jamais
// envoyer de vrais emails via Brevo, ni dépendre de la date limite configurée.
process.env.BREVO_API_KEY = '';
process.env.PROFILE_INVITATION_DEADLINE = '';
