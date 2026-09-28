import Joi from 'joi';

export const envValidationSchema = Joi.object({
    SMTP_HOST: Joi.string().required(),
    SMTP_PORT: Joi.number().required(),
    SMTP_SECURE: Joi.boolean().required(),
    SMTP_USER: Joi.string().required(),
    SMTP_PASS: Joi.string().required(),
    SMTP_FROM_NAME: Joi.string().required(),
    SMTP_FROM_EMAIL: Joi.string().email().required(),
    APP_BASE_URL: Joi.string().uri().required(),
});