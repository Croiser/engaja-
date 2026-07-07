// =====================================================================
// CRM de leads (pipeline kanban) + Notificações (mural interno) + Web Push.
//   - Expande `indicacoes` de "registro" para "lead" com estágios e responsável.
//   - `leads_interacoes`: timeline de contatos (ligação/visita/nota).
//   - `notificacoes`: inbox interno (canal confiável).
//   - `push_subscriptions`: assinaturas Web Push por dispositivo (os "tokens").
// Todas as tabelas novas entram no RLS (fail-closed) espelhando 0002.
// =====================================================================

const cond = (coluna) => `(
  coalesce(current_setting('app.bypass', true) = 'on', false)
  OR ${coluna} = nullif(current_setting('app.tenant_id', true), '')::uuid
)`;

async function ligarRls(knex, tabela, coluna = 'academia_id') {
  await knex.raw(`ALTER TABLE ${tabela} ENABLE ROW LEVEL SECURITY;`);
  await knex.raw(`ALTER TABLE ${tabela} FORCE ROW LEVEL SECURITY;`);
  await knex.raw(`
    CREATE POLICY tenant_isolation ON ${tabela}
      USING ${cond(coluna)} WITH CHECK ${cond(coluna)};
  `);
}

export async function up(knex) {
  // ---- Expande indicacoes → lead CRM ----
  // indicador_id passa a ser opcional (leads sem indicador: landing page/SEO futuro).
  await knex.raw(`ALTER TABLE indicacoes ALTER COLUMN indicador_id DROP NOT NULL;`);
  // Novos estágios do pipeline.
  await knex.raw(`ALTER TABLE indicacoes DROP CONSTRAINT IF EXISTS indicacoes_status_check;`);
  await knex.raw(`UPDATE indicacoes SET status = CASE status
      WHEN 'pendente' THEN 'novo' WHEN 'fechada' THEN 'matriculado'
      WHEN 'cancelada' THEN 'perdido' ELSE status END;`);
  await knex.raw(`ALTER TABLE indicacoes ALTER COLUMN status SET DEFAULT 'novo';`);
  await knex.raw(`ALTER TABLE indicacoes ADD CONSTRAINT indicacoes_status_check
      CHECK (status IN ('novo','em_contato','agendado','matriculado','perdido'));`);
  await knex.schema.alterTable('indicacoes', (t) => {
    t.uuid('responsavel_id').references('id').inTable('usuarios'); // recepção que cuida
    t.string('origem', 30).defaultTo('indicacao_aluno'); // indicacao_aluno | landing | manual
    t.string('email_indicado', 150);
    t.text('motivo_perda');
    t.date('proximo_contato_em'); // follow-up
    t.timestamp('matriculado_em', { useTz: true });
  });

  // ---- Timeline de contatos do lead ----
  await knex.schema.createTable('leads_interacoes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('lead_id').notNullable().references('id').inTable('indicacoes').onDelete('CASCADE');
    t.uuid('academia_id').notNullable().references('id').inTable('academias');
    t.uuid('autor_id').references('id').inTable('usuarios');
    t.string('tipo', 20).notNullable(); // ligacao | whatsapp | visita | nota | mudanca_status
    t.text('texto');
    t.timestamp('criado_em', { useTz: true }).defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX idx_interacoes_lead ON leads_interacoes(lead_id, criado_em DESC);`);

  // ---- Mural interno (inbox) ----
  await knex.schema.createTable('notificacoes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').notNullable().references('id').inTable('usuarios');
    t.uuid('academia_id').notNullable().references('id').inTable('academias');
    t.string('tipo', 40).notNullable(); // lead_novo | pontos | vencimento | desafio | selo | aviso
    t.string('titulo', 150).notNullable();
    t.text('corpo');
    t.text('url'); // deep-link no app
    t.boolean('lida').defaultTo(false);
    t.timestamp('lida_em', { useTz: true });
    t.timestamp('criado_em', { useTz: true }).defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX idx_notif_usuario ON notificacoes(usuario_id, criado_em DESC);`);
  await knex.raw(`CREATE INDEX idx_notif_nao_lida ON notificacoes(usuario_id) WHERE NOT lida;`);

  // ---- Assinaturas Web Push (tokens de dispositivo) ----
  await knex.schema.createTable('push_subscriptions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('usuario_id').notNullable().references('id').inTable('usuarios');
    t.uuid('academia_id').notNullable().references('id').inTable('academias');
    t.text('endpoint').notNullable();
    t.text('p256dh').notNullable();
    t.text('auth').notNullable();
    t.text('user_agent');
    t.boolean('ativo').defaultTo(true);
    t.timestamp('criado_em', { useTz: true }).defaultTo(knex.fn.now());
  });
  // Um endpoint é único por dispositivo (evita duplicar assinatura).
  await knex.raw(`CREATE UNIQUE INDEX idx_push_endpoint ON push_subscriptions(endpoint);`);

  await ligarRls(knex, 'leads_interacoes');
  await ligarRls(knex, 'notificacoes');
  await ligarRls(knex, 'push_subscriptions');
}

export async function down(knex) {
  for (const t of ['push_subscriptions', 'notificacoes', 'leads_interacoes']) {
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation ON ${t};`);
    await knex.schema.dropTableIfExists(t);
  }
  await knex.schema.alterTable('indicacoes', (t) => {
    t.dropColumn('responsavel_id');
    t.dropColumn('origem');
    t.dropColumn('email_indicado');
    t.dropColumn('motivo_perda');
    t.dropColumn('proximo_contato_em');
    t.dropColumn('matriculado_em');
  });
  await knex.raw(`ALTER TABLE indicacoes DROP CONSTRAINT IF EXISTS indicacoes_status_check;`);
  await knex.raw(`ALTER TABLE indicacoes ADD CONSTRAINT indicacoes_status_check
      CHECK (status IN ('pendente','fechada','cancelada'));`);
}
