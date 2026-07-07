// Seed de DESENVOLVIMENTO: 1 academia demo + usuários + catálogo de selos/níveis.
// Torna login e carteirinha testáveis de ponta a ponta. NÃO usar em produção.
// Senha inicial de todos = "123" (força troca no 1º login).
import bcrypt from 'bcryptjs';

export async function seed(knexRoot) {
  // RLS está ativo (migration 0002). O seed é cross-tenant → roda em bypass,
  // dentro de uma transação (SET LOCAL vale só nela). Sem isto, os INSERTs
  // bateriam no WITH CHECK das políticas e falhariam.
  await knexRoot.transaction(async (knex) => {
    await knex.raw(`SELECT set_config('app.bypass', 'on', true)`);
    await popular(knex);
  });
}

async function popular(knex) {
  // Idempotente e robusto: TRUNCATE CASCADE zera tudo respeitando FKs automaticamente
  // (inclui tabelas novas: leads_interacoes, notificacoes, push_subscriptions). Dev only.
  // Como tudo referencia academias, truncar academias cascateia para o resto.
  await knex.raw('TRUNCATE academias CASCADE');

  const senhaHash = await bcrypt.hash('123', 10);

  const [academia] = await knex('academias')
    .insert({
      nome: 'Academia Boa Forma',
      slug: 'boaformafoz',
      cor_primaria: '#0A0A0A',
      cor_secundaria: '#F5B301',
    })
    .returning('*');

  await knex('usuarios').insert([
    {
      academia_id: academia.id,
      tipo: 'gerente',
      nome: 'Gerente Demo',
      cpf: '00000000000',
      email: 'gerente@boaformafoz.com',
      senha_hash: senhaHash,
    },
    {
      academia_id: academia.id,
      tipo: 'recepcao',
      nome: 'Recepção Demo',
      cpf: '11111111111',
      senha_hash: senhaHash,
    },
    {
      academia_id: academia.id,
      tipo: 'aluno',
      nome: 'João da Silva',
      matricula: 'BF000001',
      cpf: '22222222222',
      telefone: '45999990000',
      plano: 'Plano Anual',
      data_vencimento: knex.raw(`CURRENT_DATE + interval '90 days'`),
      data_nascimento: '1960-05-20',
      senha_hash: senhaHash,
    },
  ]);

  // Catálogo: níveis (eh_nivel=TRUE, critério pontos_acumulados_vida) + conquistas.
  await knex('selos').insert([
    { academia_id: academia.id, nome: 'Bronze', icone: 'bronze', tipo_criterio: 'pontos_acumulados_vida', meta: 0, eh_nivel: true },
    { academia_id: academia.id, nome: 'Prata', icone: 'prata', tipo_criterio: 'pontos_acumulados_vida', meta: 2500, eh_nivel: true },
    { academia_id: academia.id, nome: 'Ouro', icone: 'ouro', tipo_criterio: 'pontos_acumulados_vida', meta: 5000, eh_nivel: true },
    { academia_id: academia.id, nome: 'Platina', icone: 'platina', tipo_criterio: 'pontos_acumulados_vida', meta: 10000, eh_nivel: true },
    { academia_id: academia.id, nome: '100 Treinos', icone: 'treino', tipo_criterio: 'treinos_total', meta: 100, eh_nivel: false },
    { academia_id: academia.id, nome: 'Maratonista', icone: 'maratona', tipo_criterio: 'treinos_total', meta: 300, eh_nivel: false },
    { academia_id: academia.id, nome: '50 Check-ins Consecutivos', icone: 'streak', tipo_criterio: 'streak', meta: 50, eh_nivel: false },
    { academia_id: academia.id, nome: '1 Ano de Academia', icone: 'ano', tipo_criterio: 'dias_matricula', meta: 365, eh_nivel: false },
    { academia_id: academia.id, nome: 'Embaixador Boa Forma', icone: 'embaixador', tipo_criterio: 'indicacoes', meta: 5, eh_nivel: false },
  ]);

  console.log(`✅ Seed dev: academia ${academia.id} | login aluno: matrícula BF000001 (ou CPF 22222222222) senha "123"`);
}
