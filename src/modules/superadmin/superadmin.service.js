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

export async function obterAcademia(dbh, id) {
  const academia = await dbh('academias').where({ id }).first();
  if (!academia) throw Erros.naoEncontrado('Academia');
  const [{ total_alunos }] = await dbh('usuarios')
    .where({ academia_id: id, tipo: 'aluno', ativo: true })
    .count({ total_alunos: '*' });
  const [{ total_staff }] = await dbh('usuarios')
    .where({ academia_id: id })
    .whereIn('tipo', ['gerente', 'recepcao'])
    .count({ total_staff: '*' });
  return { ...academia, total_alunos: Number(total_alunos), total_staff: Number(total_staff) };
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
    .returning('*');

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
  const [academia] = await dbh('academias').where({ id }).update(dados).returning('*');
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

// Visão global (não por tenant) — total de academias/alunos na plataforma inteira.
export async function dashboard(dbh) {
  const [{ total_academias }] = await dbh('academias').count({ total_academias: '*' });
  const [{ academias_ativas }] = await dbh('academias').where({ ativo: true }).count({ academias_ativas: '*' });
  const [{ total_alunos }] = await dbh('usuarios').where({ tipo: 'aluno', ativo: true }).count({ total_alunos: '*' });
  return {
    total_academias: Number(total_academias),
    academias_ativas: Number(academias_ativas),
    academias_suspensas: Number(total_academias) - Number(academias_ativas),
    total_alunos: Number(total_alunos),
  };
}
