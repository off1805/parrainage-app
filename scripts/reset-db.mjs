#!/usr/bin/env node
// Réinitialise les données du parrainage : vide toutes les tables de l'application
// (étudiants, invitations, contraintes, sessions, binômes). Le schéma est conservé.
//
// Usage :
//   DATABASE_URL="postgresql://…supabase…" npm run db:reset
//   npm run db:reset -- --yes        (sans confirmation interactive)
//
// Sans DATABASE_URL, les variables DATABASE_HOST/PORT/USER/PASSWORD/NAME du .env sont utilisées.
import { createInterface } from 'node:readline/promises';
import pg from 'pg';

try {
  process.loadEnvFile?.('.env');
} catch {
  // pas de .env : on se contente de l'environnement
}

const TABLES = ['pairings', 'pairing_sessions', 'pairing_constraints', 'profile_invitations', 'students'];

const config = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT ?? 5432),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
    };
// Supabase (et la plupart des hébergeurs) exigent TLS
const remote = !/localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? config.host ?? '');
if (remote) config.ssl = { rejectUnauthorized: false };

const client = new pg.Client(config);
await client.connect();

const { rows: [db] } = await client.query('select current_database() as name, inet_server_addr() as host');
const counts = [];
for (const table of TABLES) {
  const exists = await client.query('select to_regclass($1) as t', [`public.${table}`]);
  if (!exists.rows[0].t) continue;
  const { rows } = await client.query(`select count(*)::int as n from "${table}"`);
  counts.push([table, rows[0].n]);
}

console.log(`\nBase : ${db.name} (${db.host ?? 'socket local'})`);
for (const [table, n] of counts) console.log(`  ${table.padEnd(22)} ${n} ligne(s)`);

if (!counts.length) {
  console.log('\nAucune table du parrainage trouvée : rien à faire.');
  await client.end();
  process.exit(0);
}

if (!process.argv.includes('--yes')) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\n⚠️  Tout supprimer définitivement ? Tape le nom de la base (${db.name}) pour confirmer : `);
  rl.close();
  if (answer.trim() !== db.name) {
    console.log('Annulé.');
    await client.end();
    process.exit(1);
  }
}

await client.query(`TRUNCATE ${counts.map(([t]) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
console.log('\n✓ Base réinitialisée (schéma conservé).');
await client.end();
