import bcrypt from 'bcryptjs';
import * as ledger from '../../engine/ledger.js';
import { avaliarSelos } from '../../engine/selos.js';
import { notificar } from '../../utils/notificacoes.js';
import { registrar } from '../../utils/auditoria.js';
import { Erros } from '../../utils/errors.js';

const PONTOS_INDICACAO = 500;

export async function listar(dbh, { page, limit, q, vencendo }) {
  const base = dbh('usuarios').where({ tipo: 'aluno' });
  if (q) {
    base.andWhere((qb) =>
      qb.whereILike('nome', `%${q}%`).orWhereILike('matricula', `%${q}%`).orWhereILike('cpf', `%${q}%`),
    );
  }
  if (vencendo) base.andWhereRaw(`data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + 30`);

  const [{ total }] = await base.clone().count({ total: '*' });
  const itens = await base
    .clone()
    .orderBy('nome', 'asc')
    .limit(limit)
    .offset((page - 1) * limit)
    .select('id', 'nome', 'matricula', 'cpf', 'telefone', 'plano', 'data_vencimento', 'saldo_atual', 'ativo');
  return { itens, total: Number(total), page, limit };
}

export async function obter(dbh, id) {
  const aluno = await dbh('usuarios')
    .where({ id, tipo: 'aluno' })
    .first('id', 'nome', 'matricula', 'cpf', 'telefone', 'email', 'plano', 'data_vencimento', 'data_nascimento', 'saldo_atual', 'pontos_acumulados_vida', 'streak_atual', 'ativo', 'criado_em');
  if (!aluno) throw Erros.naoEncontrado('Aluno');
  return aluno;
}

// Cria aluno (senha padrão "123"). Se `indicado_por`, credita +500 ao indicador + notifica.
export async function criar(dbh, ator, dados, req) {
  // Enforcement do plano SaaS: academia com assinatura cujo plano tem teto de alunos
  // não passa do limite (RLS já restringe a consulta à academia do ator). Academia sem
  // assinatura não é bloqueada — cadastro/venda assistida define o plano depois.
  const assinatura = await dbh('assinaturas as s')
    .join('planos as p', 'p.id', 's.plano_id')
    .whereNot('s.status', 'cancelada')
    .first('p.limite_alunos');
  if (assinatura?.limite_alunos != null) {
    const [{ ativos }] = await dbh('usuarios').where({ tipo: 'aluno', ativo: true }).count({ ativos: '*' });
    if (Number(ativos) >= assinatura.limite_alunos) throw Erros.limiteAlunos(assinatura.limite_alunos);
  }

  const { indicado_por, ...campos } = dados;
  const senhaHash = await bcrypt.hash('123', 10);
  const [aluno] = await dbh('usuarios')
    .insert({ ...campos, academia_id: ator.academia_id, tipo: 'aluno', senha_hash: senhaHash, indicado_por: indicado_por ?? null })
    .returning(['id', 'nome']);

  if (indicado_por) {
    await ledger.creditar(dbh, {
      alunoId: indicado_por,
      academiaId: ator.academia_id,
      tipoEvento: 'indicacao',
      quantidade: PONTOS_INDICACAO,
      descricao: `Indicação de ${aluno.nome} fechou matrícula`,
      auditadoPor: ator.id,
      validado: true,
    });
    await avaliarSelos(dbh, indicado_por);
    await notificar(dbh, {
      usuarioId: indicado_por,
      academiaId: ator.academia_id,
      tipo: 'pontos',
      titulo: 'Sua indicação fechou! 🎉',
      corpo: `${aluno.nome} se matriculou. Você ganhou ${PONTOS_INDICACAO} pontos!`,
      url: '/me/pontos',
    });
  }

  await registrar(dbh, { academiaId: ator.academia_id, usuarioId: ator.id, acao: 'cria_aluno', entidade: 'aluno', entidadeId: aluno.id, detalhes: { matricula: campos.matricula }, req });
  return aluno;
}

export async function atualizar(dbh, ator, id, dados, req) {
  const [aluno] = await dbh('usuarios').where({ id, tipo: 'aluno' }).update(dados).returning(['id']);
  if (!aluno) throw Erros.naoEncontrado('Aluno');
  await registrar(dbh, { academiaId: ator.academia_id, usuarioId: ator.id, acao: 'edita_aluno', entidade: 'aluno', entidadeId: id, detalhes: dados, req });
  return { ok: true };
}

// Inativa e ZERA o saldo (evento no ledger, nunca DELETE retroativo). Ver ledger.zerarSaldo.
export async function cancelar(dbh, ator, id, req) {
  const aluno = await dbh('usuarios').where({ id, tipo: 'aluno' }).first('id');
  if (!aluno) throw Erros.naoEncontrado('Aluno');

  await ledger.zerarSaldo(dbh, { alunoId: id, academiaId: ator.academia_id, auditadoPor: ator.id });
  await dbh('usuarios').where({ id }).update({ ativo: false });
  await registrar(dbh, { academiaId: ator.academia_id, usuarioId: ator.id, acao: 'cancela_aluno', entidade: 'aluno', entidadeId: id, req });
  return { ok: true };
}

// Ajuste manual de pontos (+/-). Usa o MESMO engine, com auditoria. Reavalia selos.
export async function ajustarPontos(dbh, ator, id, { quantidade, motivo }, req) {
  const aluno = await dbh('usuarios').where({ id, tipo: 'aluno' }).first('id', 'academia_id');
  if (!aluno) throw Erros.naoEncontrado('Aluno');

  if (quantidade > 0) {
    await ledger.creditar(dbh, { alunoId: id, academiaId: ator.academia_id, tipoEvento: 'ajuste_manual', quantidade, descricao: motivo, auditadoPor: ator.id, validado: true });
  } else {
    await ledger.debitar(dbh, { alunoId: id, academiaId: ator.academia_id, tipoEvento: 'ajuste_manual', quantidade: -quantidade, descricao: motivo, auditadoPor: ator.id });
  }
  await avaliarSelos(dbh, id);
  await registrar(dbh, { academiaId: ator.academia_id, usuarioId: ator.id, acao: 'ajuste_pontos', entidade: 'aluno', entidadeId: id, detalhes: { quantidade, motivo }, req });
  return { ok: true };
}
