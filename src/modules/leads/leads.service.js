import bcrypt from 'bcryptjs';
import * as ledger from '../../engine/ledger.js';
import { avaliarSelos } from '../../engine/selos.js';
import { notificar, notificarVarios } from '../../utils/notificacoes.js';
import { registrar } from '../../utils/auditoria.js';
import { Erros } from '../../utils/errors.js';

const PONTOS_INDICACAO = 500;

// ---------------- LADO ALUNO ----------------

// Aluno registra uma indicação → cria lead 'novo' e avisa a recepção/gerência.
export async function criarIndicacao(dbh, aluno, dados) {
  const [lead] = await dbh('indicacoes')
    .insert({
      academia_id: aluno.academia_id,
      indicador_id: aluno.id,
      origem: 'indicacao_aluno',
      nome_indicado: dados.nome_indicado,
      telefone_indicado: dados.telefone_indicado ?? null,
      email_indicado: dados.email_indicado ?? null,
      status: 'novo',
    })
    .returning('*');

  // Notifica quem trabalha leads (recepção + gerência da academia).
  const staff = await dbh('usuarios')
    .where({ academia_id: aluno.academia_id, ativo: true })
    .whereIn('tipo', ['recepcao', 'gerente'])
    .pluck('id');
  await notificarVarios(dbh, staff, {
    academiaId: aluno.academia_id,
    tipo: 'lead_novo',
    titulo: 'Novo lead de indicação',
    corpo: `${aluno.nome} indicou ${dados.nome_indicado}${dados.telefone_indicado ? ' (' + dados.telefone_indicado + ')' : ''}.`,
    url: `/admin/leads/${lead.id}`,
  });

  return lead;
}

export async function minhasIndicacoes(dbh, alunoId) {
  return dbh('indicacoes')
    .where({ indicador_id: alunoId })
    .orderBy('criado_em', 'desc')
    .select('id', 'nome_indicado', 'status', 'criado_em', 'matriculado_em');
}

// ---------------- LADO RECEPÇÃO/GERENTE (CRM) ----------------

export async function listarLeads(dbh, { status = null }) {
  const q = dbh('indicacoes as i')
    .leftJoin('usuarios as ind', 'ind.id', 'i.indicador_id')
    .leftJoin('usuarios as resp', 'resp.id', 'i.responsavel_id')
    .orderBy('i.criado_em', 'desc')
    .select(
      'i.id',
      'i.nome_indicado',
      'i.telefone_indicado',
      'i.status',
      'i.origem',
      'i.proximo_contato_em',
      'i.criado_em',
      'ind.nome as indicador_nome',
      'resp.nome as responsavel_nome',
    );
  if (status) q.where('i.status', status);
  return q;
}

export async function obterLead(dbh, id) {
  const lead = await dbh('indicacoes').where({ id }).first();
  if (!lead) throw Erros.naoEncontrado('Lead');
  const interacoes = await dbh('leads_interacoes')
    .where({ lead_id: id })
    .orderBy('criado_em', 'desc')
    .select('id', 'tipo', 'texto', 'autor_id', 'criado_em');
  return { ...lead, interacoes };
}

export async function atualizarLead(dbh, ator, id, dados, req) {
  const atual = await dbh('indicacoes').where({ id }).first('status');
  if (!atual) throw Erros.naoEncontrado('Lead');

  const [lead] = await dbh('indicacoes').where({ id }).update(dados).returning('*');

  // Registra mudança de estágio na timeline do lead.
  if (dados.status && dados.status !== atual.status) {
    await dbh('leads_interacoes').insert({
      lead_id: id,
      academia_id: ator.academia_id,
      autor_id: ator.id,
      tipo: 'mudanca_status',
      texto: `${atual.status} → ${dados.status}`,
    });
  }
  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'atualiza_lead',
    entidade: 'lead',
    entidadeId: id,
    detalhes: dados,
    req,
  });
  return lead;
}

export async function adicionarInteracao(dbh, ator, leadId, dados) {
  const lead = await dbh('indicacoes').where({ id: leadId }).first('id');
  if (!lead) throw Erros.naoEncontrado('Lead');
  const [it] = await dbh('leads_interacoes')
    .insert({
      lead_id: leadId,
      academia_id: ator.academia_id,
      autor_id: ator.id,
      tipo: dados.tipo,
      texto: dados.texto,
    })
    .returning('*');
  return it;
}

// Converte o lead em aluno matriculado: cria o usuário (senha padrão "123"), vincula
// indicado_por, credita +500 ao indicador e avisa. Tudo na transação do req.db.
export async function converterLead(dbh, ator, leadId, dadosAluno, req) {
  const lead = await dbh('indicacoes').where({ id: leadId }).first();
  if (!lead) throw Erros.naoEncontrado('Lead');
  if (lead.status === 'matriculado') throw Erros.naoEncontrado('Lead já matriculado');

  const senhaHash = await bcrypt.hash('123', 10);
  const [novoAluno] = await dbh('usuarios')
    .insert({
      academia_id: ator.academia_id,
      tipo: 'aluno',
      nome: lead.nome_indicado,
      matricula: dadosAluno.matricula,
      cpf: dadosAluno.cpf ?? null,
      telefone: lead.telefone_indicado ?? null,
      email: lead.email_indicado ?? null,
      plano: dadosAluno.plano ?? null,
      data_vencimento: dadosAluno.data_vencimento ?? null,
      senha_hash: senhaHash,
      indicado_por: lead.indicador_id ?? null,
    })
    .returning(['id', 'nome']);

  await dbh('indicacoes').where({ id: leadId }).update({
    status: 'matriculado',
    aluno_indicado_id: novoAluno.id,
    matriculado_em: dbh.fn.now(),
  });

  // Recompensa o indicador (se houver): +500 + reavalia selos (Embaixador em 5).
  if (lead.indicador_id) {
    await ledger.creditar(dbh, {
      alunoId: lead.indicador_id,
      academiaId: ator.academia_id,
      tipoEvento: 'indicacao',
      quantidade: PONTOS_INDICACAO,
      descricao: `Indicação de ${lead.nome_indicado} fechou matrícula`,
      refId: leadId,
      auditadoPor: ator.id,
      validado: true,
    });
    await avaliarSelos(dbh, lead.indicador_id);
    await notificar(dbh, {
      usuarioId: lead.indicador_id,
      academiaId: ator.academia_id,
      tipo: 'pontos',
      titulo: 'Sua indicação fechou! 🎉',
      corpo: `${lead.nome_indicado} se matriculou. Você ganhou ${PONTOS_INDICACAO} pontos!`,
      url: '/me/pontos',
    });
  }

  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'converte_lead',
    entidade: 'lead',
    entidadeId: leadId,
    detalhes: { aluno_id: novoAluno.id, indicador_id: lead.indicador_id, pontos: lead.indicador_id ? PONTOS_INDICACAO : 0 },
    req,
  });

  return { aluno_id: novoAluno.id, indicador_creditado: !!lead.indicador_id };
}
