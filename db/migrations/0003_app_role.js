// =====================================================================
// Role de aplicação SEM privilégio de superusuário.
//
// POR QUÊ: superusuário do Postgres IGNORA RLS (até com FORCE). O app NÃO pode
// conectar como o dono/superusuário `clube`, senão o isolamento por tenant não vale.
// A API passa a conectar como `clube_app` (NOSUPERUSER, sujeito às políticas RLS).
// Migrations e seed continuam rodando como `clube` (superusuário) via DATABASE_URL.
//
// O bypass de sistema (login, jobs) NÃO usa superusuário — usa o GUC `app.bypass`
// previsto nas políticas (ver 0002_rls.js). Assim o controle fica na aplicação.
// =====================================================================

const APP_ROLE = 'clube_app';
const APP_PASS = 'clube_app'; // dev. Em produção: senha forte + trocar aqui e no APP_DATABASE_URL.

export async function up(knex) {
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASS}' NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$;
  `);

  await knex.raw(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE};`);
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE};`);
  await knex.raw(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE};`);
  // Tabelas/sequences criadas depois herdam os grants automaticamente.
  await knex.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APP_ROLE};`);
  await knex.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${APP_ROLE};`);
}

export async function down(knex) {
  await knex.raw(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${APP_ROLE};`);
  await knex.raw(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${APP_ROLE};`);
  await knex.raw(`REVOKE USAGE ON SCHEMA public FROM ${APP_ROLE};`);
  await knex.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ${APP_ROLE};`);
  await knex.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM ${APP_ROLE};`);
  await knex.raw(`DROP ROLE IF EXISTS ${APP_ROLE};`);
}
