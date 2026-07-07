// Instância única do Knex (pool de conexões) compartilhada por toda a app.
// Fixa o timezone da conexão no fuso do negócio — importante para a coluna
// gerada `dia_checkin` (1 check-in/dia) e para relatórios por data.
import knexFactory from 'knex';
import { env } from './env.js';

// Conecta como `clube_app` (NOSUPERUSER) → RLS é aplicado. Migrations/seed usam
// DATABASE_URL (superusuário) só via knexfile, nunca por aqui.
export const db = knexFactory({
  client: 'pg',
  connection: {
    connectionString: env.APP_DATABASE_URL,
    timezone: env.DB_TIMEZONE,
  },
  pool: {
    min: 2,
    max: 10,
    afterCreate: (conn, done) => {
      conn.query(`SET TIME ZONE '${env.DB_TIMEZONE}'`, (err) => done(err, conn));
    },
  },
});

// -------- Contextos RLS (ver db/migrations/0002_rls.js) --------
// Toda leitura/escrita passa por um destes. O GUC é setado com SET LOCAL
// (via set_config(..., true)) → vale só dentro da transação, não vaza no pool.

/**
 * Contexto de TENANT: as queries só enxergam a academia informada.
 * Usado nas rotas autenticadas (o tenant vem do JWT). Recebe `fn(trx)`.
 */
export function comTenant(tenantId, fn) {
  return db.transaction(async (trx) => {
    await trx.raw(`SELECT set_config('app.tenant_id', ?, true)`, [tenantId]);
    return fn(trx);
  });
}

/**
 * Contexto de SISTEMA (bypass do RLS): login, autenticação, jobs, superadmin.
 * Operações inerentemente cross-tenant ou pré-tenant. Recebe `fn(trx)`.
 */
export function comSistema(fn) {
  return db.transaction(async (trx) => {
    await trx.raw(`SELECT set_config('app.bypass', 'on', true)`);
    return fn(trx);
  });
}
