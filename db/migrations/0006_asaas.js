// =====================================================================
// Fase 1 — integração Asaas (cobrança recorrente real).
//
// Estende as tabelas de 0005 com os identificadores do lado do Asaas:
//   - academias.asaas_customer_id : o "cliente" no Asaas (1 por academia)
//   - assinaturas.asaas_subscription_id : a assinatura recorrente no Asaas
//   - pagamentos ganha asaas_payment_id + status + forma (pra reconciliar webhook)
//
// Também cria `webhook_eventos`: log idempotente dos webhooks recebidos do Asaas
// (o Asaas reentrega em caso de falha — a gente precisa ignorar duplicados).
// Sem RLS: é infra de plataforma, escrita só pelo endpoint de webhook (comSistema).
// =====================================================================

export async function up(knex) {
  await knex.schema.alterTable('academias', (t) => {
    t.string('asaas_customer_id', 40).unique();
  });

  await knex.schema.alterTable('assinaturas', (t) => {
    t.string('asaas_subscription_id', 40).unique();
    // dias de tolerância antes de suspender por inadimplência (carência combinada 2-3 dias)
    t.integer('dias_carencia').notNullable().defaultTo(3);
    // quando a cobrança venceu e não foi paga (marca o início da carência)
    t.date('inadimplente_desde');
  });

  // pagamentos: hoje é histórico manual; passa a servir também pros pagos via Asaas.
  await knex.schema.alterTable('pagamentos', (t) => {
    t.string('asaas_payment_id', 40).unique();
    t.string('status', 20).notNullable().defaultTo('confirmado'); // pendente | confirmado | vencido | estornado
    t.string('forma', 20); // pix | boleto | cartao | manual
    t.date('vencimento');
  });
  // Pagamentos manuais antigos já nascem "confirmado" (default) — nada a migrar.

  // Log idempotente de webhooks (o Asaas manda um `id` de evento único).
  await knex.schema.createTable('webhook_eventos', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('provedor', 20).notNullable().defaultTo('asaas');
    t.string('evento_id', 80).notNullable(); // id do evento no provedor
    t.string('tipo', 60); // PAYMENT_CONFIRMED, PAYMENT_OVERDUE, etc.
    t.jsonb('payload').notNullable();
    t.timestamp('recebido_em', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['provedor', 'evento_id']); // idempotência: mesmo evento não processa 2x
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('webhook_eventos');
  await knex.schema.alterTable('pagamentos', (t) => {
    t.dropColumn('asaas_payment_id');
    t.dropColumn('status');
    t.dropColumn('forma');
    t.dropColumn('vencimento');
  });
  await knex.schema.alterTable('assinaturas', (t) => {
    t.dropColumn('asaas_subscription_id');
    t.dropColumn('dias_carencia');
    t.dropColumn('inadimplente_desde');
  });
  await knex.schema.alterTable('academias', (t) => {
    t.dropColumn('asaas_customer_id');
  });
}
