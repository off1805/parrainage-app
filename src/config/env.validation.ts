import Joi from 'joi';

const requiredInProduction = <T extends Joi.AnySchema>(schema: T) =>
  schema.when('NODE_ENV', {
    is: 'production',
    // oxlint-disable-next-line unicorn/no-thenable -- `then` est une clé de l'API Joi, pas une thenable
    then: Joi.required(),
    otherwise: Joi.optional(),
  });

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),
  CORS_ORIGINS: Joi.string().optional(),
  PROFILE_INVITATION_EXPIRATION_HOURS: Joi.number()
    .integer()
    .min(1)
    .default(72),

  DATABASE_URL: Joi.string()
    .uri({ scheme: [/postgres(ql)?/] })
    .optional(),
  DATABASE_HOST: Joi.string().optional(),
  DATABASE_PORT: Joi.number().port().default(5432),
  DATABASE_USER: Joi.string().optional(),
  DATABASE_PASSWORD: Joi.string().allow('').optional(),
  DATABASE_NAME: Joi.string().optional(),
  DATABASE_SYNCHRONIZE: Joi.boolean().optional(),
  DATABASE_LOGGING: Joi.boolean().optional(),

  SMTP_HOST: requiredInProduction(Joi.string()),
  SMTP_PORT: requiredInProduction(Joi.number().port()),
  SMTP_SECURE: Joi.boolean().default(false),
  SMTP_USER: requiredInProduction(Joi.string()),
  SMTP_PASS: requiredInProduction(Joi.string().allow('')),
  SMTP_FROM_NAME: Joi.string().default('Programme de parrainage'),
  SMTP_FROM_EMAIL: requiredInProduction(Joi.string().email()),
  APP_BASE_URL: Joi.string().uri().default('http://localhost:3000'),
}).custom((value, helpers) => {
  const hasUrl = Boolean(value.DATABASE_URL);
  const hasParts = Boolean(
    value.DATABASE_HOST && value.DATABASE_USER && value.DATABASE_NAME,
  );
  if (!hasUrl && !hasParts) {
    return helpers.message({
      custom:
        'DATABASE_URL ou DATABASE_HOST + DATABASE_USER + DATABASE_NAME doit être renseigné',
    });
  }
  return value;
});
