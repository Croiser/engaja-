// =====================================================================
// Administração SaaS: planos (catálogo global), assinaturas (1 por academia)
// e pagamentos (histórico manual — Pix/link — até a integração Asaas existir).
//
// Valores monetários em CENTAVOS (int) — evita float e já fica no formato que
// gateways (Asaas/Stripe) usam. R$249,00 = 24900.
//
// `planos` NÃO tem RLS: é catálogo global da plataforma, sem dado sensível — o
// gerente pode precisar ler o próprio plano no futuro. `assinaturas`/`pagamentos`
// entram no RLS padrão por academia_id (fail-closed, espelhando 0002/0004).
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
  // ---- Catálogo de planos (editável pelo superadmin, sem mexer em código) ----
  await knex.schema.createTable('planos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('nome', 60).notNullable().unique();
    t.integer('preco_implantacao_centavos').notNullable().defaultTo(0);
    t.integer('preco_mensal_centavos').notNullable();
    t.integer('limite_alunos'); // null = ilimitado
    t.boolean('ativo').defaultTo(true);
    t.timestamp('criado_em', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Planos vigentes (decisão do Douglas, 08/07/2026). Editáveis depois pelo painel.
  await knex.raw(`
    INSERT INTO planos (nome, preco_implantacao_centavos, preco_mensal_centavos, limite_alunos)
    VALUES ('Growth', 24900, 24900, 300), ('Premium', 45000, 45000, NULL)
    ON CONFLICT (nome) DO NOTHING;
  `);

  // ---- Assinatura da academia (no máximo 1 por academia) ----
  await knex.schema.createTable('assinaturas', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('academia_id').notNullable().unique().references('id').inTable('academias');
    t.uuid('plano_id').notNullable().references('id').inTable('planos');
    t.string('status', 20).notNullable().defaultTo('ativa'); // ativa | inadimplente | cancelada
    t.date('inicio').notNullable().defaultTo(knex.fn.now());
    t.integer('dia_vencimento').notNullable().defaultTo(5); // dia do mês (1-28)
    t.date('pago_ate'); // até quando está quite (controle manual até o Asaas)
    t.text('observacoes');
    t.timestamp('criado_em', { useTz: true }).defaultTo(knex.fn.now());
    t.timestamp('atualizado_em', { useTz: true }).defaultTo(knex.fn.now());
  });
  await knex.raw(`ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_status_check
      CHECK (status IN ('ativa','inadimplente','cancelada'));`);
  await knex.raw(`ALTER TABLE assinaturas ADD CONSTRAINT assinaturas_dia_check
      CHECK (dia_vencimento BETWEEN 1 AND 28);`);

  // ---- Histórico de pagamentos (append-only, mesmo espírito do ledger) ----
  await knex.schema.createTable('pagamentos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('assinatura_id').notNullable().references('id').inTable('assinaturas');
    t.uuid('academia_id').notNullable().references('id').inTable('academias');
    t.integer('valor_centavos').notNullable();
    t.string('referente_a', 120).notNullable(); // ex.: "Implantação", "Mensalidade 07/2026"
    t.date('pago_em').notNullable().defaultTo(knex.fn.now());
    t.uuid('registrado_por').references('id').inTable('usuarios');
    t.timestamp('criado_em', { useTz: true }).defaultTo(knex.fn.now());
  });
  await knex.raw(`CREATE INDEX idx_pagamentos_assinatura ON pagamentos(assinatura_id, pago_em DESC);`);

  await ligarRls(knex, 'assinaturas');
  await ligarRls(knex, 'pagamentos');

  // A role da API (clube_app) herda grants em tabelas novas via ALTER DEFAULT PRIVILEGES
  // (0003) — nada a fazer aqui.
}

export async function down(knex) {
  for (const t of ['pagamentos', 'assinaturas']) {
    await knex.raw(`DROP POLICY IF EXISTS tenant_isolation ON ${t};`);
    await knex.schema.dropTableIfExists(t);
  }
  await knex.schema.dropTableIfExists('planos');
}
