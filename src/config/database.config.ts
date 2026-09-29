import { registerAs } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

const truthy = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  return value === 'true';
};

export default registerAs('database', (): TypeOrmModuleOptions => {
  const synchronize = truthy(
    process.env.DATABASE_SYNCHRONIZE,
    process.env.NODE_ENV !== 'production',
  );
  const logging = truthy(process.env.DATABASE_LOGGING, false);

  const common: TypeOrmModuleOptions = {
    type: 'postgres',
    autoLoadEntities: true,
    synchronize,
    logging,
  };

  const url = process.env.DATABASE_URL;
  if (url) {
    return { ...common, url };
  }

  return {
    ...common,
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT ?? 5432),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
  };
});
