import { assinarQr } from '../../utils/jwt.js';
import { calcularNivelAtual } from '../../engine/selos.js';
import { Erros } from '../../utils/errors.js';

// Todos os métodos recebem `dbh` = handle com contexto de TENANT (req.db, via RLS).
// Nunca usar o `db` global aqui: sem o tenant setado, o RLS devolveria 0 linhas.

// Dados estáticos da carteirinha (o QR renovável vem de gerarQrCarteirinha, separado).
export async function carteirinha(dbh, alunoId) {
  const aluno = await dbh('usuarios')
    .where({ id: alunoId })
    .first(
      'id',
      'nome',
      'matricula',
      'plano',
      'data_vencimento',
      'saldo_atual',
      'pontos_acumulados_vida',
    );
  if (!aluno) throw Erros.naoEncontrado('Aluno');

  const nivel = await nivelAtual(dbh, alunoId);
  return {
    nome: aluno.nome,
    matricula: aluno.matricula,
    plano: aluno.plano,
    data_vencimento: aluno.data_vencimento,
    saldo: aluno.saldo_atual,
    nivel: nivel ? { nome: nivel.nome, icone: nivel.icone, imagem_url: nivel.imagem_url } : null,
  };
}

// QR renovável da carteirinha: JWT curto (TTL do env), secret separado do de sessão.
export function gerarQrCarteirinha(aluno) {
  const qr = assinarQr({ sub: aluno.id, academia_id: aluno.academia_id, tipo: 'carteirinha' });
  return { qr };
}

export async function saldo(dbh, alunoId) {
  const u = await dbh('usuarios').where({ id: alunoId }).first('saldo_atual', 'pontos_acumulados_vida');
  return { saldo: u.saldo_atual, acumulado_vida: u.pontos_acumulados_vida };
}

// Extrato paginado do ledger (nunca expira → paginação obrigatória).
export async function extrato(dbh, alunoId, { page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const [{ total }] = await dbh('pontos_ledger').where({ aluno_id: alunoId }).count({ total: '*' });
  const itens = await dbh('pontos_ledger')
    .where({ aluno_id: alunoId })
    .orderBy('criado_em', 'desc')
    .limit(limit)
    .offset(offset)
    .select('id', 'tipo_evento', 'quantidade', 'descricao', 'validado', 'criado_em');
  return { itens, total: Number(total), page, limit };
}

// Selos do aluno: conquistados + bloqueados com progresso (para a grid do Perfil).
export async function selosDoAluno(dbh, alunoId) {
  const aluno = await dbh('usuarios')
    .where({ id: alunoId })
    .first('academia_id', 'pontos_acumulados_vida', 'streak_maior', 'data_matricula');

  const [catalogo, conquistados] = await Promise.all([
    dbh('selos').where({ academia_id: aluno.academia_id, ativo: true }),
    dbh('alunos_selos').where({ aluno_id: alunoId }).select('selo_id', 'conquistado_em'),
  ]);
  const conquistadosMap = new Map(conquistados.map((c) => [c.selo_id, c.conquistado_em]));

  const [{ treinos }] = await dbh('checkins')
    .where({ aluno_id: alunoId, validado: true })
    .count({ treinos: '*' });
  const [{ indicacoes }] = await dbh('indicacoes')
    .where({ indicador_id: alunoId, status: 'matriculado' })
    .count({ indicacoes: '*' });
  const diasMatricula = aluno.data_matricula
    ? Math.floor((Date.now() - new Date(aluno.data_matricula).getTime()) / 86_400_000)
    : 0;

  const valores = {
    pontos_acumulados_vida: aluno.pontos_acumulados_vida,
    treinos_total: Number(treinos),
    streak: aluno.streak_maior,
    indicacoes: Number(indicacoes),
    dias_matricula: diasMatricula,
  };

  return catalogo.map((s) => {
    const atual = valores[s.tipo_criterio] ?? 0;
    const conquistadoEm = conquistadosMap.get(s.id) ?? null;
    return {
      id: s.id,
      nome: s.nome,
      icone: s.icone,
      imagem_url: s.imagem_url,
      eh_nivel: s.eh_nivel,
      meta: s.meta,
      progresso: Math.min(atual, s.meta),
      conquistado: !!conquistadoEm,
      conquistado_em: conquistadoEm,
    };
  });
}

// Desafios ativos da academia (dentro da janela de datas) + progresso do aluno.
export async function desafios(dbh, alunoId) {
  const lista = await dbh('desafios as d')
    .leftJoin('desafios_progresso as p', function () {
      this.on('p.desafio_id', 'd.id').andOn('p.aluno_id', dbh.raw('?', [alunoId]));
    })
    .where('d.ativo', true)
    .andWhere((qb) => qb.whereNull('d.data_inicio').orWhereRaw('d.data_inicio <= CURRENT_DATE'))
    .andWhere((qb) => qb.whereNull('d.data_fim').orWhereRaw('d.data_fim >= CURRENT_DATE'))
    .orderBy('d.criado_em', 'desc')
    .select(
      'd.id',
      'd.nome',
      'd.descricao',
      'd.tipo',
      'd.pontos',
      'd.meta',
      dbh.raw('COALESCE(p.progresso, 0) AS progresso'),
      dbh.raw('COALESCE(p.concluido, false) AS concluido'),
    );
  return lista;
}

async function nivelAtual(dbh, alunoId) {
  const niveis = await dbh('selos as s')
    .join('alunos_selos as a', 'a.selo_id', 's.id')
    .where({ 'a.aluno_id': alunoId, 's.eh_nivel': true })
    .select('s.nome', 's.icone', 's.imagem_url', 's.meta');
  return calcularNivelAtual(niveis);
}
