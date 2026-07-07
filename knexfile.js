// Config do Knex CLI (migrations/seeds). Reusa a mesma DATABASE_URL do app.
import 'dotenv/config';

const shared = {
  client: 'pg',
  connection: {
    connectionString: process.env.DATABASE_URL,
    timezone: process.env.DB_TIMEZONE || 'America/Sao_Paulo',
  },
  migrations: {
    directory: './db/migrations',
    extension: 'js',
    loadExtensions: ['.js'],
  },
  seeds: {
    directory: './db/seeds',
  },
};

export default {
  development: shared,
  production: { ...shared, pool: { min: 2, max: 10 } },
};
