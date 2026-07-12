import bcrypt from 'bcryptjs';
import { registrar } from '../../utils/auditoria.js';
import { Erros } from '../../utils/errors.js';

// Slug curto e legível (URL-safe) a partir do nome. Sem acento, minúsculo, hífens.
function gerarSlugBase(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (após NFD, viram marcas combinantes)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Garante slug único (cross-tenant: dbh aqui é SEMPRE contexto de sistema/bypass).
async function gerarSlugUnico(dbh, nome) {
  const base = gerarSlugBase(nome) || 'academia';
  for (let i = 0; ; i++) {
    const tentativa = i === 0 ? base : `${base}-${i}`;
    const existe = await dbh('academias').where({ slug: tentativa }).first('id');
    if (!existe) return tentativa;
  }
}

// Lista todas as academias (cross-tenant) com contagem de alunos — visão do super-admin.
export function listarAcademias(dbh) {
  return dbh('academias as a')
    .leftJoin('usuarios as u', function () {
      this.on('u.academia_id', 'a.id').andOnVal('u.tipo', 'aluno').andOnVal('u.ativo', true);
    })
    .groupBy('a.id')
    .orderBy('a.criado_em', 'desc')
    .select('a.id', 'a.nome', 'a.slug', 'a.dominio', 'a.ativo', 'a.criado_em')
    .count('u.id as total_alunos');
}

// Nunca devolver `qr_secret` — segredo que assina os QR codes da carteirinha, sem
// necessidade de aparecer em nenhuma resposta de API (nem pro superadmin).
const COLUNAS_PUBLICAS = ['id', 'nome', 'slug', 'dominio', 'logo_url', 'cor_primaria', 'cor_secundaria', 'ativo', 'criado_em'];

export async function obterAcademia(dbh, id) {
  const academia = await dbh('academias').where({ id }).first(COLUNAS_PUBLICAS);
  if (!academia) throw Erros.naoEncontrado('Academia');
  const [{ total_alunos }] = await dbh('usuarios')
    .where({ academia_id: id, tipo: 'aluno', ativo: true })
    .count({ total_alunos: '*' });
  const [{ total_staff }] = await dbh('usuarios')
    .where({ academia_id: id })
    .whereIn('tipo', ['gerente', 'recepcao'])
    .count({ total_staff: '*' });
  const assinatura = await dbh('assinaturas as s')
    .join('planos as p', 'p.id', 's.plano_id')
    .where('s.academia_id', id)
    .first(
      's.id', 's.plano_id', 's.status', 's.inicio', 's.dia_vencimento', 's.pago_ate', 's.observacoes',
      'p.nome as plano_nome', 'p.preco_mensal_centavos', 'p.preco_implantacao_centavos', 'p.limite_alunos',
    );
  return {
    ...academia,
    total_alunos: Number(total_alunos),
    total_staff: Number(total_staff),
    assinatura: assinatura ?? null,
  };
}

// Cria a academia + o gerente inicial (senha padrão "123" — mesmo padrão de criar aluno).
// Onboarding manual/venda assistida por ora (Fase 1 do pivot SaaS ainda não tem checkout).
export async function criarAcademia(dbh, ator, dados, req) {
  const { gerente_nome, gerente_login, ...camposAcademia } = dados;
  const slug = await gerarSlugUnico(dbh, camposAcademia.nome);

  const [academia] = await dbh('academias')
    .insert({
      ...camposAcademia,
      slug,
      cor_primaria: camposAcademia.cor_primaria || '#0A0A0A',
      cor_secundaria: camposAcademia.cor_secundaria || '#F5B301',
    })
    .returning(COLUNAS_PUBLICAS);

  const senhaHash = await bcrypt.hash('123', 10);
  const [gerente] = await dbh('usuarios')
    .insert({
      academia_id: academia.id,
      tipo: 'gerente',
      nome: gerente_nome,
      matricula: gerente_login,
      senha_hash: senhaHash,
    })
    .returning(['id', 'nome', 'matricula']);

  await registrar(dbh, {
    academiaId: academia.id,
    usuarioId: ator.id,
    acao: 'cria_academia',
    entidade: 'academia',
    entidadeId: academia.id,
    detalhes: { nome: academia.nome, slug, gerente_login },
    req,
  });

  return { academia, gerente };
}

export async function atualizarAcademia(dbh, ator, id, dados, req) {
  const [academia] = await dbh('academias').where({ id }).update(dados).returning(COLUNAS_PUBLICAS);
  if (!academia) throw Erros.naoEncontrado('Academia');
  await registrar(dbh, {
    academiaId: id,
    usuarioId: ator.id,
    acao: 'edita_academia',
    entidade: 'academia',
    entidadeId: id,
    detalhes: dados,
    req,
  });
  return academia;
}

// Suspender barra login/sessão de TODOS os usuários da academia na hora (ver
// middlewares/auth.js e auth.service.js — checam academias.ativo a cada requisição).
export async function suspenderAcademia(dbh, ator, id, req) {
  const n = await dbh('academias').where({ id }).update({ ativo: false });
  if (!n) throw Erros.naoEncontrado('Academia');
  await registrar(dbh, { academiaId: id, usuarioId: ator.id, acao: 'suspende_academia', entidade: 'academia', entidadeId: id, req });
}

export async function reativarAcademia(dbh, ator, id, req) {
  const n = await dbh('academias').where({ id }).update({ ativo: true });
  if (!n) throw Erros.naoEncontrado('Academia');
  await registrar(dbh, { academiaId: id, usuarioId: ator.id, acao: 'reativa_academia', entidade: 'academia', entidadeId: id, req });
}

// Visão global (não por tenant) — totais da plataforma + saúde financeira (MRR).
export async function dashboard(dbh) {
  const [{ total_academias }] = await dbh('academias').count({ total_academias: '*' });
  const [{ academias_ativas }] = await dbh('academias').where({ ativo: true }).count({ academias_ativas: '*' });
  const [{ total_alunos }] = await dbh('usuarios').where({ tipo: 'aluno', ativo: true }).count({ total_alunos: '*' });
  // MRR = soma das mensalidades das assinaturas ativas (inadimplente não conta como receita).
  const [{ mrr }] = await dbh('assinaturas as s')
    .join('planos as p', 'p.id', 's.plano_id')
    .where('s.status', 'ativa')
    .sum({ mrr: 'p.preco_mensal_centavos' });
  const [{ inadimplentes }] = await dbh('assinaturas').where({ status: 'inadimplente' }).count({ inadimplentes: '*' });
  const [{ sem_assinatura }] = await dbh('academias as a')
    .leftJoin('assinaturas as s', 's.academia_id', 'a.id')
    .whereNull('s.id')
    .count({ sem_assinatura: '*' });
  return {
    total_academias: Number(total_academias),
    academias_ativas: Number(academias_ativas),
    academias_suspensas: Number(total_academias) - Number(academias_ativas),
    total_alunos: Number(total_alunos),
    mrr_centavos: Number(mrr ?? 0),
    assinaturas_inadimplentes: Number(inadimplentes),
    academias_sem_assinatura: Number(sem_assinatura),
  };
}

// ===================== PLANOS (catálogo da plataforma) =====================
export const listarPlanos = (dbh) => dbh('planos').orderBy('preco_mensal_centavos', 'asc');

export async function criarPlano(dbh, ator, dados, req) {
  const [plano] = await dbh('planos').insert(dados).returning('*');
  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'cria_plano',
    entidade: 'plano',
    entidadeId: plano.id,
    detalhes: dados,
    req,
  });
  return plano;
}

export async function atualizarPlano(dbh, ator, id, dados, req) {
  const [plano] = await dbh('planos').where({ id }).update(dados).returning('*');
  if (!plano) throw Erros.naoEncontrado('Plano');
  await registrar(dbh, {
    academiaId: ator.academia_id,
    usuarioId: ator.id,
    acao: 'edita_plano',
    entidade: 'plano',
    entidadeId: id,
    detalhes: dados,
    req,
  });
  return plano;
}

export async function removerPlano(dbh, ator, id, req) {
  // Plano com assinatura vinculada não pode sumir (quebraria o histórico) — desativa.
  const emUso = await dbh('assinaturas').where({ plano_id: id }).first('id');
  if (emUso) {
    const [plano] = await dbh('planos').where({ id }).update({ ativo: false }).returning('*');
    if (!plano) throw Erros.naoEncontrado('Plano');
    await registrar(dbh, { academiaId: ator.academia_id, usuarioId: ator.id, acao: 'desativa_plano', entidade: 'plano', entidadeId: id, req });
    return { desativado: true };
  }
  const n = await dbh('planos').where({ id }).del();
  if (!n) throw Erros.naoEncontrado('Plano');
  await registrar(dbh, { academiaId: ator.academia_id, usuarioId: ator.id, acao: 'remove_plano', entidade: 'plano', entidadeId: id, req });
  return { desativado: false };
}

// ===================== ASSINATURA DA ACADEMIA =====================
// Cria ou troca a assinatura (upsert: no máximo 1 por academia, UNIQUE no banco).
export async function definirAssinatura(dbh, ator, academiaId, dados, req) {
  const academia = await dbh('academias').where({ id: academiaId }).first('id');
  if (!academia) throw Erros.naoEncontrado('Academia');
  const plano = await dbh('planos').where({ id: dados.plano_id }).first('id', 'ativo');
  if (!plano) throw Erros.naoEncontrado('Plano');

  const [assinatura] = await dbh('assinaturas')
    .insert({ academia_id: academiaId, ...dados })
    .onConflict('academia_id')
    .merge({ ...dados, atualizado_em: dbh.fn.now() })
    .returning('*');

  await registrar(dbh, {
    academiaId,
    usuarioId: ator.id,
    acao: 'define_assinatura',
    entidade: 'assinatura',
    entidadeId: assinatura.id,
    detalhes: dados,
    req,
  });
  return assinatura;
}

// ===================== PAGAMENTOS (manuais, até o Asaas) =====================
export const listarPagamentos = (dbh, academiaId) =>
  dbh('pagamentos').where({ academia_id: academiaId }).orderBy('pago_em', 'desc').limit(60);

export async function registrarPagamento(dbh, ator, academiaId, dados, req) {
  const assinatura = await dbh('assinaturas').where({ academia_id: academiaId }).first('id');
  if (!assinatura) throw Erros.naoEncontrado('Assinatura');

  const { novo_pago_ate, ...pagamento } = dados;
  const [registro] = await dbh('pagamentos')
    .insert({ ...pagamento, assinatura_id: assinatura.id, academia_id: academiaId, registrado_por: ator.id })
    .returning('*');

  if (novo_pago_ate) {
    // Pagamento em dia normaliza o status (se estava inadimplente, volta a ativa).
    await dbh('assinaturas')
      .where({ id: assinatura.id })
      .update({ pago_ate: novo_pago_ate, atualizado_em: dbh.fn.now() })
      .whereNot('status', 'cancelada');
    await dbh('assinaturas').where({ id: assinatura.id, status: 'inadimplente' }).update({ status: 'ativa' });
  }

  await registrar(dbh, {
    academiaId,
    usuarioId: ator.id,
    acao: 'registra_pagamento',
    entidade: 'pagamento',
    entidadeId: registro.id,
    detalhes: dados,
    req,
  });
  return registro;
}
