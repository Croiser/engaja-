// =====================================================================
// Row Level Security (RLS) — isolamento multi-tenant no nível do BANCO.
//
// Defesa em profundidade: mesmo que uma query da aplicação esqueça o
// `WHERE academia_id`, o Postgres NÃO devolve linhas de outra academia.
//
// Modelo FAIL-CLOSED:
//   - Request autenticado define `app.tenant_id` (UUID da academia) → só vê aquele tenant.
//   - Contexto de sistema (login, autenticar, jobs, superadmin) define `app.bypass='on'`.
//   - Sem nenhum dos dois → 0 linhas (falha fechada: quebra a feature, nunca vaza).
//
// FORCE ROW LEVEL SECURITY: aplica a política até para o DONO da tabela (o app roda
// como dono via migrations), senão o dono ignoraria o RLS.
// =====================================================================

// Tabelas que carregam academia_id diretamente.
const TABELAS_TENANT = [
  'usuarios',
  'pontos_ledger',
  'selos',
  'desafios',
  'indicacoes',
  'categorias_parceiros',
  'parceiros',
  'usos_beneficio',
  'premios',
  'resgates',
  'checkins',
  'auditoria_logs',
];

// Predicado comum (bypass de sistema OU pertence ao tenant atual).
const cond = (coluna) => `(
  coalesce(current_setting('app.bypass', true) = 'on', false)
  OR ${coluna} = nullif(current_setting('app.tenant_id', true), '')::uuid
)`;

export async function up(knex) {
  // Tabelas com academia_id.
  for (const t of TABELAS_TENANT) {
    await knex.raw(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    await knex.raw(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`);
    await knex.raw(`
      CREATE POLICY tenant_isolation ON ${t}
        USING ${cond('academia_id')}
        WITH CHECK ${cond('academia_id')};
    `);
  }

  // academias: a chave é `id` (não academia_id).
  await knex.raw(`ALTER TABLE academias ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`ALTER TABLE academias FORCE ROW LEVEL SECURITY;`);
  await knex.raw(`
    CREATE POLICY tenant_isolation ON academias
      USING ${cond('id')}
      WITH CHECK ${cond('id')};
  `);

  // Tabelas de junção sem academia_id → derivam o tenant pelo aluno (usuarios).
  // O subselect em usuarios também é filtrado por RLS, reforçando a checagem.
  for (const t of ['alunos_selos', 'desafios_progresso']) {
    await knex.raw(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
    await knex.raw(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY;`);
    await knex.raw(`
      CREATE POLICY tenant_isolation ON ${t}
        USING (
          coalesce(current_setting('app.bypass', true) = 'on', false)
          OR EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = ${t}.aluno_id
              AND u.academia_id = nullif(current_setting('app.tenant_id', true), '')::uuid
          )
        );
    `);
  }
}

export async function down(knex) {
  const todas = [...TABELAS_TENANT, 'academias', 'alunos_selos', 'desafios_progresso'];
  for (const t of todas) {
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation ON ${t};`);
    await knex.raw(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY;`);
    await knex.raw(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY;`);
  }
}
