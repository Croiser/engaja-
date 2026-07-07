// =====================================================================
// Motor de selos / níveis (configuráveis pelo admin).
//
// Selos são permanentes e independentes do saldo — resgatar pontos NUNCA os remove.
// Níveis (eh_nivel=true) são só selos cujo critério é pontos_acumulados_vida (só cresce),
// então o aluno também nunca "cai de nível".
//
// avaliarSelos roda SEMPRE dentro da transação do evento, DEPOIS de creditar/atualizar
// progresso, porque depende do estado já atualizado (saldo/acumulado/streak/etc).
// =====================================================================

// Mapeia cada tipo_criterio para o valor atual do aluno.
// treinos_total e indicacoes precisam de agregação; os demais leem colunas já mantidas.
async function valoresDoAluno(trx, aluno) {
  const [{ treinos }] = await trx('checkins')
    .where({ aluno_id: aluno.id, validado: true })
    .count({ treinos: '*' });

  const [{ indicacoes }] = await trx('indicacoes')
    .where({ indicador_id: aluno.id, status: 'matriculado' })
    .count({ indicacoes: '*' });

  const diasMatricula = aluno.data_matricula
    ? Math.floor((Date.now() - new Date(aluno.data_matricula).getTime()) / 86_400_000)
    : 0;

  return {
    pontos_acumulados_vida: aluno.pontos_acumulados_vida ?? 0,
    treinos_total: Number(treinos),
    streak: aluno.streak_maior ?? 0,
    indicacoes: Number(indicacoes),
    dias_matricula: diasMatricula,
  };
}

/**
 * Concede todos os selos ativos cujo critério o aluno atingiu e que ainda não possui.
 * Idempotente (ON CONFLICT DO NOTHING). Retorna os selos recém-concedidos para o front
 * exibir "novo selo!" no payload da resposta do evento.
 */
export async function avaliarSelos(trx, alunoId) {
  const aluno = await trx('usuarios')
    .where({ id: alunoId })
    .first('id', 'academia_id', 'pontos_acumulados_vida', 'streak_maior', 'data_matricula');
  if (!aluno) return [];

  const candidatos = await trx('selos')
    .where({ academia_id: aluno.academia_id, ativo: true })
    .whereNotIn('id', trx('alunos_selos').select('selo_id').where('aluno_id', alunoId));
  if (candidatos.length === 0) return [];

  const valores = await valoresDoAluno(trx, aluno);
  const merecidos = candidatos.filter((s) => (valores[s.tipo_criterio] ?? 0) >= s.meta);
  if (merecidos.length === 0) return [];

  await trx('alunos_selos')
    .insert(merecidos.map((s) => ({ aluno_id: alunoId, selo_id: s.id })))
    .onConflict(['aluno_id', 'selo_id'])
    .ignore();

  return merecidos;
}

/** Concede um selo específico (ex.: selo vinculado a um desafio concluído). */
export async function concederSelo(trx, alunoId, seloId) {
  await trx('alunos_selos')
    .insert({ aluno_id: alunoId, selo_id: seloId })
    .onConflict(['aluno_id', 'selo_id'])
    .ignore();
}

/** Nível atual = selo eh_nivel de maior meta já conquistado. Puro, sem acessar o banco. */
export function calcularNivelAtual(selosDoAluno) {
  const niveis = selosDoAluno.filter((s) => s.eh_nivel).sort((a, b) => b.meta - a.meta);
  return niveis[0] ?? null;
}
