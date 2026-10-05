// Aplica as migrations de supabase/migrations no projeto de teste ou de produção, sem Docker.
import { execSync } from 'node:child_process';
import { loadEnv } from 'vite';

const alvo = process.argv[2];
if (alvo !== 'test' && alvo !== 'prod') {
  console.error('Uso: node scripts/db-push.mjs test|prod');
  process.exit(1);
}
const env = loadEnv(alvo === 'prod' ? 'production' : 'test', process.cwd(), '');
const url = alvo === 'prod' ? env.SUPABASE_PROD_DB_URL : env.SUPABASE_TEST_DB_URL;
if (!url) {
  console.error(`Defina ${alvo === 'prod' ? 'SUPABASE_PROD_DB_URL em .env.production.local' : 'SUPABASE_TEST_DB_URL em .env.test.local'}.`);
  process.exit(1);
}
execSync(`npx supabase db push --db-url "${url}" --yes`, { stdio: 'inherit' });
