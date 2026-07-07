// Dashboard e relatórios (gerente). Os 4 cards pedidos na reunião + alunos por nível.

export async function dashboard(dbh) {
  const [alunos] = await dbh('usuarios').where({ tipo: 'aluno', ativo: true }).count({ n: '*' });
  const [ativos] = await dbh('usuarios').where({ tipo: 'aluno', ativo: true }).andWhereRaw('(data_vencimento IS NULL OR data_vencimento >= CURRENT_DATE)').count({ n: '*' });
  const [vencendo] = await dbh('usuarios').where({ tipo: 'aluno', ativo: true }).andWhereRaw('data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30').count({ n: '*' });
  const [parceiros] = await dbh('parceiros').where({ ativo: true }).count({ n: '*' });

  return {
    alunos_ativos: Number(alunos.n),
    clube_em_dia: Number(ativos.n),
    vencendo_30d: Number(vencendo.n),
    parceiros_ativos: Number(parceiros.n),
    alunos_por_nivel: await alunosPorNivel(dbh),
  };
}

// Distribuição por nível ATUAL (o selo eh_nivel de maior meta que cada aluno alcançou).
async function alunosPorNivel(dbh) {
  const linhas = await dbh('alunos_selos as a')
    .join('selos as s', 's.id', 'a.selo_id')
    .join('usuarios as u', function () {
      this.on('u.id', 'a.aluno_id').andOnVal('u.ativo', true);
    })
    .where('s.eh_nivel', true)
    .select('a.aluno_id', 's.nome', 's.meta');

  // Para cada aluno, fica o nível de maior meta.
  const maiorPorAluno = new Map();
  for (const l of linhas) {
    const atual = maiorPorAluno.get(l.aluno_id);
    if (!atual || l.meta > atual.meta) maiorPorAluno.set(l.aluno_id, { nome: l.nome, meta: l.meta });
  }
  const tally = {};
  for (const { nome } of maiorPorAluno.values()) tally[nome] = (tally[nome] ?? 0) + 1;
  return tally;
}

// Relatório: clubes vencendo em 30 dias (alerta importante da reunião).
export const relVencimentos = (dbh) =>
  dbh('usuarios')
    .where({ tipo: 'aluno', ativo: true })
    .andWhereRaw('data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30')
    .orderBy('data_vencimento', 'asc')
    .select('id', 'nome', 'matricula', 'telefone', 'plano', 'data_vencimento');

// Relatório: parceiros ativos + quantas vezes o benefício foi confirmado.
export const relParceiros = (dbh) =>
  dbh('parceiros as p')
    .leftJoin('usos_beneficio as u', function () {
      this.on('u.parceiro_id', 'p.id').andOnVal('u.status', 'confirmado');
    })
    .where('p.ativo', true)
    .groupBy('p.id', 'p.nome', 'p.tipo_beneficio', 'p.valor_desconto')
    .orderBy('p.nome', 'asc')
    .select('p.id', 'p.nome', 'p.tipo_beneficio', 'p.valor_desconto')
    .count({ usos: 'u.id' });

// Auditoria paginada (com nome de quem fez).
export async function auditoria(dbh, { page = 1, limit = 30, acao = null }) {
  const base = dbh('auditoria_logs as l').leftJoin('usuarios as u', 'u.id', 'l.usuario_id');
  if (acao) base.where('l.acao', acao);
  const [{ total }] = await base.clone().count({ total: 'l.id' });
  const itens = await base
    .clone()
    .orderBy('l.criado_em', 'desc')
    .limit(limit)
    .offset((page - 1) * limit)
    .select('l.id', 'l.acao', 'l.entidade', 'l.entidade_id', 'l.detalhes', 'l.criado_em', 'u.nome as autor');
  return { itens, total: Number(total), page, limit };
}
